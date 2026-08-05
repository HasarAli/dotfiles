import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readPage, type PageReadOk } from "../../engine/read.js";
import { grepPage } from "../../engine/grep.js";
import { distill } from "../../engine/distill.js";
import { fetchWithUrlContext } from "../../engine/url-context.js";
import { truncationOf } from "../../engine/cache.js";
import { usdOf } from "../../shared/cost.js";
import {
  charsToTokens,
  resumeHint,
  sliceNote,
  truncationNote,
  wrapUntrusted,
  type Envelope,
  type Truncation,
} from "../../shared/envelope.js";
import {
  CHARS_PER_TOKEN,
  DEFAULT_MAX_CHARS,
  MIN_CONTENT_CHARS,
} from "../../shared/config.js";
import { geminiFailureText } from "../../../shared/gemini.js";
import type { WebFetchParams } from "./schema.js";

/** How the caller wants the page answered; the trimmed query rides along so no branch re-parses it. */
type Mode =
  | { kind: "bare" }
  | { kind: "grep"; query: string }
  | { kind: "distill"; query: string };

function modeOf(params: WebFetchParams): Mode {
  const query = params.query?.trim();
  if (!query) return { kind: "bare" };
  return params.query_method === "grep" ? { kind: "grep", query } : { kind: "distill", query };
}

/** Ceiling on returned text in chars: `max_tokens` if given (floored), else the default. */
function returnCapChars(params: WebFetchParams): number {
  if (params.max_tokens === undefined) return DEFAULT_MAX_CHARS;
  return Math.max(MIN_CONTENT_CHARS, Math.round(params.max_tokens * CHARS_PER_TOKEN));
}

/** The page to read from — the fresh full text when a fetch just happened, else the stored copy. */
const pageTextOf = (page: PageReadOk) => page.fullText ?? page.entry.text;

export async function executeWebFetch(
  params: WebFetchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
) {
  const mode = modeOf(params);
  const capChars = returnCapChars(params);
  const resumeOffset = params.offset ?? 0;

  // Distill goes server-first: Gemini's urlContext fetches and reads the page
  // in one call, short-circuiting before any local curl work. Only a PROVEN
  // failure (or disabled) falls through — and an offset resume never uses it,
  // since the server path returns no raw text to slice.
  if (mode.kind === "distill" && resumeOffset === 0) {
    const server = await fetchWithUrlContext(ctx, params.url, mode.query, signal);
    if (server.ok) {
      const content =
        `${server.text}\n\n— ${server.model} · server-side fetch over ` +
        `${server.pageTokens.toLocaleString()} tokens of ${params.url}`;
      const envelope: Envelope = {
        url: params.url,
        title: params.url,
        tokens: { original: server.pageTokens, returned: charsToTokens(content.length) },
        content,
      };
      const usd = usdOf(ctx, server.usage.in, server.usage.out);
      return {
        content: [{ type: "text" as const, text: wrapUntrusted(content) }],
        details: {
          ...envelope,
          mode: mode.kind,
          fetched_by: "urlContext",
          model: server.model,
          distill_tokens: server.usage,
          // The server path has no local cache or HTTP status of its own to report.
          cached: false,
          revalidated: false,
          stale: false,
          ...(usd !== undefined ? { usd } : {}),
        },
      };
    }
  }

  // Local path — bare, grep, and the distill fallback.
  const page = await readPage(params.url, signal, {
    bypassCache: params.fresh === true,
    minChars: resumeOffset,
    uncached: params.pages !== undefined,
    pages: params.pages,
  });

  if (!page.ok) {
    const hint = page.hint ? ` — ${page.hint}` : "";
    return {
      content: [{ type: "text" as const, text: `web_fetch ${page.error} for ${params.url}: ${page.reason}${hint}` }],
      details: {
        error: page.error,
        url: params.url,
        reason: page.reason,
        ...(page.hint ? { hint: page.hint } : {}),
        ...(page.status !== undefined ? { status: page.status } : {}),
      },
      isError: true,
    };
  }

  const { entry } = page;
  const truncated = truncationOf(entry);
  const staleNote = page.stale ? "\n\n[cache: serving stale copy — refresh failed]" : "";
  const pageText = pageTextOf(page);
  const from = Math.min(resumeOffset, pageText.length);

  if (mode.kind === "grep") {
    const g = grepPage(mode.query, pageText.slice(from), capChars);
    const content =
      g.total === 0
        ? `No matches for "${mode.query}" in ${entry.finalUrl}`
        : `grep "${mode.query}" → ${g.matches} of ${g.total} matches in ${entry.finalUrl}:\n${g.text}${g.truncated ? "\n… (output capped)" : ""}`;
    const envelope: Envelope = {
      url: entry.finalUrl,
      title: entry.title,
      tokens: { original: charsToTokens(pageText.length), returned: charsToTokens(content.length) },
      truncated,
      content,
    };
    const text = wrapUntrusted(content) + resumeHint(truncated) + staleNote;
    return { content: [{ type: "text" as const, text }], details: localDetails(envelope, mode.kind, page) };
  }

  if (mode.kind === "distill") {
    return distillFrom(page, mode.query, resumeOffset, truncated, ctx, signal);
  }

  // Bare: slice the page from `offset`, up to the return cap.
  const content = pageText.slice(from, resumeOffset + capChars);
  const envelope: Envelope = {
    url: entry.finalUrl,
    title: entry.title,
    tokens: { original: charsToTokens(pageText.length), returned: charsToTokens(content.length) },
    truncated,
    content,
  };
  const text = wrapUntrusted(content) + sliceNote(pageText.length, content.length) + resumeHint(truncated) + staleNote;
  return { content: [{ type: "text" as const, text }], details: localDetails(envelope, mode.kind, page) };
}

