/**
 * web-search — one tool, `web_search`, backed EXCLUSIVELY by Gemini's
 * server-side Google Search grounding (generateContent + googleSearch).
 *
 * One call to the Gemini API returns a synthesized answer plus grounding chunks
 * (the cited sources). What comes back to the agent is the answer + ranked
 * source URLs — NOT page content; the agent web_fetches the 1-2 best sources
 * for content.
 *
 * `web_search` replaces the one the `pi-deepseek-search` npm package used to
 * provide; that package is no longer installed, so this is the only
 * `web_search` surface.
 *
 * Layout: index.ts is the composition root; `capabilities/` holds each surface
 * (here just web-search-tool), `engine/` the Gemini client, `shared/` the
 * outcome types. Nothing else imports index.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebSearchTool } from "./capabilities/web-search-tool/index.js";

export default function (pi: ExtensionAPI) {
  registerWebSearchTool(pi);
}
