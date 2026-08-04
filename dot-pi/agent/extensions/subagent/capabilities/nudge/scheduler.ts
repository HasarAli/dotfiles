/**
 * scheduler.ts — NudgeScheduler: batches per-agent completion notifications
 * with a short hold so rapid back-to-back completions don't spam separate
 * messages.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildNotificationDetails, formatTaskNotification } from "../../shared/helpers.js";
import type { AgentRecord, NotificationDetails } from "../../shared/types.js";
import type { AgentActivity, AgentWidget } from "../../ui/agent-widget.js";
import type { FleetList } from "../../ui/fleet-list.js";

const NUDGE_HOLD_MS = 200;

export interface NudgeAccessors {
  getWidget: () => AgentWidget;
  getFleet: () => FleetList;
}

export interface NudgeScheduler {
  cancelNudge: (id: string) => void;
  sendIndividualNudge: (record: AgentRecord) => void;
  emitIndividualNudge: (record: AgentRecord) => void;
  dispose: () => void;
  QUEUE_WAIT_POLL_MS: number;
}

export function createNudgeScheduler(
  pi: ExtensionAPI,
  agentActivity: Map<string, AgentActivity>,
  accessors: NudgeAccessors,
): NudgeScheduler {
  const pendingNudges = new Map<string, ReturnType<typeof setTimeout>>();
  const QUEUE_WAIT_POLL_MS = Math.floor(NUDGE_HOLD_MS / 4);

  function scheduleNudge(key: string, send: () => void, delay = NUDGE_HOLD_MS) {
    cancelNudge(key);
    pendingNudges.set(key, setTimeout(() => {
      pendingNudges.delete(key);
      try { send(); } catch { /* ignore */ }
    }, delay));
  }

  function cancelNudge(key: string) {
    const timer = pendingNudges.get(key);
    if (timer != null) {
      clearTimeout(timer);
      pendingNudges.delete(key);
    }
  }

  function emitIndividualNudge(record: AgentRecord) {
    if (record.resultConsumed) return;

    const notification = formatTaskNotification(record, 500);
    const footer = record.outputFile ? `\nFull transcript available at: ${record.outputFile}` : '';

    pi.sendMessage<NotificationDetails>({
      customType: "subagent-notification",
      content: notification + footer,
      display: true,
      details: buildNotificationDetails(record, 500, agentActivity.get(record.id)),
    }, { deliverAs: "followUp", triggerTurn: true });
  }

  function sendIndividualNudge(record: AgentRecord) {
    agentActivity.delete(record.id);
    accessors.getWidget().markFinished(record.id);
    accessors.getFleet().onAgentFinished(record.id);
    scheduleNudge(record.id, () => emitIndividualNudge(record));
    accessors.getWidget().update();
  }

  function dispose() {
    for (const timer of pendingNudges.values()) clearTimeout(timer);
    pendingNudges.clear();
  }

  return { cancelNudge, sendIndividualNudge, emitIndividualNudge, dispose, QUEUE_WAIT_POLL_MS };
}
