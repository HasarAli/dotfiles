/**
 * SSRF-guarded curl fetcher.
 *
 * Every hop: resolve the hostname ourselves → reject if ANY address is
 * private/loopback/link-local → pin the validated addresses with `--resolve`
 * so curl cannot be DNS-rebound to a private target mid-request → curl without
 * following redirects → re-validate each hop's Location, max MAX_REDIRECTS.
 */
import { spawn } from "node:child_process";
import { promises as dns } from "node:dns";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  CF_CHALLENGE_PROBE_BYTES,
  CONNECT_TIMEOUT_MS,
  CURL_EXIT_TIMEOUT,
  CURL_EXIT_TOO_BIG,
  FETCH_TIMEOUT_MS,
  MAX_RAW_BYTES,
  MAX_REDIRECTS,
  USER_AGENT,
} from "../shared/config.js";

export type FetchFailureReason =
  | "blocked_private"
  | "too_big"
  | "needs_auth"
  | "needs_js"
  | "http"
  | "network"
  | "timeout"
  | "unsupported_scheme"
  | "too_many_redirects";

export type FetchOutcome =
  | { ok: true; revalidated: false; status: number; contentType: string; body: Buffer; finalUrl: string; headers: Record<string, string> }
  | { ok: true; revalidated: true; status: 304; finalUrl: string }
  | { ok: false; reason: FetchFailureReason; detail: string; status?: number };

/** Revalidation state from the cache; applied on the hop that reaches finalUrl. */
export interface Revalidate {
  etag?: string;
  lastModified?: string;
  finalUrl: string;
}

class FetchFailure extends Error {
  readonly reason: FetchFailureReason;
  readonly status?: number;

  constructor(reason: FetchFailureReason, detail: string, status?: number) {
    super(detail);
    this.reason = reason;
    this.status = status;
  }
}

const ACCEPT = "Accept: text/html,application/xhtml+xml,application/pdf,application/json;q=0.9,*/*;q=0.5";
const LOGIN_PATH = /\/(login|signin|sso|sign-in)(\/|$)/i;

/**
 * Cloudflare bot-check detection: the `cf-mitigated: challenge` header, or a
 * "Just a moment..." interstitial body on a cloudflare-served 403.
 */
function isCloudflareChallenge(headers: Record<string, string>, body: Buffer): boolean {
  const mitigated = headers["cf-mitigated"];
  if (mitigated && /challenge/i.test(mitigated)) return true;
  return (
    headers.server?.toLowerCase().includes("cloudflare") &&
    /just a moment/i.test(body.subarray(0, CF_CHALLENGE_PROBE_BYTES).toString("utf8"))
  );
}

/** IPv4 that must never be reached: RFC1918, loopback, link-local, CGNAT, reserved. */
function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → unsafe
  const [a, b, c] = p;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmark 198.18/15
    a >= 224 // multicast + reserved
  );
}

function isPrivateIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateIpv4(v.slice(7)); // IPv4-mapped
  return (
    v.startsWith("fc") || v.startsWith("fd") || // fc00::/7 unique local
    v.startsWith("fe") || // fe80::/10 link-local, fec0::/10 site-local
    v.startsWith("ff") || // multicast
    v.startsWith("2001:db8") // documentation
  );
}

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family === 6) return isPrivateIpv6(ip);
  return true; // not an IP at all → treat as unsafe (callers only pass IP literals here)
}

interface Target {
  hostname: string;
  port: number;
  ips: string[];
  href: string;
}

/** Resolve + validate one URL; rejects non-public targets before curl ever runs. */
async function resolveTarget(href: string): Promise<Target> {
  const u = new URL(href);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new FetchFailure("unsupported_scheme", `scheme ${u.protocol} is not allowed`);
  }
  const hostname = u.hostname;
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;

  const ips: string[] = [];
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new FetchFailure("blocked_private", `${hostname} is not a public address`);
    ips.push(hostname);
  } else {
    let records: Array<{ address: string; family: number }>;
    try {
      records = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new FetchFailure("network", `DNS lookup failed for ${hostname}`);
    }
    if (records.length === 0) throw new FetchFailure("network", `no addresses for ${hostname}`);
    const bad = records.find((r) => isPrivateIp(r.address));
    if (bad) throw new FetchFailure("blocked_private", `${hostname} resolves to non-public ${bad.address}`);
    // Pin v4 when available: boxes without a working v6 route fail fast on v6 pins.
    const v4 = records.filter((r) => r.family === 4).map((r) => r.address);
    ips.push(...(v4.length ? v4 : records.map((r) => r.address)));
  }
  return { hostname, port, ips, href: u.href };
}

function parseHeaders(dump: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of dump.split(/\r?\n/)) {
    if (!line || /^HTTP\//.test(line) || /^\s/.test(line)) continue; // status lines + folded headers
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    if (!headers[key]) headers[key] = line.slice(i + 1).trim();
  }
  return headers;
}

interface HopResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

