/**
 * format.ts — renderer body for the "subagent-notification" custom message
 * type, plus the small formatting helpers it depends on.
 *
 * The core text-formatting pure functions (escapeXml, getStatusLabel,
 * formatTaskNotification, buildNotificationDetails) live in shared/helpers.ts
 * since other capabilities (agent-tool, nudge) need them too. This file only
 * holds the renderer itself, which is unique to this capability.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTokens } from "../../shared/helpers.js";
import type { NotificationDetails } from "../../shared/types.js";
import { formatMs, formatTurns } from "../../ui/agent-widget.js";

export function renderNotification(
  message: { details?: NotificationDetails },
  { expanded }: { expanded: boolean },
  theme: Theme,
) {
  const d = message.details;
  if (!d) return undefined;

  function renderOne(d: NotificationDetails): string {
    const isError = d.status === "error" || d.status === "stopped" || d.status === "aborted";
    const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
    const statusText = isError ? d.status
      : d.status === "steered" ? "completed (steered)"
      : "completed";

    let line = `${icon} ${theme.bold(d.description)} ${theme.fg("dim", statusText)}`;

    const parts: string[] = [];
    if (d.turnCount > 0) parts.push(formatTurns(d.turnCount, d.maxTurns));
    if (d.toolUses > 0) parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
    if (d.totalTokens > 0) parts.push(formatTokens(d.totalTokens));
    if (d.durationMs > 0) parts.push(formatMs(d.durationMs));
    if (parts.length) {
      line += "\n  " + parts.map(p => theme.fg("dim", p)).join(" " + theme.fg("dim", "·") + " ");
    }

    if (expanded) {
      const lines = d.resultPreview.split("\n").slice(0, 30);
      for (const l of lines) line += "\n" + theme.fg("dim", `  ${l}`);
    } else {
      const preview = d.resultPreview.split("\n")[0]?.slice(0, 80) ?? "";
      line += "\n  " + theme.fg("dim", `⎿  ${preview}`);
    }

    if (d.outputFile) {
      line += "\n  " + theme.fg("muted", `transcript: ${d.outputFile}`);
    }

    return line;
  }

  const all = [d, ...(d.others ?? [])];
  return new Text(all.map(renderOne).join("\n"), 0, 0);
}
