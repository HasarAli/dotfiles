/**
 * web-fetch — one tool, `web_fetch`: read a URL without paying for the page.
 *
 * Hound's smart_fetch does the retrieval (HTTP → Playwright → stealth escalation,
 * PDF/OCR, cache). What comes back to the agent depends on `query` and `query_method`:
 *
 *   query (llm)       → Gemini flash-lite reads the page, the agent gets the answer
 *   query (bm25)      → the BM25-relevant blocks for it, capped at `max_tokens`, no API call
 *   no query          → page text, capped at `max_tokens`
 *
 * Hound runs as a private stdio child, spawned on first use and reused for the
 * session — separate from any hound wired into mcp.json.
 *
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY) for `llm` mode only.
 *
 * Layout (mirrors the subagent extension): index.ts is the composition root;
 * `capabilities/` holds each surface (here just web-fetch-tool), `engine/` the
 * hound + distiller, `shared/` config, page types and cost math. Nothing else
 * imports index.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebFetchTool } from "./capabilities/web-fetch-tool/index.js";
import { HoundClient } from "./engine/hound-client.js";

export default function (pi: ExtensionAPI) {
  // ---- Private hound child, reused for the session ----
  const hound = new HoundClient();
  pi.on("session_shutdown", () => hound.stop());

  // ---- Capability surfaces ----
  registerWebFetchTool(pi, { hound });
}
