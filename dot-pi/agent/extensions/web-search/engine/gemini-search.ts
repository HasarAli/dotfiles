/**
 * Gemini server-side search via generateContent + Google Search grounding.
 * One non-streaming request returns the synthesized answer plus grounding
 * chunks as the source list. Never throws — every failure becomes an
 * `ok: false` SearchResult with a reason.
 *
 * The grounding API may be deprecated upstream; the response-shape contract
 * below is verified against the current reference and is all this module
 * depends on.
 *
 * Response shape parsed (verified against the generateContent reference):
 *   - answer:  candidates[0].content.parts[].text (joined)
 *   - sources: candidates[0].groundingMetadata.groundingChunks[].web{uri,title}
 *   - model:   top-level modelVersion (fall back to the model we sent)
 *   - tokens:  usageMetadata.totalTokenCount (else prompt+candidates, else 0)
 *
 * NOTE on the tool key: the raw REST JSON key is camelCase `googleSearch` with
 * an empty object. `google_search_grounding` / `googleSearchGrounding` is dead
 * and `googleSearchRetrieval` is the dynamic-retrieval variant — neither is
 * used here. `excludeDomains` is NOT a valid GoogleSearch field (400s), and
 * the tool does not filter domains client-side either — an agent that needs
 * domain constraints should put them in the query and check the cited URLs.
 */

import type { MinimalCtx, SearchProviderOutcome, SearchResult } from "../shared/provider-outcome.js";
import { geminiPost, usageOf } from "../../shared/gemini.js";

// The default model name is a moving target — pin it via GEMINI_SEARCH_MODEL.
const SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL || "gemini-3.6-flash";

/** Minimal shape of the candidate object we read from; anything else is skipped. */
interface GeminiCandidate {
  content?: { parts?: Array<{ text?: unknown }> };
  groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: unknown; title?: unknown } }> };
}

function extractCandidate(data: unknown): GeminiCandidate | undefined {
  if (!data || typeof data !== "object") return undefined;
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return undefined;
  return candidate as GeminiCandidate;
}

function extractAnswer(candidate: GeminiCandidate): string {
  const parts = candidate.content?.parts;
  if (!Array.isArray(parts)) return "";
  const texts: string[] = [];
  for (const part of parts) {
    if (part && typeof part === "object" && typeof part.text === "string" && part.text) {
      texts.push(part.text);
    }
  }
  return texts.join("\n").trim();
}

function extractSources(candidate: GeminiCandidate): SearchProviderOutcome["sources"] {
  const chunks = candidate.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const sources: SearchProviderOutcome["sources"] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const web = chunk?.web;
    if (!web || typeof web !== "object") continue;
    const uri = typeof web.uri === "string" ? web.uri : "";
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      title: typeof web.title === "string" && web.title ? web.title : "Untitled",
      url: uri,
    });
  }
  return sources;
}

function extractModel(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const modelVersion = (data as { modelVersion?: unknown }).modelVersion;
  return typeof modelVersion === "string" ? modelVersion : "";
}

function extractTokens(data: unknown): number {
  const usage = usageOf(data);
  if (typeof usage.totalTokenCount === "number") return usage.totalTokenCount;
  return (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0);
}

/** One non-streaming generateContent call with Google Search grounding; never throws. */
export async function searchGemini(
  ctx: MinimalCtx,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResult> {
  const googleSearch: Record<string, unknown> = {};
  // NOTE: excludeDomains is NOT a valid GoogleSearch field (400s). Domain
  // constraints belong in the query; the cited URLs are returned unfiltered.

  const startedAt = Date.now();

  const response = await geminiPost(
    ctx,
    SEARCH_MODEL,
    {
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ googleSearch }],
    },
    signal,
  );
  if (!response.ok) return { ok: false, reason: response.reason, status: response.status };
  const data = response.json;

  const candidate = extractCandidate(data);
  if (!candidate) return { ok: false, reason: "bad-response" };

  const answer = extractAnswer(candidate);
  const sources = extractSources(candidate);

  // No synthesized text AND no grounding chunks → nothing usable.
  if (!answer && sources.length === 0) return { ok: false, reason: "empty" };

  return {
    ok: true,
    outcome: {
      provider: "gemini",
      answer,
      sources,
      model: extractModel(data) || SEARCH_MODEL,
      tokens: extractTokens(data),
      durationMs: Date.now() - startedAt,
    },
  };
}
