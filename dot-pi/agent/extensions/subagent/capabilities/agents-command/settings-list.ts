/**
 * settings-list.ts — buildItems / applyValue for the Settings sub-menu.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import type { SubagentDeps, WidgetMode } from "../../shared/types.js";

export function buildItems(deps: SubagentDeps): SettingItem[] {
  const mc = deps.manager.getMaxConcurrent();
  return [
    {
      id: "maxConcurrent",
      label: "Max concurrency",
      description: "Max concurrent background agents (Enter to type)",
      currentValue: String(mc),
      values: [String(mc)],
    },
    {
      id: "outputTranscript",
      label: "Output transcript",
      description: "Write each subagent's .output transcript by default.",
      currentValue: deps.getOutputTranscriptDefault() ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "fleetView",
      label: "Fleet view",
      description: "Navigable main+subagents list below the editor (↓/← to navigate, Enter to view)",
      currentValue: deps.isFleetViewEnabled() ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "widgetMode",
      label: "Widget",
      description: "Above-editor agent widget: all = every agent; background = hide foreground; off = hide.",
      currentValue: deps.getWidgetMode(),
      values: ["all", "background", "off"],
    },
  ];
}

export function applyValue(
  deps: SubagentDeps,
  ctx: ExtensionCommandContext,
  id: string,
  value: string,
): void {
  if (id === "maxConcurrent") {
    const n = parseInt(value, 10);
    if (n >= 1) {
      deps.manager.setMaxConcurrent(n);
      deps.notifyApplied(ctx, `Max concurrency set to ${n}`);
    }
  } else if (id === "outputTranscript") {
    const enabled = value === "on";
    deps.setOutputTranscript(enabled);
    deps.notifyApplied(ctx, `Output transcript ${enabled ? "enabled" : "disabled"} by default`);
  } else if (id === "fleetView") {
    const enabled = value === "on";
    deps.setFleetViewEnabled(enabled);
    deps.notifyApplied(ctx, `Fleet view ${enabled ? "enabled" : "disabled"}`);
  } else if (id === "widgetMode") {
    deps.setWidgetMode(value as WidgetMode);
    deps.notifyApplied(ctx, `Widget set to ${value}`);
  }
}
