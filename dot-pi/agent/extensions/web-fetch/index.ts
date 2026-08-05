/**
 * web-fetch — one tool, `web_fetch`: read a URL and get back processed text,
 * keyword matches, or a model-extracted answer.
 *
 * `distill` mode goes server-first: urlContext fetches and reads the page in one
 * call. Only a PROVEN failure falls back to the local pipeline: curl (SSRF-guarded,
 * redirects re-validated per hop) → process (defuddle / pdftotext / passthrough)
 * → bare | grep | local distill. Bare and grep are inherently local.
 *
 * Pages that need JS or auth escalate to the browser tool.
 *
 * Layout: index.ts is the composition root; `capabilities/` holds each surface
 * (here just web-fetch-tool), `engine/` the fetch/process/grep/distill stages,
 * `shared/` config, envelope and cost math. Nothing else imports index.ts.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerWebFetchTool } from "./capabilities/web-fetch-tool/index.js";

export default function (pi: ExtensionAPI) {
  registerWebFetchTool(pi);
}
