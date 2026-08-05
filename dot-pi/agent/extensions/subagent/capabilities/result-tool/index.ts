/**
 * capabilities/result-tool — the `get_subagent_result` tool.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { SUBAGENT_TOOL_NAMES } from "../../engine/agent-runner.js";
import type { SubagentDeps } from "../../shared/types.js";
import { executeGetResult } from "./execute.js";

const resultToolDescription = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "result-tool-description.md"),
  "utf-8",
).trim();

export function registerGetResultTool(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAMES.GET_RESULT,
    label: "Get Agent Result",
    description: resultToolDescription,
    promptSnippet: "Check status or retrieve results from a background agent",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The background agent ID returned by the Agent tool when run_in_background is true.",
      }),
      wait: Type.Optional(
        Type.Boolean({
          description: "If true, block until the agent completes or fails, then return its final status and result. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, also include the agent's full conversation (messages and tool calls). Default: false; enable only when you need a detailed trace, as this can be large.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, signal, _onUpdate, _ctx) =>
      executeGetResult(deps, params, signal),
  }));
}