/** Cache-provenance fields shared by every local-path response. */
function fetchDetails(page: PageReadOk) {
  return {
    ...(page.status !== undefined ? { status: page.status } : {}),
    cached: page.fromCache,
    revalidated: page.revalidated,
    stale: page.stale,
  };
}

function localDetails(envelope: Envelope, mode: "bare" | "grep", page: PageReadOk) {
  return { ...envelope, mode, ...fetchDetails(page) };
}

async function distillFrom(
  page: PageReadOk,
  query: string,
  resumeOffset: number,
  truncated: Truncation | undefined,
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
) {
  const { entry } = page;
  const pageText = pageTextOf(page);
  const consumed = pageText.slice(Math.min(resumeOffset, pageText.length));
  // The model must know when it sees only part of the page — the storage-cap
  // note below, and an explicit continuation marker for offset resumes — a
  // partial page read as the whole document is exactly the failure the cap
  // exists to prevent.
  const resumeNote =
    resumeOffset > 0
      ? `\n\n[Continuation of the page from character offset ${resumeOffset} — answer from the content below.]`
      : "";
  const result = await distill(ctx, query, consumed + resumeNote + truncationNote(truncated), signal);
  if (!result.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: `web_fetch distill failed: ${geminiFailureText(result.reason, result.status)}`,
        },
      ],
      details: { error: `distill_${result.reason}`, url: entry.finalUrl },
      isError: true,
    };
  }

  const inTok = result.usage.promptTokenCount ?? 0;
  const outTok = result.usage.candidatesTokenCount ?? 0;
  const content = `${result.text}\n\n— ${result.model} over ${charsToTokens(consumed.length)} tokens of ${entry.finalUrl}`;
  const envelope: Envelope = {
    url: entry.finalUrl,
    title: entry.title,
    tokens: { original: charsToTokens(consumed.length), returned: charsToTokens(content.length) },
    truncated,
    content,
  };
  const usd = usdOf(ctx, inTok, outTok);
  return {
    content: [{ type: "text" as const, text: wrapUntrusted(content) + resumeHint(truncated) }],
    details: {
      ...envelope,
      mode: "distill",
      ...fetchDetails(page),
      model: result.model,
      distill_tokens: { in: inTok, out: outTok },
      fetched_by: "curl",
      ...(usd !== undefined ? { usd } : {}),
    },
  };
}
