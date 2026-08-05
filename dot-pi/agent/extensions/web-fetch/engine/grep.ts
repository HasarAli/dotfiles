/**
 * Grep mode: keyword matches with context, no API call. Windows of
 * ±GREP_CONTEXT_CHARS around each hit, merged when they overlap, capped.
 */
import { GREP_CONTEXT_CHARS, GREP_MAX_MATCHES, GREP_MAX_RETURN_CHARS } from "../shared/config.js";

export interface GrepOutcome {
  matches: number; // windows returned
  total: number; // total occurrences in the page
  text: string;
  truncated: boolean;
}

export function grepPage(query: string, text: string, capChars: number = GREP_MAX_RETURN_CHARS): GrepOutcome {
  const needle = query.toLowerCase();
  const hay = text.toLowerCase();

  let total = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) total++;
  if (total === 0) return { matches: 0, total: 0, text: "", truncated: false };

  const ranges: Array<[number, number]> = [];
  let matches = 0;
  for (let i = 0; matches < GREP_MAX_MATCHES && (i = hay.indexOf(needle, i)) !== -1; i += needle.length) {
    const start = Math.max(0, i - GREP_CONTEXT_CHARS);
    const end = Math.min(text.length, i + needle.length + GREP_CONTEXT_CHARS);
    const prev = ranges[ranges.length - 1];
    if (prev && start <= prev[1]) prev[1] = Math.max(prev[1], end);
    else ranges.push([start, end]);
    matches++;
  }

  const parts: string[] = [];
  let chars = 0;
  for (const [s, e] of ranges) {
    if (parts.length) parts.push("…");
    parts.push(text.slice(s, e));
    chars += e - s;
  }
  const joined = parts.join("\n");
  const limit = Math.min(capChars, GREP_MAX_RETURN_CHARS); // user cap, never past the safety cap
  const truncated = chars > limit;
  const out = truncated ? joined.slice(0, limit) : joined;
  return { matches, total, text: out, truncated };
}
