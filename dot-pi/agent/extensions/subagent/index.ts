/**
 * Autonomous sub-agents for pi.
 *
 * Tools:
 *   Agent               — Spawn a sub-agent
 *   get_subagent_result — Check background agent status/result
 *   steer_subagent      — Send a steering message to a running agent
 *
 * Commands:
 *   /agents — Interactive agent management menu
 *
 * This file is the composition root: it wires the engine (AgentManager),
 * the ui (AgentWidget / FleetList), the nudge scheduler, and every
 * capability together. Nothing else in this extension imports index.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentTool } from "./capabilities/agent-tool/index.js";
import { registerAgentsCommand } from "./capabilities/agents-command/index.js";
import { registerNotificationRenderer } from "./capabilities/notification/index.js";
import { createNudgeScheduler } from "./capabilities/nudge/index.js";
import { registerGetResultTool } from "./capabilities/result-tool/index.js";
import { registerSteerTool } from "./capabilities/steer-tool/index.js";
import { AgentManager } from "./engine/agent-manager.js";
import { createSettings } from "./engine/settings.js";
import { getLifetimeTotal } from "./shared/usage.js";
import type { AgentActivity, UICtx } from "./ui/agent-widget.js";
import { AgentWidget } from "./ui/agent-widget.js";
import { FleetList, type FleetUICtx } from "./ui/fleet-list.js";
import type { SubagentDeps } from "./shared/types.js";

export default function (pi: ExtensionAPI) {
  // ---- Widget + Fleet forward references (see "avoid circular reference") ----
  let widget: AgentWidget;
  let fleet: FleetList;

  // ---- Agent activity tracking ----
  const agentActivity = new Map<string, AgentActivity>();

  // ---- Settings (in-memory; no persistence) ----
  const settings = createSettings({
    onWidgetModeChange: () => widget.update(),
    onFleetViewChange: (enabled) => fleet.setEnabled(enabled),
  });

  // ---- Nudge scheduling (batched completion notifications) ----
  const nudge = createNudgeScheduler(pi, agentActivity, {
    getWidget: () => widget,
    getFleet: () => fleet,
  });

  // ---- Manager (background execution, resume, queueing) ----
  const manager = new AgentManager((record) => {
    const isError = record.status === "error" || record.status === "stopped" || record.status === "aborted";
    const durationMs = record.completedAt ? record.completedAt - record.startedAt : Date.now() - record.startedAt;
    const u = record.lifetimeUsage;
    const total = getLifetimeTotal(u);
    const tokens = total > 0
      ? { input: u.input, output: u.output, total }
      : undefined;
    const eventData = {
      id: record.id,
      description: record.description,
      result: record.result,
      error: record.error,
      status: record.status,
      toolUses: record.toolUses,
      durationMs,
      tokens,
    };

    if (isError) {
      pi.events.emit("subagents:failed", eventData);
    } else {
      pi.events.emit("subagents:completed", eventData);
    }

    pi.appendEntry("subagents:record", {
      id: record.id, description: record.description,
      status: record.status, result: record.result, error: record.error,
      startedAt: record.startedAt, completedAt: record.completedAt,
    });

    if (record.resultConsumed) {
      agentActivity.delete(record.id);
      widget.markFinished(record.id);
      fleet.onAgentFinished(record.id);
      widget.update();
      return;
    }

    nudge.sendIndividualNudge(record);
    widget.update();
  }, undefined, (record) => {
    pi.events.emit("subagents:started", {
      id: record.id,
      description: record.description,
    });
  }, (record, info) => {
    pi.events.emit("subagents:compacted", {
      id: record.id,
      description: record.description,
      reason: info.reason,
      tokensBefore: info.tokensBefore,
      compactionCount: record.compactionCount,
    });
  });

  // ---- Widget + Fleet (assign the forward references now that manager exists) ----
  widget = new AgentWidget(manager, agentActivity, settings.getWidgetMode);
  fleet = new FleetList(manager, agentActivity);

  // ---- Custom notification renderer ----
  registerNotificationRenderer(pi);

  // ---- Shared dependency bag handed to every capability ----
  const deps: SubagentDeps = {
    manager,
    widget,
    fleet,
    agentActivity,
    cancelNudge: nudge.cancelNudge,
    sendIndividualNudge: nudge.sendIndividualNudge,
    QUEUE_WAIT_POLL_MS: nudge.QUEUE_WAIT_POLL_MS,
    getWidgetMode: settings.getWidgetMode,
    setWidgetMode: settings.setWidgetMode,
    isFleetViewEnabled: settings.isFleetViewEnabled,
    setFleetViewEnabled: settings.setFleetViewEnabled,
    getOutputTranscriptDefault: settings.getOutputTranscriptDefault,
    setOutputTranscript: settings.setOutputTranscript,
    notifyApplied: settings.notifyApplied,
  };

  // ---- Lifecycle hooks ----
  pi.on("session_start", async (_event, _ctx) => {
    manager.clearCompleted(true);
  });

  pi.on("session_before_switch", () => {
    manager.clearCompleted(true);
  });

  pi.on("session_shutdown", async () => {
    manager.abortAll();
    nudge.dispose();
    fleet.dispose();
    manager.dispose();
  });

  // Grab UI context from first tool execution + clear lingering widget on new turn
  pi.on("tool_execution_start", async (_event, ctx) => {
    widget.setUICtx(ctx.ui as UICtx);
    fleet.setUICtx(ctx.ui as unknown as FleetUICtx);
    widget.onTurnStart();
  });

  // ---- Register capability surfaces ----
  registerAgentTool(pi, deps);
  registerGetResultTool(pi, deps);
  registerSteerTool(pi, deps);
  registerAgentsCommand(pi, deps);
}
