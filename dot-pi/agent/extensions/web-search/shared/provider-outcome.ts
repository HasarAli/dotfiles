/**
 * Common contract for the Gemini server-side search provider. The engine
 * exposes one function that mirrors it:
 *
 *   searchGemini(ctx, query, signal): Promise<SearchResult>
 *
 * `SearchResult` is a discriminated union: `ok: true` carries the outcome,
 * `ok: false` carries a reason so callers can report the actual failure
 * instead of guessing.
 */

export interface SearchProviderSource {
  title: string;
  url: string;
}

export interface SearchProviderOutcome {
  /** The model's synthesized answer text (may be empty if only sources came back). */
  answer: string;
  /** Cited sources surfaced by the provider's server-side search. */
  sources: SearchProviderSource[];
  /** Model identifier as reported by the API (fall back to the configured name). */
  model: string;
  /** Approximate token usage (input + output) when the API reports it, else 0. */
  tokens: number;
  /** Wall time of the provider call in ms. */
  durationMs: number;
  /** Which provider produced this — the only one supported. */
  provider: "gemini";
}

/** Why a search did not produce an outcome. */
export type SearchFailureReason =
  | "no-key" // no API key in the registry or env
  | "request-failed" // network error before any response
  | "http-error" // the API answered non-2xx (status carries the code)
  | "bad-response" // response did not match the documented shape
  | "empty"; // no answer text and no grounding chunks

export type SearchResult =
  | { ok: true; outcome: SearchProviderOutcome }
  | { ok: false; reason: SearchFailureReason; status?: number };

/** Minimal shape of the pi ExtensionContext the modules need (harness mocks this). */
export interface MinimalCtx {
  modelRegistry?: {
    getApiKeyForProvider(provider: string): Promise<string | undefined>;
  };
}
