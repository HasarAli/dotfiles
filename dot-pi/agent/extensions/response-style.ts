/**
 * response-style — named chat response styles, in the spirit of pi's skills.
 *
 * A style is a markdown file with YAML frontmatter (`name`, `description`,
 * `reminder`, `codeReminder`, `reminderEvery`) and a body split into two H1
 * sections, `# Prose` and `# Code`. `/response-style [name|off]` picks the
 * active style. Prose is appended under `# Communication` behind a guardrail
 * that keeps reasoning, thinking traces, tool calls, and code unstyled; the
 * code section is appended under `# Code` with no guardrail, because it is
 * about code. A body with neither heading is treated as all prose. When the
 * style declares a reminder, it is re-injected as a transient user message
 * every `reminderEvery` LLM calls to hold the model on style. The `context`
 * hook is non-destructive, so reminders never land in the session file.
 *
 * Styles load from the primary user dir, `~/.agents/response-styles/`, and
 * (trusted projects only) `<cwd>/.pi/response-styles/` plus
 * `.agents/response-styles/` in the cwd and each ancestor up to the git root.
 * Later layers override earlier ones by filename; the cwd's own `.pi` loads
 * last, so it outranks any `.agents` layer. Selection resolves session pick >
 * config default > off.
 *
 * Config lives in `<primary user dir>/config.json` as `{"default": "<name>"}`.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  CONFIG_DIR_NAME,
  DynamicBorder,
  getAgentDir,
  parseFrontmatter,
  type CustomEntry,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, type AutocompleteItem, type SelectItem } from "@earendil-works/pi-tui";

const STATE_TYPE = "response-style/state";
const STATUS_KEY = "response-style";
const CONFIG_FILENAME = "config.json";
const OFF = "off";
const DEFAULT_REMINDER_EVERY = 4;

/** Prepended verbatim to the prose section. The code section is exempt by design. */
const GUARDRAIL =
  "Apply this style only when responding to the user in chat. Never apply it to internal reasoning, thinking traces, tool calls, or code.";

interface Style {
  /** Identifier used by the command, config, and session pick. */
  name: string;
  description: string;
  /** Chat voice, injected behind the guardrail. */
  prose: string;
  /** Engineering rules; empty when the style has no code section. */
  code: string;
  /** Empty when the style has no reminder hook. */
  reminder: string;
  /** Code reminder; empty when absent. */
  codeReminder: string;
  /** LLM calls between reminder injections; 0 disables. */
  reminderEvery: number;
}

/** Style name, or null for an explicit off pick. */
interface SessionPick {
  name: string | null;
}

