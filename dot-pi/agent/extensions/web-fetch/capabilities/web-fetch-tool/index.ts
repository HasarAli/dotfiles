import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeWebFetch } from "./execute.js";
import { webFetchParams } from "./schema.js";

export function registerWebFetchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Read a web page or PDF and return its text, keyword matches, or a model-extracted answer. " +
      "JS-rendered and bot-protected pages are not fetched — use the browser tool for those.",
    parameters: webFetchParams,
    async execute(_id, params, signal, _onUpdate, ctx) {
      return executeWebFetch(params, signal, ctx);
    },
  });
}
