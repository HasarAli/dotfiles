import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeWebSearch } from "./execute.js";
import { webSearchParams, type WebSearchParams } from "./schema.js";

export function registerWebSearchTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      `Search the web. Returns a synthesized answer with cited source URLs — not page content; ` +
      `fetch the 1-2 best sources with web_fetch(url, query=...) for content. The current date is ` +
      `${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long" })} — use the current ` +
      `year for recent queries.`,
    promptSnippet:
      "web_search: returns a synthesized answer with cited source URLs — fetch the best ones with web_fetch for content.",
    promptGuidelines: [
      "Use web_search when you need current or source-backed information outside your training data.",
      "Cite web_search sources with markdown hyperlinks.",
    ],
    parameters: webSearchParams,
    async execute(_id, params, signal, _onUpdate, ctx) {
      return executeWebSearch(params as WebSearchParams, signal, ctx);
    },
  });
}
