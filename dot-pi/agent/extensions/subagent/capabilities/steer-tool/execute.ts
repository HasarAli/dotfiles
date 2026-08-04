/**
 * execute.ts — steer_subagent tool logic.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { steerAgent } from "../../engine/agent-runner.js";
import { formatLifetimeTokens, textResult } from "../../shared/helpers.js";
import type { SubagentDeps } from "../../shared/types.js";
import { getSessionContextPercent } from "../../shared/usage.js";

export async function executeSteer(
  pi: ExtensionAPI,
  deps: SubagentDeps,
  params: Record<string, any>,
) {
  const { manager } = deps;
  const record = manager.getRecord(params.agent_id);
  if (!record) {
    return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
  }
  if (record.status !== "running") {
    return textResult(`Agent "${params.agent_id}" is not running (status: ${record.status}). Cannot steer a non-running agent.`);
  }
  if (!record.session) {
    if (!record.pendingSteers) record.pendingSteers = [];
    record.pendingSteers.push(params.message);
    pi.events.emit("subagents:steered", { id: record.id, message: params.message });
    return textResult(`Steering message queued for agent ${record.id}. It will be delivered once the session initializes.`);
  }

  try {
    await steerAgent(record.session, params.message);
    pi.events.emit("subagents:steered", { id: record.id, message: params.message });
    const tokens = formatLifetimeTokens(record);
    const contextPercent = getSessionContextPercent(record.session);
    const stateParts: string[] = [];
    if (tokens) stateParts.push(tokens);
    stateParts.push(`${record.toolUses} tool ${record.toolUses === 1 ? "use" : "uses"}`);
    if (contextPercent !== null) stateParts.push(`context ${Math.round(contextPercent)}% full`);
    if (record.compactionCount) stateParts.push(`${record.compactionCount} compaction${record.compactionCount === 1 ? "" : "s"}`);
    return textResult(
      `Steering message sent to agent ${record.id}. The agent will process it after its current tool execution.\n` +
      `Current state: ${stateParts.join(" · ")}`,
    );
  } catch (err) {
    return textResult(`Failed to steer agent: ${err instanceof Error ? err.message : String(err)}`);
  }
}
