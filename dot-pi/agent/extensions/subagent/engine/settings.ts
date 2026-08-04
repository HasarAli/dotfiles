/**
 * settings.ts — In-memory runtime settings shared by every capability.
 *
 * No persistence (no subagents.json) — just process-lifetime state with
 * getter/setter pairs, created once in index.ts and handed out via deps.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { WidgetMode } from "../shared/types.js";

export interface SubagentSettings {
  getWidgetMode(): WidgetMode;
  setWidgetMode(m: WidgetMode): void;
  isFleetViewEnabled(): boolean;
  setFleetViewEnabled(b: boolean): void;
  getOutputTranscriptDefault(): boolean;
  setOutputTranscript(b: boolean): void;
  notifyApplied(ctx: ExtensionCommandContext, msg: string): void;
}

export interface SettingsHooks {
  /** Called after widget mode changes, so the caller can re-render the widget. */
  onWidgetModeChange?: () => void;
  /** Called after fleet-view toggles, so the caller can enable/disable the fleet list. */
  onFleetViewChange?: (enabled: boolean) => void;
}

/**
 * Creates the in-memory settings bag. The hooks let index.ts react to
 * setting changes (re-render the widget, toggle the fleet list) without
 * settings.ts needing to know about the widget/fleet classes themselves.
 */
export function createSettings(hooks: SettingsHooks = {}): SubagentSettings {
  let widgetMode: WidgetMode = "background";
  let fleetViewEnabled = true;
  let outputTranscriptDefault = true;

  return {
    getWidgetMode: () => widgetMode,
    setWidgetMode: (m: WidgetMode) => {
      widgetMode = m;
      hooks.onWidgetModeChange?.();
    },
    isFleetViewEnabled: () => fleetViewEnabled,
    setFleetViewEnabled: (b: boolean) => {
      fleetViewEnabled = b;
      hooks.onFleetViewChange?.(b);
    },
    getOutputTranscriptDefault: () => outputTranscriptDefault,
    setOutputTranscript: (b: boolean) => {
      outputTranscriptDefault = b;
    },
    notifyApplied: (ctx: ExtensionCommandContext, msg: string) => {
      ctx.ui.notify(msg, "info");
    },
  };
}
