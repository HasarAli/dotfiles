/** Registration for the one tool surface: `web_fetch`. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HoundClient } from "../../engine/hound-client.js";
import { executeWebFetch } from "./execute.js";
import { webFetchParams } from "./schema.js";

export interface WebFetchDeps {
  /** Private hound child shared across the session. */
  hound: HoundClient;
}

export function registerWebFetchTool(pi: ExtensionAPI, deps: WebFetchDeps): void {
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Read a web page or PDF.",
    parameters: webFetchParams,
    async execute(_id, params, signal, _onUpdate, ctx) {
      return executeWebFetch(deps.hound, params, signal, ctx);
    },
  });
}
