import { DISTILL_MODEL } from "../shared/config.js";

const SYSTEM =
  "You are the extraction stage of a coding agent's web fetch. Answer the request from the " +
  "page below. Quote identifiers, versions, numbers and code exactly. Omit preamble, " +
  "restatement and closing summary. If the page does not answer the request, say so in one " +
  "line and describe what the page does contain.";

/** Gemini's usage counters (optional — the model may report none). */
export interface DistillUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export interface DistillResult {
  text: string;
  usage: DistillUsage;
}

/**
 * Resolve the Gemini API key. Only needed in `llm` mode — callers should ask for it
 * lazily so raw and bm25 fetches work without one.
 */
export function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set; call web_fetch without `query` " +
        "(or with `query_method: 'bm25'`) to get raw page text",
    );
  }
  return key;
}

/**
 * Ask the distiller model to answer `prompt` from `page`. `page` must already carry
 * the truncation note (see shared/page.ts) so a partial page is never read as whole.
 */
export async function distill(
  key: string,
  prompt: string,
  page: string,
  signal?: AbortSignal,
): Promise<DistillResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${DISTILL_MODEL}:generateContent`,
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

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: DistillUsage;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text)
    .filter((t): t is string => Boolean(t))
    .join("\n")
    .trim();
  return { text: text || "(distiller returned nothing)", usage: data.usageMetadata ?? {} };
}
