/**
 * web-fetch — one tool, `web_fetch`: read a URL without paying for the page.
 *
 * Hound's smart_fetch does the retrieval (HTTP → Playwright → stealth escalation,
 * PDF/OCR, cache). What comes back to the agent depends on `prompt` and `raw`:
 *
 *   prompt            → Gemini flash-lite reads the extraction, the agent gets the answer
 *   prompt + raw      → hound's BM25 `focus` blocks, capped at `max_tokens`, no API call
 *   neither           → page text, capped at `max_tokens`
 *
 * Hound runs as a private stdio child, spawned on first use and reused for the
 * session — separate from any hound wired into mcp.json.
 *
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY) for prompt mode only.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HOUND_BIN = process.env.HOUND_BIN || `${process.env.HOME}/.local/bin/hound`;
const MODEL = process.env.FETCH_URL_MODEL || "gemini-3.5-flash-lite";

// smart_fetch caps max_content_chars at 200k; ask for all of it when a model reads the page.
const DISTILL_CHARS = 200_000;
const DEFAULT_MAX_TOKENS = 1200;
// Stealth escalation and OCR run well past the SDK's 60s default.
const FETCH_TIMEOUT_MS = 300_000;

const SYSTEM =
  "You are the extraction stage of a coding agent's web fetch. Answer the request from the " +
  "page below. Quote identifiers, versions, numbers and code exactly. Omit preamble, " +
  "restatement and closing summary. If the page does not answer the request, say so in one " +
  "line and describe what the page does contain.";

interface Page {
  content?: string[];
  url?: string;
  status: number;
  error?: string;
  fetcher_used?: string;
  escalation_path?: string;
  page_type?: string;
  cached?: boolean;
  is_truncated?: boolean;
  next_offset?: number;
  total_extracted_chars?: number;
}

export default function (pi: ExtensionAPI) {
  const hound = new Hound();
  pi.on("session_shutdown", () => hound.stop());

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Read a web page or PDF. Handles JS-rendered pages, Cloudflare and anti-bot walls. " +
      "Pass `prompt` with what you need from the page — a model reads the full page and " +
      "returns just that, which is far cheaper than reading the page yourself. Omit `prompt` " +
      "only when you need the page text itself.",
    parameters: Type.Object({
      url: Type.String({ description: "http/https URL of a page or PDF" }),
      prompt: Type.Optional(
        Type.String({
          description:
            "What to extract, as a question or instruction. Be specific — it drives both " +
            "the extraction and the relevance ranking.",
        }),
      ),
      raw: Type.Optional(
        Type.Boolean({
          description:
            "Return page text instead of a model's answer. With `prompt`, returns the " +
            "BM25-relevant blocks for it. Costs nothing and needs no API key.",
        }),
      ),
      max_tokens: Type.Optional(
        Type.Number({ description: `Ceiling on returned page text in raw mode (default ${DEFAULT_MAX_TOKENS})` }),
      ),
      offset: Type.Optional(Type.Number({ description: "Resume at this character offset after a truncated read" })),
      pages: Type.Optional(Type.String({ description: "PDF only: page spec like '1-5' or '2,7-9'" })),
      fresh: Type.Optional(Type.Boolean({ description: "Bypass hound's cache and refetch" })),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const distilling = Boolean(params.prompt) && !params.raw;
      const key = distilling ? geminiKey() : undefined;

      const page = await hound.smartFetch(
        {
          url: params.url,
          max_content_chars: distilling
            ? DISTILL_CHARS
            : Math.max(500, Math.round((params.max_tokens ?? DEFAULT_MAX_TOKENS) * 4)),
          cache_ttl: params.fresh ? 0 : 3600,
          ...(params.offset ? { offset: params.offset } : {}),
          ...(params.pages ? { pages: params.pages } : {}),
          ...(params.raw && params.prompt ? { focus: params.prompt } : {}),
        },
        signal,
      );

      const body = bodyOf(page);
      const details = {
        url: page.url ?? params.url,
        status: page.status,
        fetcher: page.fetcher_used,
        escalation: page.escalation_path || undefined,
        page_type: page.page_type,
        cached: page.cached,
        chars: body.length,
        truncated: page.is_truncated ? { next_offset: page.next_offset, total_chars: page.total_extracted_chars } : undefined,
      };

      // content_ok is false on healthy PDFs, so it cannot gate failure. status and error can.
      if (page.error || page.status === 0 || page.status >= 400) {
        return {
          content: [{ type: "text", text: `Fetch failed (${page.status}): ${page.error || body.slice(0, 400)}` }],
          details,
          isError: true,
        };
      }

      if (!distilling) {
        return { content: [{ type: "text", text: body + truncationNote(page) + resumeHint(page) }], details };
      }

      const answer = await distill(key!, params.prompt!, body + truncationNote(page), signal);
      const inTok = answer.usage.promptTokenCount ?? 0;
      const outTok = answer.usage.candidatesTokenCount ?? 0;

      return {
        content: [
          {
            type: "text",
            text: `${answer.text}\n\n— ${MODEL} over ${body.length} chars of ${details.url}${resumeHint(page)}`,
          },
        ],
        details: { ...details, model: MODEL, distill_tokens: { in: inTok, out: outTok }, usd: usdOf(ctx, inTok, outTok) },
      };
    },
  });
}

// Rates come from pi's model registry, in USD per million tokens. A model the registry
// does not know reports no cost — a missing number invites a look, a zero does not.
function usdOf(ctx: ExtensionContext, inTok: number, outTok: number): number | undefined {
  const cost = ctx.modelRegistry.getAll().find((m) => m.id === MODEL)?.cost;
  return cost ? round4((inTok * cost.input + outTok * cost.output) / 1e6) : undefined;
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const bodyOf = (page: Page): string => (page.content ?? []).join("\n");

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set; call web_fetch without `prompt` to get raw page text");
  return key;
}

// The distiller must not read a partial page as if it were the whole one — that is exactly
// how Gemini's url_context reports a truncation point as the end of the document.
function truncationNote(page: Page): string {
  if (!page.is_truncated) return "";
  return (
    `\n\n[TRUNCATED at ${page.next_offset} of ${page.total_extracted_chars} chars. Content past this ` +
    `point is NOT present — do not treat the last entry above as the document's last entry.]`
  );
}

const resumeHint = (page: Page): string =>
  page.is_truncated ? `\n[More at offset=${page.next_offset} of ${page.total_extracted_chars} chars.]` : "";

async function distill(key: string, prompt: string, page: string, signal?: AbortSignal) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      signal,
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: `REQUEST: ${prompt}\n\nPAGE:\n${page}` }] }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data: any = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p: any) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  return { text: text || "(distiller returned nothing)", usage: data.usageMetadata ?? {} };
}

/** A private hound child, connected over stdio MCP and reused for the session. */
class Hound {
  private client?: Promise<Client>;

  async smartFetch(args: Record<string, unknown>, signal?: AbortSignal): Promise<Page> {
    const client = await this.connect();
    const res = await client.callTool({ name: "mcp_smart_fetch", arguments: args }, undefined, {
      signal,
      timeout: FETCH_TIMEOUT_MS,
    });
    const text = ((res.content as any[]) ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    try {
      return JSON.parse(text);
    } catch {
      return { content: [text], status: 200 };
    }
  }

  stop() {
    this.client?.then((c) => c.close()).catch(() => {});
    this.client = undefined;
  }

  private connect(): Promise<Client> {
    this.client ??= (async () => {
      const client = new Client({ name: "pi-web-fetch", version: "1" });
      // The SDK otherwise passes a sudo-style env whitelist; hound reads more than that.
      const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>;
      await client.connect(new StdioClientTransport({ command: HOUND_BIN, env, stderr: "ignore" }));
      client.onclose = () => (this.client = undefined);
      return client;
    })().catch((e) => {
      this.client = undefined;
      throw new Error(`cannot start ${HOUND_BIN}: ${e.message}`);
    });
    return this.client;
  }
}
