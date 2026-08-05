/**
 * capabilities/steer-tool — the `steer_subagent` tool.
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
import { executeSteer } from "./execute.js";

const steerToolDescription = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "steer-tool-description.md"),
  "utf-8",
).trim();

export function registerSteerTool(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAMES.STEER,
    label: "Steer Agent",
    description: steerToolDescription,
    promptSnippet: "Send a steering message to a running background agent",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID of the background agent to steer.",
      }),
      message: Type.String({
        description:
          "The steering message to send, written as if from the original user. It will appear as a user message in the agent's conversation.",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) =>
      executeSteer(pi, deps, params),
  }));
}
