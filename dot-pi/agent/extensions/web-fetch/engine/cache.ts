/**
 * Disk cache. Key = requested URL (meta records the final URL after redirects,
 * so revalidation attaches conditional headers on the right hop). Processed
 * markdown is canonical; raw HTML is kept gzipped for re-processing.
 */
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { CACHE_DIR, CACHE_TTL_SECONDS, MAX_STORED_CHARS } from "../shared/config.js";
import type { Truncation } from "../shared/envelope.js";

export interface CacheMeta {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
  contentType: string;
  rawBytes: number;
  /** Full extracted length before the storage cap — what an offset resume needs. */
  totalChars: number;
  storedChars: number;
  truncated: boolean;
}

export interface CachedEntry extends CacheMeta {
  text: string;
}

export interface CacheLookup {
  entry: CachedEntry;
  expired: boolean;
}

export interface CacheInput {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  contentType: string;
  rawBytes: number;
  text: string;
  etag?: string;
  lastModified?: string;
}

const keyOf = (url: string): string => createHash("sha256").update(url).digest("hex");
const metaPath = (k: string) => join(CACHE_DIR, `${k}.json`);
const textPath = (k: string) => join(CACHE_DIR, `${k}.md`);
const rawPath = (k: string) => join(CACHE_DIR, `${k}.raw.gz`);

export async function cacheGet(requestedUrl: string): Promise<CacheLookup | undefined> {
  const k = keyOf(requestedUrl);
  let meta: CacheMeta;
  try {
    meta = JSON.parse(await fs.readFile(metaPath(k), "utf8")) as CacheMeta;
  } catch {
    return undefined;
  }
  let text: string;
  try {
    text = await fs.readFile(textPath(k), "utf8");
  } catch {
    return undefined;
  }
  // Entries written before totalChars existed fall back to storedChars (untracked truncation).
  const entry: CachedEntry = { ...meta, totalChars: meta.totalChars ?? meta.storedChars, text };
  return { entry, expired: Date.now() - meta.fetchedAt > CACHE_TTL_SECONDS * 1000 };
}

/** Where the stored page was cut — undefined when nothing was cut. */
export function truncationOf(entry: CachedEntry): Truncation | undefined {
  return entry.totalChars > entry.storedChars
    ? { next_offset: entry.storedChars, total_chars: entry.totalChars }
    : undefined;
}

/** Build the stored form of a processed page: storage cap applied, provenance recorded. */
export function entryFrom(input: CacheInput, fetchedAt = Date.now()): { meta: CacheMeta; entry: CachedEntry } {
  const truncated = input.text.length > MAX_STORED_CHARS;
  const text = truncated ? input.text.slice(0, MAX_STORED_CHARS) : input.text;
  const meta: CacheMeta = {
    requestedUrl: input.requestedUrl,
    finalUrl: input.finalUrl,
    title: input.title,
    fetchedAt,
    etag: input.etag,
    lastModified: input.lastModified,
    contentType: input.contentType,
    rawBytes: input.rawBytes,
    totalChars: input.text.length,
    storedChars: text.length,
    truncated,
  };
  return { meta, entry: { ...meta, text } };
}

/** Write the processed page to disk; returns the entry with storage caps applied. */
export async function cachePut(
  input: CacheInput,
  raw?: Buffer,
  keepRaw?: boolean,
): Promise<{ meta: CacheMeta; entry: CachedEntry }> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const { meta, entry } = entryFrom(input);
  const k = keyOf(input.requestedUrl);
  await fs.writeFile(metaPath(k), JSON.stringify(meta));
  await fs.writeFile(textPath(k), entry.text);
  if (raw && keepRaw) await fs.writeFile(rawPath(k), gzipSync(raw));
  return { meta, entry };
}

/** A 304 from revalidation: the cached copy is current — just refresh the timestamp. */
export async function cacheTouch(requestedUrl: string): Promise<void> {
  const k = keyOf(requestedUrl);
  try {
    const meta = JSON.parse(await fs.readFile(metaPath(k), "utf8")) as CacheMeta;
    meta.fetchedAt = Date.now();
    meta.totalChars = meta.totalChars ?? meta.storedChars;
    await fs.writeFile(metaPath(k), JSON.stringify(meta));
  } catch {
    /* nothing cached to touch */
  }
}
