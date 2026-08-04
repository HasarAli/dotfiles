/**
 * capabilities/agents-command — the `/agents` interactive management command.
 *
 * Self-contained vertical slice: never imports from other capabilities/.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SubagentDeps } from "../../shared/types.js";
import { showAgentsMenu } from "./menus.js";

export function registerAgentsCommand(pi: ExtensionAPI, deps: SubagentDeps): void {
  pi.registerCommand("agents", async (ctx) => {
    await showAgentsMenu(ctx, deps);
  });
}
