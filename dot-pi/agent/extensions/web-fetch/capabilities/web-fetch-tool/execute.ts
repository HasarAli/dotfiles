import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { distill, geminiKey } from "../../engine/distiller.js";
import type { HoundClient } from "../../engine/hound-client.js";
import { usdOf } from "../../shared/cost.js";
import {
  CACHE_TTL_SECONDS,
  CHARS_PER_TOKEN,
  DEFAULT_MAX_TOKENS,
  DISTILL_CHARS,
  DISTILL_MODEL,
  MIN_CONTENT_CHARS,
} from "../../shared/config.js";
import { bodyOf, resumeHint, truncationNote, type Page } from "../../shared/page.js";
import type { WebFetchParams } from "./schema.js";

/** How the caller wants the page answered. */
type Mode =
  | { kind: "distill"; query: string; key: string } // llm + query — a model reads the page
  | { kind: "focus"; query: string } // bm25 + query — relevant blocks, no API call
  | { kind: "raw" }; // no query — page text only

/** The three modes map 1:1 onto what smart_fetch is told to return. */
function modeOf(params: WebFetchParams): Mode {
  const method = params.query_method ?? "llm";
  if (params.query && method === "llm") return { kind: "distill", query: params.query, key: geminiKey() };
  if (params.query && method === "bm25") return { kind: "focus", query: params.query };
  return { kind: "raw" };
}

/** Translate user params into what hound's mcp_smart_fetch understands. */
function smartFetchArgsOf(params: WebFetchParams, mode: Mode) {
  return {
    url: params.url,
    max_content_chars:
      mode.kind === "distill"
        ? DISTILL_CHARS
        : Math.max(MIN_CONTENT_CHARS, Math.round((params.max_tokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN)),
    cache_ttl: params.fresh ? 0 : CACHE_TTL_SECONDS,
    ...(params.offset !== undefined ? { offset: params.offset } : {}),
    ...(params.pages !== undefined ? { pages: params.pages } : {}),
    ...(mode.kind === "focus" ? { focus: mode.query } : {}),
  };
}

/** Provenance + fetch metadata that ride along on every result. */
function detailsOf(params: WebFetchParams, page: Page, body: string) {
  return {
    url: page.url ?? params.url,
    status: page.status,
    fetcher: page.fetcher_used,
    escalation: page.escalation_path || undefined,
    page_type: page.page_type,
    cached: page.cached,
    chars: body.length,
    truncated: page.is_truncated
      ? { next_offset: page.next_offset, total_chars: page.total_extracted_chars }
      : undefined,
  };
}

/** The whole `web_fetch` flow: fetch → fail fast → raw/bm25 or distill. */
export async function executeWebFetch(
  hound: HoundClient,
  params: WebFetchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
) {
  const mode = modeOf(params);
  const page = await hound.smartFetch(smartFetchArgsOf(params, mode), signal);
  const body = bodyOf(page);
  const details = detailsOf(params, page, body);

  // content_ok is false on healthy PDFs, so it cannot gate failure. status and error can.
  if (page.error || page.status === 0 || page.status >= 400) {
    return {
      content: [{ type: "text", text: `Fetch failed (${page.status}): ${page.error || body.slice(0, 400)}` }],
      details,
      isError: true,
    };
  }

  // Raw and bm25 modes are just hound's output plus truncation hints.
  if (mode.kind !== "distill") {
    return { content: [{ type: "text", text: body + truncationNote(page) + resumeHint(page) }], details };
  }

  // Distill: a model answers the query from the page (truncation flagged for it).
  const answer = await distill(mode.key, mode.query, body + truncationNote(page), signal);
  const inTok = answer.usage.promptTokenCount ?? 0;
  const outTok = answer.usage.candidatesTokenCount ?? 0;

  return {
    content: [
      {
        type: "text",
        text: `${answer.text}\n\n— ${DISTILL_MODEL} over ${body.length} chars of ${details.url}${resumeHint(page)}`,
      },
    ],
    details: {
      ...details,
      model: DISTILL_MODEL,
      distill_tokens: { in: inTok, out: outTok },
      usd: usdOf(ctx, inTok, outTok),
    },
  };
}
