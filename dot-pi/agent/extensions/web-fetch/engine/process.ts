/**
 * Content-type dispatch: extractors never fetch, never receive a URL.
 * HTML → defuddle (node child, stdin only), PDF → pdftotext (optionally a page
 * spec), JSON/text → passthrough.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXTRACT_TIMEOUT_MS, MAX_MODULE_LOOKUP_DEPTH } from "../shared/config.js";

export type ProcessOutcome =
  | { kind: "ok"; title: string; text: string }
  | { kind: "empty" }
  | { kind: "unsupported_type"; type: string }
  | { kind: "missing_tool"; tool: string }
  | { kind: "bad_pages" };

export async function processContent(
  contentType: string,
  raw: Buffer,
  url: string,
  signal?: AbortSignal,
  pages?: string,
): Promise<ProcessOutcome> {
  const type = (contentType.split(";")[0] || "").trim().toLowerCase();
  if (type === "text/html" || type === "application/xhtml+xml") return processHtml(raw, url, signal);
  // Static hosts (e.g. GitHub raw) serve PDFs as octet-stream — sniff for the
  // magic bytes so a real binary is not misdiagnosed as an empty PDF.
  if (type === "application/pdf" || (type === "application/octet-stream" && isPdf(raw))) {
    return processPdf(raw, signal, pages);
  }
  if (type === "application/json" || type.startsWith("text/")) {
    return { kind: "ok", title: titleFromUrl(url), text: decode(raw, contentType) };
  }
  return { kind: "unsupported_type", type: contentType || "unknown" };
}

function isPdf(raw: Buffer): boolean {
  return raw.length >= 5 && raw.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Runtime discovery: the loader bundles extensions, so paths cannot be import-time resolved. */
function defuddleCliPath(): string {
  const fromEnv = process.env.DEFUDDLE_CLI;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  for (const rel of [
    join("dot-pi", "agent", "npm", "node_modules", "defuddle", "dist", "cli.js"),
    join("node_modules", "defuddle", "dist", "cli.js"),
  ]) {
    const found = findUp(process.cwd(), rel);
    if (found) return found;
  }
  throw new Error("defuddle not found — run: npm --prefix dot-pi/agent/npm install defuddle (or set DEFUDDLE_CLI)");
}

function findUp(start: string, rel: string): string | undefined {
  let dir = start;
  for (let i = 0; i < MAX_MODULE_LOOKUP_DEPTH; i++) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

async function processHtml(raw: Buffer, url: string, signal?: AbortSignal): Promise<ProcessOutcome> {
  const cli = defuddleCliPath();
  const res = await runNode(cli, ["parse", "-", "--md", "--json"], decode(raw, "text/html"), signal);
  if (!res.ok) return { kind: "empty" };
  try {
    const data = JSON.parse(res.stdout) as { content?: string; contentMarkdown?: string; title?: string };
    const text = (data.contentMarkdown || data.content || "").trim();
    if (!text) return { kind: "empty" };
    const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : titleFromUrl(url);
    return { kind: "ok", title, text };
  } catch {
    return { kind: "empty" };
  }
}

// PDF: pdftotext, optionally a page spec.

/** '1-5' | '2,7-9' → inclusive 1-based page ranges; null when the spec is malformed. */
function pageSegments(spec: string): Array<[number, number]> | null {
  const segments: Array<[number, number]> = [];
  for (const part of spec.split(",")) {
    const m = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part.trim());
    if (!m) return null;
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    if (end < start) return null;
    segments.push([start, end]);
  }
  return segments;
}

async function processPdf(raw: Buffer, signal?: AbortSignal, pages?: string): Promise<ProcessOutcome> {
  const segments = pages !== undefined ? pageSegments(pages) : undefined;
  if (pages !== undefined && segments === null) return { kind: "bad_pages" };

  const runs: Array<Array<string>> = segments
    ? segments.map(([first, last]) => ["-layout", "-f", String(first), "-l", String(last), "-", "-"])
    : [["-layout", "-", "-"]];

  const chunks: string[] = [];
  for (const args of runs) {
    const res = await runChild("pdftotext", args, raw, signal);
    if (res.missing) return { kind: "missing_tool", tool: "pdftotext" };
    if (!res.ok) return { kind: "empty" };
    chunks.push(res.stdout.trim());
  }
  const text = chunks.filter(Boolean).join("\n\n");
  if (!text) return { kind: "empty" };
  return { kind: "ok", title: "", text };
}

interface ChildOutcome {
  ok: boolean;
  missing?: boolean;
  stdout: string;
  stderr: string;
}

function runNode(script: string, args: string[], stdinText: string, signal?: AbortSignal): Promise<ChildOutcome> {
  return runChild(process.execPath, [script, ...args], Buffer.from(stdinText), signal);
}

function runChild(bin: string, args: string[], stdin: Buffer, signal?: AbortSignal): Promise<ChildOutcome> {
  return new Promise((resolve, reject) => {
    const timeout = AbortSignal.timeout(EXTRACT_TIMEOUT_MS);
    const s = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], signal: s });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (out += d));
    child.stderr.on("data", (d: string) => (err += d));
    child.once("error", (e) => {
      if (s.aborted) reject(new DOMException("aborted", "AbortError"));
      else resolve({ ok: false, missing: (e as { code?: string }).code === "ENOENT", stdout: out, stderr: err });
    });
    child.once("close", (code) => {
      if (s.aborted) reject(new DOMException("aborted", "AbortError"));
      else resolve({ ok: code === 0, stdout: out, stderr: err });
    });
    child.stdin.end(stdin);
  });
}

function decode(raw: Buffer, contentType: string): string {
  const m = /charset=([^;]+)/i.exec(contentType);
  const charset = m ? m[1].trim().replace(/^"|"$/g, "") : "utf-8";
  try {
    return new TextDecoder(charset).decode(raw);
  } catch {
    return new TextDecoder("utf-8").decode(raw);
  }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
}
