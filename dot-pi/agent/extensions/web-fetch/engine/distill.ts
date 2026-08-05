/**
 * Gemini extraction over already-fetched page text — the distiller never
 * fetches, never throws. Request plumbing (key, POST, response narrowing)
 * lives in extensions/shared/gemini.ts, shared with web-search.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DISTILL_MODEL, GEMINI_TIMEOUT_MS } from "../shared/config.js";
import { candidateParts, geminiPost, textOf, usageOf } from "../../shared/gemini.js";

const SYSTEM =
  "You are the extraction stage of a coding agent's web fetch. Answer the request from the " +
  "page below. Quote identifiers, versions, numbers and code exactly. Omit preamble, " +
  "restatement and closing summary. If the page does not answer the request, say so in one " +
  "line and describe what the page does contain.";

export interface DistillUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export type DistillResult =
  | { ok: true; text: string; usage: DistillUsage; model: string }
  | { ok: false; reason: "no-key" | "request-failed" | "http-error" | "bad-response" | "empty"; status?: number };

export async function distill(
  ctx: ExtensionContext,
  prompt: string,
  page: string,
  signal?: AbortSignal,
): Promise<DistillResult> {
  const res = await geminiPost(
    ctx,
    DISTILL_MODEL,
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ parts: [{ text: `REQUEST: ${prompt}\n\nPAGE:\n${page}` }] }],
    },
    signal,
    GEMINI_TIMEOUT_MS,
  );
  if (!res.ok) return { ok: false, reason: res.reason, status: res.status };

  const text = textOf(candidateParts(res.json));
  if (!text) return { ok: false, reason: "empty" };

  const { promptTokenCount, candidatesTokenCount } = usageOf(res.json);
  return { ok: true, text, usage: { promptTokenCount, candidatesTokenCount }, model: DISTILL_MODEL };
}
