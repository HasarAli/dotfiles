import { Static, Type } from "typebox";
import { DEFAULT_MAX_TOKENS } from "../../shared/config.js";

/** Parameter schema for the `web_fetch` tool. */
export const webFetchParams = Type.Object({
  url: Type.String({ description: "http/https URL of a page or PDF" }),
  query: Type.Optional(
    Type.String({
      description:
        "What to extract from the page — a question or instruction for the reading model, " +
        "or keywords when `query_method` is `grep`. Omit to get the raw page text.",
    }),
  ),
  query_method: Type.Optional(
    Type.Union([Type.Literal("grep"), Type.Literal("distill")], {
      description:
        "How to answer `query` (default `distill`): `grep` — local keyword matches " +
        "with context, no API call; `distill` — a Gemini model reads the page and answers. " +
        "Ignored when `query` is omitted.",
    }),
  ),
  max_tokens: Type.Optional(
    Type.Number({
      description: `Ceiling on returned page text when not distilling (default ${DEFAULT_MAX_TOKENS} tokens)`,
    }),
  ),
  offset: Type.Optional(
    Type.Number({
      description: "Resume at this character offset after a truncated read; refetches past the stored cap",
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
