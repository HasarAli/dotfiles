/**
 * capabilities/steer-tool — the `steer_subagent` tool.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { SUBAGENT_TOOL_NAMES } from "../../engine/agent-runner.js";
import type { SubagentDeps } from "../../shared/types.js";
import { executeSteer } from "./execute.js";

export function registerSteerTool(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAMES.STEER,
    label: "Steer Agent",
    description:
      "Send a steering message to a running agent. The message will interrupt the agent after its current tool execution " +
      "and be injected into its conversation, allowing you to redirect its work mid-run. Only works on running agents.",
    promptSnippet: "Send a steering message to redirect a running background agent",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to steer (must be currently running).",
      }),
      message: Type.String({
        description: "The steering message to send. This will appear as a user message in the agent's conversation.",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) =>
      executeSteer(pi, deps, params),
  }));
}
