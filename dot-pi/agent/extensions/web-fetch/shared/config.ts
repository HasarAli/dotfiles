/** Env-tunable knobs shared across web-fetch modules. */

/** Path to the hound binary used as the private fetch child. */
export const HOUND_BIN = process.env.HOUND_BIN || `${process.env.HOME}/.local/bin/hound`;

/** Model that reads the page in `llm` mode. */
export const DISTILL_MODEL = process.env.FETCH_URL_MODEL || "gemini-3.5-flash-lite";

/** smart_fetch caps max_content_chars at 200k; ask for all of it when a model reads the page. */
export const DISTILL_CHARS = 200_000;

/** Default ceiling on returned page text when not distilling. */
export const DEFAULT_MAX_TOKENS = 1200;

/** Rough chars-per-token used to convert `max_tokens` into smart_fetch's char cap. */
export const CHARS_PER_TOKEN = 4;

/** Never let the char cap drop below this, so tiny `max_tokens` still returns something usable. */
export const MIN_CONTENT_CHARS = 500;

/** Stealth escalation and OCR run well past the SDK's 60s default. */
export const FETCH_TIMEOUT_MS = 300_000;

/** Default cache TTL passed to smart_fetch (seconds); 0 when `fresh` is set. */
export const CACHE_TTL_SECONDS = 3600;
