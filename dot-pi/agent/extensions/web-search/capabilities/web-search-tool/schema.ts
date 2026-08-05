import { Static, Type } from "typebox";

/** Parameter schema for the `web_search` tool. */
export const webSearchParams = Type.Object({
  query: Type.String({
    minLength: 2,
    description: "The search query. Be specific and include relevant keywords.",
  }),
  max_results: Type.Optional(
    Type.Number({
      minimum: 1,
      description: "Maximum cited sources to return.",
    }),
  ),
});

export type WebSearchParams = Static<typeof webSearchParams>;
