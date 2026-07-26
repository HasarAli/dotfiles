/**
 * status-footer — custom pi footer (always-on, replaces built-in)
 *
 * Layout:  ~/…/repo  (main *+%)  ↑1.2k ↓3.4k R:5k W:2k  $0.042  model
 *
 * Git status mirrors shell __git_ps1 format:
 *   *  = unstaged     +  = staged    %  = untracked
 *   >  = ahead        <  = behind    <> = diverged
 *   #  = conflicted
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { execSync } from "child_process";

export default function (pi: ExtensionAPI) {
  // ── cached git state (bounded staleness) ────────────────────────────
  let gitCache: { cwd: string; status: string; ts: number } = {
    cwd: "",
    status: "",
    ts: 0,
  };
  const GIT_TTL = 2000; // ms before re-checking

  function getShortCwd(cwd: string): string {
    return cwd.split("/").pop() || cwd;
  }

  function getBranchAndStatus(cwd: string): string {
    try {
      const out = execSync(
        "git status --porcelain=v2 --branch 2>/dev/null",
        { cwd, encoding: "utf-8", timeout: 2000, stdio: "pipe" },
      ).trim();
      if (!out) return "";

      let staged = 0,
        unstaged = 0,
        untracked = 0,
        conflicted = 0;
      let ahead = 0,
        behind = 0;
      let branch = "";

      for (const line of out.split("\n")) {
        if (line.startsWith("# branch.head ")) {
          branch = line.slice(14).trim();
        } else if (line.startsWith("# branch.ab ")) {
          const m = line.match(/[+-](\d+)/g);
          if (m) {
            ahead = parseInt(m[0]?.slice(1) || "0");
            behind = parseInt(m[1]?.slice(1) || "0");
          }
        } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
          const XY = line[3];
          const workXY = line[4];
          if (XY !== "." && XY !== " ") staged++;
          if (workXY !== "." && workXY !== " ") unstaged++;
        } else if (line.startsWith("u ")) {
          conflicted++;
        } else if (line.startsWith("?")) {
          untracked++;
        }
      }

      let s = "";
      if (conflicted) s += "#";
      if (staged) s += "+";
      if (unstaged) s += "*";
      if (untracked) s += "%";
      if (ahead && behind) s += "<>";
      else if (ahead) s += ">";
      else if (behind) s += "<";

      if (!branch || branch.startsWith("(")) {
        try {
          const hash = execSync("git rev-parse --short HEAD 2>/dev/null", {
            cwd,
            encoding: "utf-8",
            timeout: 1000,
            stdio: "pipe",
          }).trim();
          branch = hash || "?";
        } catch {
          branch = "?";
        }
      }

      return s ? ` ${branch}${s}` : ` ${branch}`;
    } catch {
      return "";
    }
  }

  function gitStatusFor(cwd: string): string {
    const now = Date.now();
    if (gitCache.cwd === cwd && now - gitCache.ts < GIT_TTL) {
      return gitCache.status;
    }
    const status = getBranchAndStatus(cwd);
    gitCache = { cwd, status, ts: now };
    return status;
  }

  // ── token / cost helpers ────────────────────────────────────────────
  function aggregateUsage(ctx: any) {
    let input = 0,
      output = 0,
      cacheRead = 0,
      cacheWrite = 0,
      cost = 0;
    const branch = ctx.sessionManager.getBranch();
    if (branch) {
      for (const e of branch) {
        if (e.type === "message" && (e.message as AssistantMessage).role === "assistant") {
          const m = e.message as AssistantMessage;
          if (m.usage) {
            input += m.usage.input || 0;
            output += m.usage.output || 0;
            cacheRead += m.usage.cacheRead || 0;
            cacheWrite += m.usage.cacheWrite || 0;
            cost += m.usage.cost?.total || 0;
          }
        }
      }
    }
    return { input, output, cacheRead, cacheWrite, cost };
  }

  const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
  const fmtCost = (n: number) => {
    if (n < 0.001) return `$${(n * 1000).toFixed(1)}m`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(3)}`;
  };

  // ── always-on footer ────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsub();
        },
        invalidate() {},
        render(width: number): string[] {
          const cwd = ctx.cwd || process.cwd();
          const stats = aggregateUsage(ctx);
          const model = ctx.model?.id || "no-model";

          const left = theme.fg("dim", getShortCwd(cwd));
          const gitStr = gitStatusFor(cwd);
          const mid = gitStr ? theme.fg("dim", gitStr) : "";

          const tokens = `↑${fmt(stats.input)} ↓${fmt(stats.output)}`;
          const cache =
            stats.cacheRead || stats.cacheWrite
              ? ` R:${fmt(stats.cacheRead)} W:${fmt(stats.cacheWrite)}`
              : "";
          const right = theme.fg(
            "dim",
            `${tokens}${cache} ${fmtCost(stats.cost)}  ${model}`,
          );

          const midWidth = mid ? visibleWidth(mid) + 1 : 0;
          const gap = " ".repeat(
            Math.max(1, width - visibleWidth(left) - midWidth - visibleWidth(right)),
          );

          return [truncateToWidth(
            left + (mid ? ` ${mid}` : "") + gap + right,
            width,
          )];
        },
      };
    });
  });
}
