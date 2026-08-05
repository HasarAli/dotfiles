/**
 * Gemini server-side fetch (urlContext) — the primary path for `distill` mode.
 * One generateContent call: Google fetches the URL, the model answers. Never
 * throws; every failure becomes a `ok: false` result so the caller falls back
 * to the local curl pipeline.
 *
 * THE FAILURE SIGNAL IS THE METADATA, NOT THE ANSWER: when retrieval fails
 * (localhost, paywall, dead domain…) the model often answers from priors with
 * plausible prose and `finishReason: STOP`. Only `urlRetrievalStatus ===
 * URL_RETRIEVAL_STATUS_SUCCESS` proves the page was actually fetched.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DISTILL_MODEL, GEMINI_TIMEOUT_MS, SERVER_FETCH_ENABLED } from "../shared/config.js";
import { candidateOf, candidateParts, geminiPost, textOf, usageOf } from "../../shared/gemini.js";

export type UrlContextResult =
  | {
      ok: true;
      text: string;
      pageTokens: number; // page content the model consumed (toolUsePromptTokenCount)
      usage: { in: number; out: number };
      model: string;
    }
  | {
      ok: false;
      reason: "disabled" | "no-key" | "request-failed" | "http-error" | "bad-response" | "fetch-failed" | "empty";
      status?: number;
    };

/** candidates[0].urlContextMetadata.urlMetadata[0].urlRetrievalStatus, if the shape holds. */
function retrievalStatusOf(candidate: ReturnType<typeof candidateOf>): string | undefined {
  const md = candidate?.urlContextMetadata;
  if (!md || typeof md !== "object") return undefined;
  const list = (md as { urlMetadata?: unknown }).urlMetadata;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const first = list[0];
  if (!first || typeof first !== "object") return undefined;
  const status = (first as { urlRetrievalStatus?: unknown }).urlRetrievalStatus;
  return typeof status === "string" ? status : undefined;
}

export async function fetchWithUrlContext(
  ctx: ExtensionContext,
  url: string,
  query: string,
  signal?: AbortSignal,
): Promise<UrlContextResult> {
  if (!SERVER_FETCH_ENABLED) return { ok: false, reason: "disabled" };

  const res = await geminiPost(
    ctx,
    DISTILL_MODEL,
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                `Fetch the page at ${url} and answer the request below. ` +
                `Quote identifiers, versions, numbers and code exactly. If the page does not answer, say so in one line.\n\n` +
                `REQUEST: ${query}`,
            },
          ],
        },
      ],
      tools: [{ urlContext: {} }],
    },
    signal,
    GEMINI_TIMEOUT_MS,
  );
  if (!res.ok) return { ok: false, reason: res.reason, status: res.status };

  const candidate = candidateOf(res.json);
  if (!candidate) return { ok: false, reason: "bad-response" };

  // Fetch must be PROVEN by the metadata; an error status means the model may
  // be answering from priors — never trust that, fall back to the local path.
  const status = retrievalStatusOf(candidate);
  if (!status || status !== "URL_RETRIEVAL_STATUS_SUCCESS") {
    return { ok: false, reason: "fetch-failed" };
  }

  const text = textOf(candidateParts(res.json));
  if (!text) return { ok: false, reason: "empty" };

  const usage = usageOf(res.json);
  return {
    ok: true,
    text,
    pageTokens: usage.toolUsePromptTokenCount ?? 0,
    usage: { in: usage.promptTokenCount ?? 0, out: usage.candidatesTokenCount ?? 0 },
    model: DISTILL_MODEL,
  };
}
