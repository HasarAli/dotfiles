import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readPage, type PageReadOk } from "../../engine/read.js";
import { grepPage } from "../../engine/grep.js";
import { distill } from "../../engine/distill.js";
import { fetchWithUrlContext } from "../../engine/url-context.js";
import { usdOf } from "../../shared/cost.js";
import {
  charsToTokens,
  sliceNote,
  wrapUntrusted,
} from "../../shared/envelope.js";
import { DEFAULT_MAX_CHARS } from "../../shared/config.js";
import { geminiFailureText } from "../../../shared/gemini.js";
import type { WebFetchParams } from "./schema.js";

type Mode =
  | { kind: "bare" }
  | { kind: "grep"; query: string }
  | { kind: "distill"; query: string };

function modeOf(params: WebFetchParams): Mode {
  const query = params.query?.trim();
  if (!query) return { kind: "bare" };
  return params.query_method === "grep" ? { kind: "grep", query } : { kind: "distill", query };
}

export async function executeWebFetch(
  params: WebFetchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
) {
  const mode = modeOf(params);
  const capChars = DEFAULT_MAX_CHARS;

  // Distill goes server-first: urlContext fetches and reads the page
  // in one call, short-circuiting before any local curl work.
  if (mode.kind === "distill") {
    const server = await fetchWithUrlContext(ctx, params.url, mode.query, signal);
    if (server.ok) {
      const content =
        `${server.text}\n\n— ${server.model} · server-side fetch over ` +
        `${server.pageTokens.toLocaleString()} tokens of ${params.url}`;
      const usd = usdOf(ctx, server.usage.in, server.usage.out);
      return {
        content: [{ type: "text" as const, text: wrapUntrusted(content) }],
        details: {
          tokens: { original: server.pageTokens, returned: charsToTokens(content.length) },
          model: server.model,
          distill_tokens: server.usage,
          ...(usd !== undefined ? { usd } : {}),
        },
      };
    }
  }

  // Local path — bare, grep, and the distill fallback.
  const page = await readPage(params.url, signal, { pages: params.pages });

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

  const pageText = page.text;

  if (mode.kind === "grep") {
    const g = grepPage(mode.query, pageText, capChars);
    const content =
      g.total === 0
        ? `No matches for "${mode.query}" in ${page.finalUrl}`
        : `grep "${mode.query}" → ${g.matches} of ${g.total} matches in ${page.finalUrl}:\n${g.text}${g.truncated ? "\n… (output capped)" : ""}`;
    return {
      content: [{ type: "text" as const, text: wrapUntrusted(content) }],
      details: {
        tokens: { original: charsToTokens(pageText.length), returned: charsToTokens(content.length) },
      },
    };
  }

  if (mode.kind === "distill") {
    return distillFrom(page, mode.query, ctx, signal);
  }

  // Bare: slice the page up to the return cap.
  const content = pageText.slice(0, capChars);
  const text = wrapUntrusted(content) + sliceNote(pageText.length, content.length);
  return {
    content: [{ type: "text" as const, text }],
    details: {
      tokens: { original: charsToTokens(pageText.length), returned: charsToTokens(content.length) },
    },
  };
}

async function distillFrom(
  page: PageReadOk,
  query: string,
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
) {
  const result = await distill(ctx, query, page.text, signal);
  if (!result.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: `web_fetch distill failed: ${geminiFailureText(result.reason, result.status)}`,
        },
      ],
      details: { error: `distill_${result.reason}`, url: page.finalUrl },
      isError: true,
    };
  }

  const inTok = result.usage.promptTokenCount ?? 0;
  const outTok = result.usage.candidatesTokenCount ?? 0;
  const content = `${result.text}\n\n— ${result.model} over ${charsToTokens(page.text.length)} tokens of ${page.finalUrl}`;
  const usd = usdOf(ctx, inTok, outTok);
  return {
    content: [{ type: "text" as const, text: wrapUntrusted(content) }],
    details: {
      tokens: { original: charsToTokens(page.text.length), returned: charsToTokens(content.length) },
      model: result.model,
      distill_tokens: { in: inTok, out: outTok },
      ...(usd !== undefined ? { usd } : {}),
    },
  };
}