async function fetchHop(
  target: Target,
  signal: AbortSignal | undefined,
  revalidate: Revalidate | undefined,
): Promise<HopResult> {
  const bodyPath = join(tmpdir(), `pi-web-fetch-${randomUUID()}.body`);
  const headerPath = join(tmpdir(), `pi-web-fetch-${randomUUID()}.hdr`);
  const args = [
    "-sS",
    "--proto", "=http,https",
    "--compressed",
    "--max-time", String(Math.ceil(FETCH_TIMEOUT_MS / 1000)),
    "--connect-timeout", String(Math.ceil(CONNECT_TIMEOUT_MS / 1000)),
    "--max-filesize", String(MAX_RAW_BYTES),
    "-A", USER_AGENT,
    "-H", ACCEPT,
    "-o", bodyPath,
    "-D", headerPath,
    "-w", "%{http_code}",
    ...(revalidate?.etag ? ["-H", `If-None-Match: ${revalidate.etag}`] : []),
    ...(revalidate?.lastModified ? ["-H", `If-Modified-Since: ${revalidate.lastModified}`] : []),
    ...target.ips.flatMap((ip) => ["--resolve", `${target.hostname}:${target.port}:${ip}`]),
    target.href,
  ];

  let exit: number | null = null;
  let codeOut = "";
  let errOut = "";
  try {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"], signal });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (codeOut += d));
    child.stderr.on("data", (d: string) => (errOut += d));
    exit = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
  } catch (e) {
    throw new DOMException("aborted", "AbortError");
  }

  try {
    if (exit === null) throw new DOMException("aborted", "AbortError");
    if (exit === CURL_EXIT_TOO_BIG) throw new FetchFailure("too_big", `response exceeds ${MAX_RAW_BYTES} bytes`);
    if (exit === CURL_EXIT_TIMEOUT) throw new FetchFailure("timeout", `no response within ${FETCH_TIMEOUT_MS / 1000}s`);
    if (exit !== 0) {
      throw new FetchFailure("network", `curl exited ${exit}${errOut ? `: ${errOut.trim().slice(0, 200)}` : ""}`);
    }
    const status = Number(codeOut.trim()) || 0;
    const headers = parseHeaders(await fs.readFile(headerPath, "utf8"));
    let body = Buffer.alloc(0);
    if (status !== 304 && status !== 204) {
      try {
        body = await fs.readFile(bodyPath);
      } catch {
        body = Buffer.alloc(0);
      }
    }
    return { status, headers, body };
  } finally {
    await fs.rm(bodyPath, { force: true }).catch(() => {});
    await fs.rm(headerPath, { force: true }).catch(() => {});
  }
}

function fail(reason: FetchFailureReason, detail: string, status?: number): FetchOutcome {
  return { ok: false, reason, detail, status };
}

function failFor(e: unknown): FetchOutcome {
  if (e instanceof FetchFailure) return fail(e.reason, e.message, e.status);
  if (e instanceof DOMException && e.name === "AbortError") throw e;
  return fail("network", String((e as Error).message || e));
}

/**
 * Fetch with redirects followed manually, every hop re-resolved and validated.
 * `revalidate` attaches conditional headers only on the hop that reaches the
 * cached resource's final URL.
 */
export async function fetchPage(
  rawUrl: string,
  signal?: AbortSignal,
  revalidate?: Revalidate,
): Promise<FetchOutcome> {
  let current: string;
  try {
    current = new URL(rawUrl).href;
  } catch {
    return fail("network", `malformed URL: ${rawUrl}`);
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let target: Target;
    try {
      target = await resolveTarget(current);
    } catch (e) {
      return failFor(e);
    }
    const hopRevalidate = revalidate && current === revalidate.finalUrl ? revalidate : undefined;

    let res: HopResult;
    try {
      res = await fetchHop(target, signal, hopRevalidate);
    } catch (e) {
      return failFor(e);
    }
    const { status, headers, body } = res;

    if (status === 304) return { ok: true, revalidated: true, status, finalUrl: current };
    // A 403 with Cloudflare's challenge headers is a bot-check, not an auth wall —
    // no credentials fix it; only a JS-capable browser passes.
    if (status === 403 && isCloudflareChallenge(headers, body)) {
      return fail("needs_js", "Cloudflare challenge — needs a JS-capable browser", status);
    }
    if (status === 401 || status === 403) return fail("needs_auth", `HTTP ${status}`, status);
    if (status >= 300 && status < 400) {
      const loc = headers.location;
      if (!loc) return fail("http", `HTTP ${status} without Location`, status);
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        return fail("http", `unparseable redirect: ${loc}`, status);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        return fail("unsupported_scheme", `redirect to ${next.protocol}//`);
      }
      if (LOGIN_PATH.test(next.pathname)) return fail("needs_auth", `redirected to ${next.href}`, status);
      current = next.href;
      continue;
    }
    if (status < 200 || status >= 300) return fail("http", `HTTP ${status}`, status);

    return {
      ok: true,
      revalidated: false,
      status,
      finalUrl: current,
      contentType: headers["content-type"] || "",
      headers,
      body,
    };
  }
  return fail("too_many_redirects", `more than ${MAX_REDIRECTS} redirects`);
}
