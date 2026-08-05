/**
 * capabilities/agent-tool — the `Agent` tool: spawn/resume/steer-free subagents.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { THINKING_LEVELS } from "../../shared/helpers.js";
import type { SubagentDeps } from "../../shared/types.js";
import { SUBAGENT_TOOL_NAMES } from "../../engine/agent-runner.js";
import { executeAgentTool } from "./execute.js";
import { renderCall, renderResult } from "./render.js";

const agentToolDescription = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "agent-tool-description.md"),
  "utf-8",
).trim();

export function registerAgentTool(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAMES.AGENT,
    label: "Agent",
    description: agentToolDescription,
    promptSnippet: "Launch or resume an autonomous agent",
    promptGuidelines: [
      "Delegate complex, multi-step, or context-heavy tasks to Agent.",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description:
          "Self-contained task brief. The agent does not see this conversation, so restate the goal, relevant context and findings so far, constraints, and any key files or resources. Avoid one-line command-style prompts.",
      }),
      description: Type.String({
        description: "3–5 word task label shown in the UI.",
      }),
      model: Type.Optional(
        Type.String({
          description:
            'Optional model override. Must be exact "provider/modelId". Omit to use the parent model.',
        }),
      ),
      thinking: Type.Optional(
        Type.String({
          description: `Thinking level: ${THINKING_LEVELS.join(", ")}. Overrides parent default.`,
        }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description:
            "If true, run the agent in the background and return its ID immediately instead of waiting for results (use `get_subagent_result` with the returned ID to retrieve output).",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "The agent ID of a previously launched background agent to resume.",
        }),
      ),
    }),

    renderCall,
    renderResult,

    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      executeAgentTool(pi, deps, toolCallId, params, signal, onUpdate, ctx),
  }));
}
