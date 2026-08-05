/**
 * One read of a URL: serve the fresh cache, revalidate, or fetch → process →
 * cache. Failure kinds escalate (needs_js → browser hint) and extraction is
 * never silently partial — truncation metadata rides on every ok result.
 */
import { cacheGet, cachePut, cacheTouch, entryFrom, type CacheInput, type CachedEntry } from "./cache.js";
import { fetchPage, type FetchFailureReason, type FetchOutcome, type Revalidate } from "./fetch.js";
import { processContent } from "./process.js";
import { NEEDS_JS_RAW_BYTES, NEEDS_JS_TEXT_CHARS } from "../shared/config.js";

export type PageReadErrorKind =
  | FetchFailureReason
  | "needs_js"
  | "unsupported_type"
  | "missing_tool"
  | "empty"
  | "bad_pages";

export interface PageReadOk {
  ok: true;
  entry: CachedEntry;
  /** Full processed text before the storage cap — present only after a fresh fetch. */
  fullText?: string;
  fromCache: boolean;
  revalidated: boolean;
  stale: boolean;
  status?: number;
}

export interface PageReadErr {
  ok: false;
  error: PageReadErrorKind;
  reason: string;
  status?: number;
  hint?: string;
}

export type PageRead = PageReadOk | PageReadErr;

export interface ReadOptions {
  /** Ignore the disk cache entirely (fresh=true). */
  bypassCache?: boolean;
  /** Only serve the cache if it holds text through this offset (offset resumes). */
  minChars?: number;
  /** Never write this read to the cache (pages=… reads are partial). */
  uncached?: boolean;
  /** PDF page spec ('1-5', '2,7-9') forwarded to the extractor. */
  pages?: string;
}

export async function readPage(url: string, signal: AbortSignal | undefined, opts: ReadOptions = {}): Promise<PageRead> {
  const hit = opts.bypassCache ? undefined : await cacheGet(url);
  const usable = hit !== undefined && (opts.minChars === undefined || hit.entry.storedChars >= opts.minChars);

  if (usable && !hit.expired) {
    return { ok: true, entry: hit.entry, fromCache: true, revalidated: false, stale: false, status: 200 };
  }

  // Revalidate only when the cached copy is usable — a 304 for a copy that
  // cannot serve the requested offset just confirms the wrong bytes.
  const revalidate: Revalidate | undefined = usable
    ? { etag: hit.entry.etag, lastModified: hit.entry.lastModified, finalUrl: hit.entry.finalUrl }
    : undefined;
  const outcome = await fetchPage(url, signal, revalidate);

  if (outcome.ok && outcome.revalidated) {
    if (!hit) return { ok: false, error: "http", reason: "304 revalidation without a cached copy", status: 304 };
    await cacheTouch(url);
    return { ok: true, entry: hit.entry, fromCache: true, revalidated: true, stale: false, status: 304 };
  }
  if (!outcome.ok) {
    // Serve stale, never fail silently — unless the stale copy lacks the requested offset.
    if (usable) return { ok: true, entry: hit.entry, fromCache: true, revalidated: false, stale: true };
    return {
      ok: false,
      error: outcome.reason,
      reason: outcome.detail,
      status: outcome.status,
      ...(outcome.reason === "needs_js" ? { hint: "use a browser tool" } : {}),
    };
  }
  return processAndCache(outcome, url, signal, opts);
}

async function processAndCache(
  outcome: Extract<FetchOutcome, { ok: true; revalidated: false }>,
  requestedUrl: string,
  signal: AbortSignal | undefined,
  opts: ReadOptions,
): Promise<PageRead> {
  const processed = await processContent(outcome.contentType, outcome.body, outcome.finalUrl, signal, opts.pages);
  switch (processed.kind) {
    case "unsupported_type":
      return { ok: false, error: "unsupported_type", reason: `Content-Type ${processed.type} is not supported` };
    case "bad_pages":
      return { ok: false, error: "bad_pages", reason: `page spec "${opts.pages}" is not valid — expected something like '1-5' or '2,7-9'` };
    case "missing_tool":
      return { ok: false, error: "missing_tool", reason: `${processed.tool} is not installed` };
    case "empty":
      if (outcome.body.length > NEEDS_JS_RAW_BYTES) {
        return { ok: false, error: "needs_js", reason: "no text extracted from a large HTML page", hint: "use a browser tool" };
      }
      return { ok: false, error: "empty", reason: "no text could be extracted" };
    case "ok": {
      if (processed.text.trim().length < NEEDS_JS_TEXT_CHARS && outcome.body.length > NEEDS_JS_RAW_BYTES) {
        return {
          ok: false,
          error: "needs_js",
          reason: "extracted text is implausibly short for the page size",
          hint: "use a browser tool",
        };
      }
      const input: CacheInput = {
        requestedUrl,
        finalUrl: outcome.finalUrl,
        title: processed.title,
        contentType: outcome.contentType,
        rawBytes: outcome.body.length,
        text: processed.text,
        etag: outcome.headers.etag,
        lastModified: outcome.headers["last-modified"],
      };
      const cached = opts.uncached ? entryFrom(input) : await cachePut(input, outcome.body, outcome.contentType.startsWith("text/html"));
      return {
        ok: true,
        entry: cached.entry,
        fullText: processed.text,
        fromCache: false,
        revalidated: false,
        stale: false,
        status: outcome.status,
      };
    }
  }
}
