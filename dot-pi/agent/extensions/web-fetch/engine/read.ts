/**
 * One read of a URL: fetch → process → return. Failure kinds escalate
 * (needs_js → browser hint).
 */
import { fetchPage, type FetchFailureReason } from "./fetch.js";
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
  finalUrl: string;
  title: string;
  text: string;
  status: number;
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
  /** PDF page spec ('1-5', '2,7-9') forwarded to the extractor. */
  pages?: string;
}

export async function readPage(url: string, signal: AbortSignal | undefined, opts: ReadOptions = {}): Promise<PageRead> {
  const outcome = await fetchPage(url, signal);

  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason,
      reason: outcome.detail,
      status: outcome.status,
      ...(outcome.reason === "needs_js" ? { hint: "use a browser tool" } : {}),
    };
  }

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
      return {
        ok: true,
        finalUrl: outcome.finalUrl,
        title: processed.title,
        text: processed.text,
        status: outcome.status,
      };
    }
  }
}
