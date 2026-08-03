/**
 * types.ts — Type definitions for the pruned subagent system.
 * Forked from @tintinweb/pi-subagents, stripped of agent type registry,
 * scheduling, worktree, memory, cross-extension RPC, and group join.
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-ai";
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