function oneLine(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function readReminderEvery(value: unknown): number {
  if (value === undefined || value === null) return DEFAULT_REMINDER_EVERY;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_EVERY;
  const every = Math.floor(n);
  return every < 1 ? 0 : every;
}

/**
 * Split a body on its `# Prose` and `# Code` H1 markers. Subheadings inside a
 * section (`## Comments`) are content, not boundaries. A body with no markers
 * is all prose, so single-section style files keep working.
 */
function splitSections(body: string): { prose: string; code: string } {
  const marker = /^#[ \t]+(Prose|Code)[ \t]*$/gim;
  const marks: { key: "prose" | "code"; start: number; end: number }[] = [];
  for (let m = marker.exec(body); m !== null; m = marker.exec(body)) {
    marks.push({
      key: m[1]!.toLowerCase() as "prose" | "code",
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  if (marks.length === 0) return { prose: body.trim(), code: "" };

  const sections = { prose: "", code: "" };
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    sections[mark.key] = body.slice(mark.end, marks[i + 1]?.start ?? body.length).trim();
  }
  return sections;
}

/** The guardrail frames the prose; the code section stands on its own. */
function buildInjection(style: Style): string {
  const parts: string[] = [];
  if (style.prose) parts.push(`# Communication\n\n${GUARDRAIL}\n\n${style.prose}`);
  if (style.code) parts.push(`# Code\n\n${style.code}`);
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}\n` : "";
}

function parseStyleFile(fallbackName: string, content: string): { style?: Style; warning?: string } {
  let frontmatter: Record<string, unknown>;
  let body: string;
  try {
    const parsed = parseFrontmatter(content.replace(/^\uFEFF/, ""));
    frontmatter = parsed.frontmatter;
    body = parsed.body;
  } catch {
    return { warning: `response style "${fallbackName}": unparseable frontmatter, skipped` };
  }

  const { prose, code } = splitSections(body.trim());
  if (!prose && !code) return { warning: `response style "${fallbackName}": no prompt body, skipped` };

  const name = oneLine(frontmatter.name) || fallbackName;
  if (name === OFF) return { warning: `response style "${fallbackName}": reserved name "${OFF}", skipped` };

  return {
    style: {
      name,
      description: oneLine(frontmatter.description),
      prose,
      code,
      reminder: oneLine(frontmatter.reminder),
      codeReminder: oneLine(frontmatter.codeReminder),
      reminderEvery: readReminderEvery(frontmatter.reminderEvery),
    },
  };
}

/** The primary user dir; env var is a test seam, normal installs never set it. */
function primaryStylesDir(): string {
  return process.env.PI_RESPONSE_STYLE_DIR ?? join(getAgentDir(), "response-styles");
}

function loadDir(dir: string, into: Map<string, Style>, seen: Set<string>, warnings: string[]): void {
  let files: string[];
  try {
    files = readdirSync(dir).filter((file) => file.endsWith(".md")).sort();
  } catch {
    return; // a missing layer is expected
  }

  for (const file of files) {
    const fallbackName = file.slice(0, -3);
    const full = join(dir, file);
    let real: string;
    try {
      real = realpathSync(full);
    } catch {
      warnings.push(`response style "${fallbackName}": unreadable, skipped`);
      continue;
    }
    if (seen.has(real)) continue; // symlinked layers would otherwise duplicate
    seen.add(real);

    let content: string;
    try {
      content = readFileSync(full, "utf8");
    } catch {
      warnings.push(`response style "${fallbackName}": unreadable, skipped`);
      continue;
    }
    const { style, warning } = parseStyleFile(fallbackName, content);
    if (warning) warnings.push(warning);
    if (style) into.set(style.name, style);
  }
}

function gitRepoRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** `.agents/response-styles` dirs from cwd upward, nearest first. */
function ancestorAgentsDirs(cwd: string): string[] {
  const root = gitRepoRoot(cwd);
  const dirs: string[] = [];
  let dir = resolve(cwd);
  for (;;) {
    dirs.push(join(dir, ".agents", "response-styles"));
    if (root && dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

function loadStyles(ctx?: ExtensionContext): { styles: Style[]; warnings: string[] } {
  const into = new Map<string, Style>();
  const seen = new Set<string>();
  const warnings: string[] = [];

  loadDir(primaryStylesDir(), into, seen, warnings);
  loadDir(join(homedir(), ".agents", "response-styles"), into, seen, warnings);

  if (ctx?.isProjectTrusted()) {
    // An untrusted repo must not shadow a named style the config could resolve to.
    // Reversed so the nearest cwd is the last writer among the ancestor layers.
    for (const dir of ancestorAgentsDirs(ctx.cwd).reverse()) loadDir(dir, into, seen, warnings);
    // The cwd's own `.pi` is the narrowest project scope, so it outranks them all.
    loadDir(join(ctx.cwd, CONFIG_DIR_NAME, "response-styles"), into, seen, warnings);
  }

  return { styles: [...into.values()], warnings };
}

function readDefaultName(dir: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, CONFIG_FILENAME), "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const value = (parsed as Record<string, unknown>).default;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function writeDefaultName(dir: string, name: string): void {
  let config: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dir, CONFIG_FILENAME), "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    // missing or malformed config is replaced
  }
  config.default = name;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, CONFIG_FILENAME), `${JSON.stringify(config, null, 2)}\n`);
}

function isSessionPick(value: unknown): value is SessionPick {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Object.prototype.hasOwnProperty.call(value, "name")) return false;
  const name = (value as Record<string, unknown>).name;
  return name === null || typeof name === "string";
}

function pickerItems(styles: Style[], active: string | null, defaultName: string | undefined): SelectItem[] {
  const items: SelectItem[] = styles.map((style) => ({
    value: style.name,
    label: `${style.name === active ? "● " : ""}${style.name}${style.name === defaultName ? " ★" : ""}`,
    description: style.description,
  }));
  items.push({ value: OFF, label: "Off", description: "No response style" });
  return items;
}

async function showPicker(ctx: ExtensionCommandContext, items: SelectItem[]): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold("Response style")), 1, 0));

    const list = new SelectList(items, Math.min(items.length, 10), {
      selectedPrefix: (t: string) => theme.fg("accent", t),
      selectedText: (t: string) => theme.fg("accent", t),
      description: (t: string) => theme.fg("muted", t),
      scrollInfo: (t: string) => theme.fg("dim", t),
      noMatch: (t: string) => theme.fg("warning", t),
    });
    list.onSelect = (item: SelectItem) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);

    container.addChild(
      new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel   ● active ★ default"), 1, 0),
    );
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}

export default function (pi: ExtensionAPI) {
  const userDir = primaryStylesDir();

  let styles: Style[] = [];
  let active: string | null = null;
  let sessionPick: SessionPick | undefined;
  /** LLM calls seen since the last reminder injection. */
  let callsSinceReminder = 0;

  function styleByName(name: string): Style | undefined {
    return styles.find((style) => style.name === name);
  }

  function refresh(ctx?: ExtensionContext): void {
    try {
      const result = loadStyles(ctx);
      styles = result.styles;
      for (const warning of result.warnings) ctx?.ui.notify(warning, "warning");
    } catch {
      // Discovery must never take down the session.
    }
  }

  function setActive(ctx: ExtensionContext, name: string | null): void {
    if (name !== active) callsSinceReminder = 0;
    active = name;
    ctx.ui.setStatus(STATUS_KEY, name === null ? undefined : (styleByName(name)?.name ?? name));
  }

  function resolve(ctx: ExtensionContext): void {
    if (sessionPick !== undefined) {
      if (sessionPick.name === null) {
        setActive(ctx, null);
        return;
      }
      if (styleByName(sessionPick.name)) {
        setActive(ctx, sessionPick.name);
        return;
      }
      ctx.ui.notify(`Response style "${sessionPick.name}" no longer exists; falling back.`, "warning");
    }

    const defaultName = readDefaultName(userDir);
    if (defaultName !== undefined) {
      if (styleByName(defaultName)) {
        setActive(ctx, defaultName);
        return;
      }
      ctx.ui.notify(`Default response style "${defaultName}" no longer exists.`, "warning");
    }

    setActive(ctx, null);
  }

  function pick(ctx: ExtensionCommandContext, name: string | null): void {
    sessionPick = { name };
    setActive(ctx, name);
    pi.appendEntry(STATE_TYPE, sessionPick);
    ctx.ui.notify(name === null ? "Response style off" : `Response style: ${name}`, "info");
  }

  async function offerDefault(ctx: ExtensionCommandContext, style: Style): Promise<void> {
    if (!(await ctx.ui.confirm("Default style", `Also make "${style.name}" your default?`))) return;
    try {
      writeDefaultName(userDir, style.name);
      ctx.ui.notify(`Default response style: ${style.name}`, "info");
    } catch {
      ctx.ui.notify("Could not save default response style.", "warning");
    }
  }

  pi.registerCommand("response-style", {
    description: "Pick the chat response style (reasoning and code stay unstyled)",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = [OFF, ...styles.map((style) => style.name)].map((value) => ({ value, label: value }));
      const filtered = items.filter((item) => item.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      refresh(ctx);
      resolve(ctx);
      const arg = args.trim();

      if (arg) {
        if (arg === OFF) {
          pick(ctx, null);
          return;
        }
        const style = styleByName(arg);
        if (!style) {
          ctx.ui.notify(
            `Unknown style "${arg}". Available: ${styles.map((s) => s.name).join(", ")}, ${OFF}`,
            "warning",
          );
          return;
        }
        pick(ctx, style.name);
        await offerDefault(ctx, style);
        return;
      }

      const defaultName = readDefaultName(userDir);
      const items = pickerItems(styles, active, defaultName);
      let picked: string | null;

      if (ctx.mode === "tui") {
        picked = await showPicker(ctx, items);
      } else {
        // Non-TUI fallback: plain select over rendered labels. A duplicate label
        // is refused rather than guessed, since it cannot be mapped back safely.
        const labels = items.map((item) => `${item.label} — ${item.description ?? ""}`);
        const choice = await ctx.ui.select("Response style:", labels);
        const first = choice === undefined ? -1 : labels.indexOf(choice);
        if (choice === undefined) {
          picked = null;
        } else if (first === -1 || labels.lastIndexOf(choice) !== first) {
          ctx.ui.notify("That selection matches more than one style; rename one of the duplicates.", "warning");
          picked = null;
        } else {
          picked = items[first]?.value ?? null;
        }
      }

      if (picked === null) {
        ctx.ui.notify("Response style unchanged", "info");
        return;
      }
      if (picked === OFF) {
        pick(ctx, null);
        return;
      }
      const style = styleByName(picked);
      if (!style) return; // styles changed between listing and pick
      pick(ctx, style.name);
      await offerDefault(ctx, style);
    },
  });

  pi.on("before_agent_start", (event) => {
    if (active === null) return;
    const style = styleByName(active);
    if (!style) return;
    return { systemPrompt: event.systemPrompt + buildInjection(style) };
  });

  pi.on("context", (event) => {
    if (active === null) return;
    const style = styleByName(active);
    if (!style || style.reminderEvery < 1) return;
    const reminder = [style.reminder, style.codeReminder].filter(Boolean).join("\n\n");
    if (!reminder) return;

    callsSinceReminder += 1;
    if (callsSinceReminder < style.reminderEvery) return;
    callsSinceReminder = 0;

    const messages = [
      ...event.messages,
      { role: "user" as const, content: [{ type: "text" as const, text: reminder }], timestamp: Date.now() },
    ];
    event.messages = messages;
    return { messages };
  });

  pi.on("session_start", (_event, ctx) => {
    refresh(ctx);
    // Newest pick on the active branch wins; { name: null } is an explicit off.
    sessionPick = ctx.sessionManager
      .getBranch()
      .filter(
        (entry): entry is CustomEntry<SessionPick> =>
          entry.type === "custom" && entry.customType === STATE_TYPE && isSessionPick(entry.data),
      )
      .pop()?.data;
    resolve(ctx);
  });

  pi.on("session_compact", () => {
    // Custom entries can be compaction cut points; re-persist the pick.
    if (sessionPick !== undefined) pi.appendEntry(STATE_TYPE, sessionPick);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  refresh();
}
