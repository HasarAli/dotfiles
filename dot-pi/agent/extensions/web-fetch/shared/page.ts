/** The JSON shape hound's `mcp_smart_fetch` returns (embedded in a text block). */
export interface Page {
  content?: string[];
  url?: string;
  status: number;
  error?: string;
  fetcher_used?: string;
  escalation_path?: string;
  page_type?: string;
  cached?: boolean;
  is_truncated?: boolean;
  next_offset?: number;
  total_extracted_chars?: number;
}

/** Hound returns page text as a list of blocks; join them the way smart_fetch staged them. */
export const bodyOf = (page: Page): string => (page.content ?? []).join("\n");

/**
 * The distiller must not read a partial page as if it were the whole one — that is exactly
 * how Gemini's url_context reports a truncation point as the end of the document.
 */
export function truncationNote(page: Page): string {
  if (!page.is_truncated) return "";
  return (
    `\n\n[TRUNCATED at ${page.next_offset} of ${page.total_extracted_chars} chars. Content past this ` +
    `point is NOT present — do not treat the last entry above as the document's last entry.]`
  );
}

/** Hint telling the agent how to fetch the rest of a truncated page. */
export const resumeHint = (page: Page): string =>
  page.is_truncated ? `\n[More at offset=${page.next_offset} of ${page.total_extracted_chars} chars.]` : "";
