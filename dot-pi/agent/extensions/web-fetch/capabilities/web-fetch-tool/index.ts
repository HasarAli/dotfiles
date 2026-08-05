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
    promptSnippet: "Read a web page or PDF — use for specific URLs, resources, or when you need full page content",
    promptGuidelines: [
      "Use web_fetch when you need the content of a specific URL, PDF, or resource.",
    ],
    parameters: webFetchParams,
    async execute(_id, params, signal, _onUpdate, ctx) {
      return executeWebFetch(params, signal, ctx);
    },
  });
}
