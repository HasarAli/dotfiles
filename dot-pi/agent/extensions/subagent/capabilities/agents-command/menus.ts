/**
 * menus.ts — showAgentsMenu, showRunningAgents, showSettings.
 */

import { getSettingsListTheme, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Spacer, Text } from "@earendil-works/pi-tui";
import type { SubagentDeps } from "../../shared/types.js";
import { formatDuration } from "../../ui/agent-widget.js";
import { viewAgentConversation } from "./conversation.js";
import { applyValue, buildItems } from "./settings-list.js";

export async function showAgentsMenu(ctx: ExtensionCommandContext, deps: SubagentDeps): Promise<void> {
  const agents = deps.manager.listAgents();
  const options: string[] = [];

  if (agents.length > 0) {
    const running = agents.filter(a => a.status === "running" || a.status === "queued").length;
    const done = agents.filter(a => a.status === "completed" || a.status === "steered").length;
    options.push(`Running agents (${agents.length}) — ${running} running, ${done} done`);
  }

  options.push("Settings");

  if (agents.length === 0) {
    ctx.ui.notify("No agents running. Agents are spawned via the Agent tool.", "info");
  }

  const choice = await ctx.ui.select("Agents", options);
  if (!choice) return;

  if (choice.startsWith("Running agents (")) {
    await showRunningAgents(ctx, deps);
    await showAgentsMenu(ctx, deps);
  } else if (choice === "Settings") {
    await showSettings(ctx, deps);
    await showAgentsMenu(ctx, deps);
  }
}

export async function showRunningAgents(ctx: ExtensionCommandContext, deps: SubagentDeps): Promise<void> {
  const agents = deps.manager.listAgents();
  if (agents.length === 0) {
    ctx.ui.notify("No agents.", "info");
    return;
  }

  const options = agents.map(a => {
    const dur = formatDuration(a.startedAt, a.completedAt);
    return `Agent (${a.description}) · ${a.toolUses} tools · ${a.status} · ${dur}`;
  });

  const choice = await ctx.ui.select("Running agents", options);
  if (!choice) return;

  const idx = options.indexOf(choice);
  if (idx < 0) return;
  const record = agents[idx];

  await viewAgentConversation(ctx, deps, record);
  await showRunningAgents(ctx, deps);
}

export async function showSettings(ctx: ExtensionCommandContext, deps: SubagentDeps): Promise<void> {
  let list: SettingsList;
  let currentIndex = 0;

  const result = await ctx.ui.custom<string | undefined>((_tui, _theme, _kb, done) => {
    const items: SettingItem[] = buildItems(deps);

    list = new SettingsList(
      items,
      items.length + 2,
      getSettingsListTheme(),
      (id, newValue) => {
        applyValue(deps, ctx, id, newValue);
      },
      () => done(undefined as undefined),
    );

    const container = new Container();
    container.addChild(new Text("⚙  Subagent Settings", 0, 0));
    container.addChild(new Spacer(1));
    container.addChild(list);

    return {
      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        const handled = list.handleInput?.(data);
        // Track selection via up/down so Enter applies immediately
        if (handled) {
          // Re-read after every input — SettingsList mutates internally
          const newItems = list.getItems?.();
          if (newItems) {
            const newIdx = newItems.findIndex((it: any) => it.selected);
            if (newIdx >= 0) currentIndex = newIdx;
          }
        }
        return handled;
      },
    };
  });

  if (result === undefined) return; // Esc
}
