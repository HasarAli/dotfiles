/**
 * web-fetch — one tool, `web_fetch`: read a URL and get back processed text,
 * keyword matches, or a Gemini-extracted answer. No browser engine, no fetch
 * service — the pipeline is curl, defuddle/pdftotext, and a disk cache.
 *
 * `distill` mode goes server-first: Gemini's urlContext fetches and reads the
 * page in one call. Only a PROVEN failure (urlRetrievalStatus != SUCCESS,
 * API error, disabled) falls back to the local pipeline: `curl (SSRF-guarded,
 * redirects re-validated per hop) → process (defuddle / pdftotext / passthrough)
 * → disk cache (TTL + ETag revalidation) → bare | grep | local distill`.
 * Bare and grep are inherently local (urlContext cannot return raw text).
 *
 * Pages that need JS or auth escalate to the browser tool — this tool never
 * retries them, and extraction failures are never silent (truncation note +
 * envelope on every response).
 *
 * Layout: index.ts is the composition root; `capabilities/` holds each surface
 * (here just web-fetch-tool), `engine/` the fetch/process/cache/grep/distill
 * stages, `shared/` config, envelope and cost math. Nothing else imports
 * index.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebFetchTool } from "./capabilities/web-fetch-tool/index.js";

export default function (pi: ExtensionAPI) {
  registerWebFetchTool(pi);
}
