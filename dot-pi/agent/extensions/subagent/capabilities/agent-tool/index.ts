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
    promptSnippet: "Launch autonomous sub-agents for complex multi-step tasks",
    promptGuidelines: [
      "Subagents are valuable for parallelizing independent queries or for protecting the main context window from excessive results, but should not be used excessively when not needed. Importantly, avoid duplicating work that subagents are already doing — if you delegate research to a subagent, do not also perform the same searches yourself.",
      "For broad codebase exploration or research, spawn Agent. Otherwise use direct tools (read, grep, find) when the target is already known.",
      "When an agent runs in the background, you will be notified on completion — do not poll or sleep waiting for it. Continue with other work instead.",
      "Trust but verify: an agent's summary describes intent, not outcome. When an agent writes or edits code, check the actual changes before reporting work as done.",
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: "The task for the agent to perform.",
      }),
      description: Type.String({
        description: "A short (3-5 word) description of the task (shown in UI).",
      }),
      model: Type.Optional(
        Type.String({
          description:
            'Optional model override. Accepts "provider/modelId" or a fuzzy short name. Omit to use the parent model.',
        }),
      ),
      thinking: Type.Optional(
        Type.String({
          description: `Thinking level: ${THINKING_LEVELS.join(", ")}. Overrides parent default.`,
        }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description: "Set to true to run in background. Returns agent ID immediately. You will be notified on completion.",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "Optional agent ID to resume from. Continues from previous context.",
        }),
      ),
    }),

    renderCall,
    renderResult,

    execute: (toolCallId, params, signal, onUpdate, ctx) =>
      executeAgentTool(pi, deps, toolCallId, params, signal, onUpdate, ctx),
  }));
}
