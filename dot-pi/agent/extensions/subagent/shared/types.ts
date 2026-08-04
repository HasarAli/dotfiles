/**
 * types.ts — Type definitions for the subagent system.
 */

import type { AgentSession, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
import type { AgentManager } from "../engine/agent-manager.js";
import type { AgentActivity, AgentWidget } from "../ui/agent-widget.js";
import type { FleetList } from "../ui/fleet-list.js";
import type { LifetimeUsage } from "./usage.js";

export type { ThinkingLevel };

/** Display mode for the persistent above-editor agent widget. */
export type WidgetMode = 'all' | 'background' | 'off';

export interface AgentRecord {
  id: string;
  description: string;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error";
  result?: string;
  error?: string;
  toolUses: number;
  startedAt: number;
  completedAt?: number;
  session?: AgentSession;
  abortController?: AbortController;
  promise?: Promise<string>;
  /** Set when result was already consumed via get_subagent_result — suppresses completion notification. */
  resultConsumed?: boolean;
  /** Steering messages queued before the session was ready. */
  pendingSteers?: string[];
  /** The tool_use_id from the original Agent tool call. */
  toolCallId?: string;
  /** Path to the streaming output transcript file. */
  outputFile?: string;
  /** Cleanup function for the output file stream subscription. */
  outputCleanup?: () => void;
  /** Lifetime usage breakdown, accumulated via message_end events. */
  lifetimeUsage: LifetimeUsage;
  /** Number of times this agent's session has compacted. */
  compactionCount: number;
  /** Whether this agent was spawned to run in the background. */
  isBackground?: boolean;
}

/** Details attached to custom notification messages for visual rendering. */
export interface NotificationDetails {
  id: string;
  description: string;
  status: string;
  toolUses: number;
  turnCount: number;
  maxTurns?: number;
  totalTokens: number;
  durationMs: number;
  outputFile?: string;
  error?: string;
  resultPreview: string;
  /** Additional agents in a group notification. */
  others?: NotificationDetails[];
}

/**
 * Shared dependency bag passed into every capability's `register*(pi, deps)`
 * entry point. Assembled once in index.ts (the composition root) so that
 * capabilities never need to know how the engine/ui pieces were wired up.
 */
export interface SubagentDeps {
  manager: AgentManager;
  widget: AgentWidget;
  fleet: FleetList;
  agentActivity: Map<string, AgentActivity>;
  cancelNudge: (id: string) => void;
  sendIndividualNudge: (record: AgentRecord) => void;
  QUEUE_WAIT_POLL_MS: number;
  getWidgetMode: () => WidgetMode;
  setWidgetMode: (m: WidgetMode) => void;
  isFleetViewEnabled: () => boolean;
  setFleetViewEnabled: (b: boolean) => void;
  getOutputTranscriptDefault: () => boolean;
  setOutputTranscript: (b: boolean) => void;
  notifyApplied: (ctx: ExtensionCommandContext, msg: string) => void;
}
