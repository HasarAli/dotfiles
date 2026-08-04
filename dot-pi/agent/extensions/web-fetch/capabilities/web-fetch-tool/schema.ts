import { Static, Type } from "typebox";
import { DEFAULT_MAX_TOKENS } from "../../shared/config.js";

/** Parameter schema for the `web_fetch` tool. */
export const webFetchParams = Type.Object({
  url: Type.String({ description: "http/https URL of a page or PDF" }),
  query: Type.Optional(
    Type.String({
      description:
        "What to extract from the page — a question or instruction for the reading model, " +
        "or keywords when `query_method` is `bm25`. Omit to get the raw page text.",
    }),
  ),
  query_method: Type.Optional(
    Type.Union([Type.Literal("llm"), Type.Literal("bm25")], {
      description:
        "How to answer `query` (default `llm`): `llm` — a model reads the page and " +
        "returns the answer; `bm25` — return the page blocks most " +
        "relevant to `query`, no model call. Ignored when `query` is omitted.",
    }),
  ),
  max_tokens: Type.Optional(
    Type.Number({
      description: `Ceiling on returned page text when not using the \`llm\` method (default ${DEFAULT_MAX_TOKENS})`,
    }),
  ),
  offset: Type.Optional(
    Type.Number({
      description: "Resume at this character offset after a truncated read",
    }),
  ),
  pages: Type.Optional(
    Type.String({ description: "PDF only: page spec like '1-5' or '2,7-9'" }),
  ),
  fresh: Type.Optional(
    Type.Boolean({ description: "Bypass the cache and refetch" }),
  ),
});

export type WebFetchParams = Static<typeof webFetchParams>;
