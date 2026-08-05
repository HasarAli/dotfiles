/**
 * Shared Gemini generateContent plumbing for the web-fetch and web-search
 * extensions: key resolution, request composition, response narrowing, and
 * failure text. Neither extension imports the other — this module is the one
 * place the REST contract is expressed, so key lookup and failure vocabulary
 * cannot drift apart between the two tools.
 *
 * Not itself an extension: it has no index.ts, so pi's auto-discovery of
 * `extensions/<dir>/index.ts` never loads it; it only exists to be imported.
 */

/** The minimal ctx shape these modules need (harness mocks this). */
export interface GeminiCtx {
  modelRegistry?: {
    getApiKeyForProvider(provider: string): Promise<string | undefined>;
  };
}

export type GeminiFailureReason = "no-key" | "request-failed" | "http-error" | "bad-response";

export type GeminiPost =
  | { ok: true; json: unknown }
  | { ok: false; reason: GeminiFailureReason; status?: number };

/** Token usage reported by the API, all fields optional. */
export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  toolUsePromptTokenCount?: number;
}

export async function resolveApiKey(ctx: GeminiCtx): Promise<string | undefined> {
  try {
    // "google" is pi's model-registry id for Gemini (see models-store.json).
    const key = await ctx.modelRegistry?.getApiKeyForProvider("google");
    if (key) return key;
  } catch {
    /* no registry entry */
  }
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** One non-throwing generateContent POST; every failure is a value. */
export async function geminiPost(
  ctx: GeminiCtx,
  model: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<GeminiPost> {
  const key = await resolveApiKey(ctx);
  if (!key) return { ok: false, reason: "no-key" };

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const s = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal: s,
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch {
    return { ok: false, reason: "request-failed" };
  }
  if (!res.ok) return { ok: false, reason: "http-error", status: res.status };

  try {
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, reason: "bad-response" };
  }
}

/** The candidate object, if candidates[0] is an object — the fields are left unvalidated. */
export interface GeminiCandidateLike {
  content?: unknown;
  urlContextMetadata?: unknown;
  groundingMetadata?: unknown;
}

export function candidateOf(data: unknown): GeminiCandidateLike | undefined {
  if (!data || typeof data !== "object") return undefined;
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const candidate = candidates[0];
  if (!candidate || typeof candidate !== "object") return undefined;
  return candidate as GeminiCandidateLike;
}

/** candidates[0].content.parts, unless the shape does not hold. */
export function candidateParts(data: unknown): Array<{ text?: unknown }> | undefined {
  const candidate = candidateOf(data);
  if (!candidate?.content || typeof candidate.content !== "object") return undefined;
  const parts = (candidate.content as { parts?: unknown }).parts;
  return Array.isArray(parts) ? parts : undefined;
}

/** Joined non-empty text parts, trimmed; "" when absent. */
export function textOf(parts: Array<{ text?: unknown }> | undefined): string {
  const texts: string[] = [];
  for (const part of parts ?? []) {
    if (part && typeof part === "object" && typeof part.text === "string" && part.text) texts.push(part.text);
  }
  return texts.join("\n").trim();
}

/** usageMetadata with only numeric fields kept, as reported. */
export function usageOf(data: unknown): GeminiUsage {
  if (!data || typeof data !== "object") return {};
  const usage = (data as { usageMetadata?: unknown }).usageMetadata;
  if (!usage || typeof usage !== "object") return {};
  const u = usage as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    promptTokenCount: num(u.promptTokenCount),
    candidatesTokenCount: num(u.candidatesTokenCount),
    totalTokenCount: num(u.totalTokenCount),
    toolUsePromptTokenCount: num(u.toolUsePromptTokenCount),
  };
}

/** Human-readable reason for the failure reasons both extensions share. */
export function geminiFailureText(reason: GeminiFailureReason | "empty", status?: number): string {
  switch (reason) {
    case "no-key":
      return "No Gemini API key found — set GEMINI_API_KEY or GOOGLE_API_KEY, or register one in the model store.";
    case "request-failed":
      return "Network error reaching the Gemini API.";
    case "http-error":
      return `The Gemini API returned HTTP ${status ?? "unknown"}.`;
    case "bad-response":
      return "The Gemini API returned an unexpected response shape.";
    case "empty":
      return "The Gemini API returned no usable text.";
  }
}
