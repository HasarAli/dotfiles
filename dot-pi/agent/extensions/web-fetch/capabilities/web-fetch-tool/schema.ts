import { Static, Type } from "typebox";

/** Parameter schema for the `web_fetch` tool. */
export const webFetchParams = Type.Object({
  url: Type.String({ description: "http/https URL of a page or PDF" }),
  query: Type.Optional(
    Type.String({
      description: "What to extract — a question, instruction, or keywords. Omit for raw page text.",
    }),
  ),
  query_method: Type.Optional(
    Type.Union([Type.Literal("grep"), Type.Literal("distill")], {
      description: "`grep` for local keyword matches; `distill` for model-assisted reading (default).",
    }),
  ),
  pages: Type.Optional(
    Type.String({ description: "PDF only: page spec like '1-5' or '2,7-9'" }),
  ),
});

export type WebFetchParams = Static<typeof webFetchParams>;
