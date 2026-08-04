/**
 * execute.ts — get_subagent_result tool logic.
 */

import { abortable, formatLifetimeTokens, partialOutputSuffix, textResult } from "../../shared/helpers.js";
import { getStatusNote } from "../../shared/status-note.js";
import type { SubagentDeps } from "../../shared/types.js";
import { getSessionContextPercent } from "../../shared/usage.js";
import { formatDuration } from "../../ui/agent-widget.js";
import { getAgentConversation } from "../../engine/agent-runner.js";

export async function executeGetResult(
  deps: SubagentDeps,
  params: Record<string, any>,
  signal: AbortSignal | undefined,
) {
  const { manager, cancelNudge, QUEUE_WAIT_POLL_MS } = deps;
  const record = manager.getRecord(params.agent_id);
  if (!record) {
    return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
  }

  if (params.wait && (record.status === "running" || record.status === "queued")) {
    while (record.status === "queued") {
      await abortable(
        new Promise<void>((resolve) => setTimeout(resolve, QUEUE_WAIT_POLL_MS)),
        signal,
      );
    }
    if (record.promise) await abortable(record.promise, signal);
  }

  const duration = formatDuration(record.startedAt, record.completedAt);
  const tokens = formatLifetimeTokens(record);
  const contextPercent = getSessionContextPercent(record.session);
  const statsParts = [`Tool uses: ${record.toolUses}`];
  if (tokens) statsParts.push(tokens);
  if (contextPercent !== null) statsParts.push(`Context: ${Math.round(contextPercent)}%`);
  if (record.compactionCount) statsParts.push(`Compactions: ${record.compactionCount}`);
  statsParts.push(`Duration: ${duration}`);

  let output =
    `Agent: ${record.id}\n` +
    `Status: ${record.status}${getStatusNote(record.status)} | ${statsParts.join(" | ")}\n` +
    `Description: ${record.description}\n\n`;

  if (record.status === "running") {
    output += "Agent is still running. Use wait: true or check back later.";
  } else if (record.status === "error") {
    output += `Error: ${record.error}${partialOutputSuffix(record)}`;
  } else {
    output += record.result?.trim() || "No output.";
  }

  if (record.status !== "running" && record.status !== "queued") {
    record.resultConsumed = true;
    cancelNudge(params.agent_id);
  }

  if (params.verbose && record.session) {
    const conversation = getAgentConversation(record.session);
    if (conversation) {
      output += `\n\n--- Agent Conversation ---\n${conversation}`;
    }
  }

  return textResult(output);
}
