/** Env-tunable knobs shared across web-fetch modules. */

/**
 * Model that reads the page in `distill` mode (both urlContext and local paths);
 * `FETCH_URL_MODEL` overrides.
 */
export const DISTILL_MODEL = process.env.FETCH_URL_MODEL || "gemini-3.6-flash";

/**
 * Primary path for `distill`: server-side urlContext fetch. Set
 * WEB_FETCH_SERVER_FETCH=0 to force the local curl pipeline everywhere.
 */
export const SERVER_FETCH_ENABLED = process.env.WEB_FETCH_SERVER_FETCH !== "0";

/** Rough chars-per-token used for token↔char conversions. */
export const CHARS_PER_TOKEN = 4;

/** Default ceiling on returned page text (chars) in bare mode. */
export const DEFAULT_MAX_CHARS = 50_000;

/** GenerateContent call timeout. */
export const GEMINI_TIMEOUT_MS = 60_000;

/** curl exit codes we map onto named fetch failures. */
export const CURL_EXIT_TOO_BIG = 63;
export const CURL_EXIT_TIMEOUT = 28;

/** How many bytes of a challenge body to sniff for the Cloudflare interstitial. */
export const CF_CHALLENGE_PROBE_BYTES = 2000;

/** How many parent directories a module lookup walks before giving up. */
export const MAX_MODULE_LOOKUP_DEPTH = 8;

/** Per-hop fetch limits (5 hops × 60s ≈ the 300s overall budget the old fetch had). */
export const FETCH_TIMEOUT_MS = 60_000;
export const CONNECT_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;
export const MAX_RAW_BYTES = 50 * 1024 * 1024;

/** Browser-ish UA so servers don't 403 the plain curl default. */
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** needs_js heuristic: near-empty extraction from a large HTML page. */
export const NEEDS_JS_TEXT_CHARS = 200;
export const NEEDS_JS_RAW_BYTES = 20_000;

/** Grep mode knobs. */
export const GREP_MAX_MATCHES = 20;
export const GREP_CONTEXT_CHARS = 200;
export const GREP_MAX_RETURN_CHARS = 12_000;

/** Extraction child timeouts (defuddle, pdftotext). */
export const EXTRACT_TIMEOUT_MS = 60_000;

