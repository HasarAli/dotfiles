/**
 * capabilities/result-tool — the `get_subagent_result` tool.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { SUBAGENT_TOOL_NAMES } from "../../engine/agent-runner.js";
import type { SubagentDeps } from "../../shared/types.js";
import { executeGetResult } from "./execute.js";

export function registerGetResultTool(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAMES.GET_RESULT,
    label: "Get Agent Result",
    description:
      "Check status and retrieve results from a background agent. Use the agent ID returned by Agent with run_in_background.",
    promptSnippet: "Check status and retrieve results from a background agent",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to check.",
      }),
      wait: Type.Optional(
        Type.Boolean({
          description: "If true, wait for the agent to complete before returning. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, include the agent's full conversation (messages + tool calls). Default: false.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, signal, _onUpdate, _ctx) =>
      executeGetResult(deps, params, signal),
  }));
}
