/**
 * conversation.ts — viewAgentConversation, used by menus.ts.
 *
 * Dynamically imports ui/conversation-viewer.ts to keep the (heavier) live
 * overlay component out of the module graph until a user actually opens one.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentRecord, SubagentDeps } from "../../shared/types.js";

export async function viewAgentConversation(
  ctx: ExtensionCommandContext,
  deps: SubagentDeps,
  record: AgentRecord,
): Promise<void> {
  if (!record.session) {
    ctx.ui.notify(`Agent is ${record.status === "queued" ? "queued" : "expired"} — no session available.`, "info");
    return;
  }

  const { ConversationViewer, VIEWPORT_HEIGHT_PCT } = await import("../../ui/conversation-viewer.js");
  const session = record.session;
  const activity = deps.agentActivity.get(record.id);

  await ctx.ui.custom<undefined>(
    (tui, theme, keybindings, done) => {
      return new ConversationViewer(tui, session, record, activity, theme, done, () => {
        if (deps.manager.abort(record.id)) {
          ctx.ui.notify(`Stopped "${record.description}".`, "info");
        }
      }, keybindings, (message: string) => deps.manager.steer(record.id, message));
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "90%", maxHeight: `${VIEWPORT_HEIGHT_PCT}%` },
    },
  );
}
