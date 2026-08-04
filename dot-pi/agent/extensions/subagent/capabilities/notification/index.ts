/**
 * capabilities/notification — the "subagent-notification" custom message renderer.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { NotificationDetails } from "../../shared/types.js";
import { renderNotification } from "./format.js";

export function registerNotificationRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer<NotificationDetails>(
    "subagent-notification",
    renderNotification,
  );
}
