import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { searchGemini } from "../../engine/gemini-search.js";
import type { SearchProviderOutcome } from "../../shared/provider-outcome.js";
import { geminiFailureText } from "../../../shared/gemini.js";
import type { WebSearchParams } from "./schema.js";

/** Runs the `web_search` flow and shapes the result for the agent. */
export async function executeWebSearch(
  params: WebSearchParams,
  signal: AbortSignal | undefined,
  ctx: ExtensionContext,
) {
  const query = params.query.trim();
  if (!query) {
    return {
      content: [{ type: "text" as const, text: "Error: query is required." }],
      details: { error: "query required" },
      isError: true,
    };
  }

  const result = await searchGemini(ctx, query, signal);
  if (!result.ok) {
    // "empty" is a search outcome, not a Gemini failure — phrase it as such.
    const text =
      result.reason === "empty"
        ? `No results for: ${query}.`
        : `Web search failed for: ${query}. ${geminiFailureText(result.reason, result.status)}`;
    return {
      content: [{ type: "text" as const, text }],
      details: { error: result.reason },
      isError: true,
    };
  }
  const outcome: SearchProviderOutcome = result.outcome;

  const sources =
    params.max_results != null ? outcome.sources.slice(0, params.max_results) : outcome.sources;

  const sourceText = sources.length
    ? [
        "",
        "Sources:",
        ...sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`),
      ].join("\n")
    : "";

  return {
    content: [
      {
        type: "text" as const,
        text: `${outcome.answer || `No results for: ${query}`}${sourceText}\n\n— Gemini · ${outcome.model} · ${outcome.tokens.toLocaleString()} tokens`,
      },
    ],
    details: {
      provider: outcome.provider,
      sources,
      model: outcome.model,
      tokens: outcome.tokens,
      duration_ms: outcome.durationMs,
    },
  };
}
