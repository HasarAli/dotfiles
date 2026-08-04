#!/usr/bin/env node
/**
 * gemini-video — ask Gemini about a video from the CLI.
 *
 * source = public YouTube URL → passed straight through as fileData.
 * source = local file path    → inlined (<15MB) or uploaded via the File API,
 *                               polled to ACTIVE, then referenced by uri.
 *
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.
 *
 * Usage:
 *   node gemini-video.mjs <source> <prompt> [model]
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API = "https://generativelanguage.googleapis.com";
const INLINE_MAX = 15 * 1024 * 1024; // base64 inflation keeps the request under the ~20MB inline cap

const MIME = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mpeg": "video/mpeg", ".mpg": "video/mpeg", ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv", ".3gp": "video/3gpp", ".flv": "video/x-flv",
};

const isYouTube = (s) =>
  /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(s);
const mimeFor = (p) => MIME[extname(p).toLowerCase()] ?? "video/mp4";

async function main() {
  const [source, prompt, model = "gemini-2.5-flash"] = process.argv.slice(2);
  if (!source || !prompt) {
    console.error(
      "Usage: node gemini-video.mjs <source> <prompt> [model]\n" +
      "  source  public YouTube URL or local video file path\n" +
      "  prompt  what to do with the video, e.g. 'summarize with timestamps'\n" +
      "  model   Gemini model (default gemini-2.5-flash)\n" +
      "Requires GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.",
    );
    process.exit(1);
  }

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set");
    process.exit(1);
  }
  const auth = { "x-goog-api-key": key };

  let videoPart;
  try {
    videoPart = isYouTube(source)
      ? { fileData: { fileUri: source } }
      : await localVideoPart(source, auth);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let res;
  try {
    res = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [videoPart, { text: prompt }] }] }),
    });
  } catch (err) {
    console.error(`Gemini request failed: ${err.message}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Gemini ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  console.log(text || "(no text returned)");
}

async function localVideoPart(path, auth) {
  const info = await stat(path).catch(() => {
    throw new Error(`No such file: ${path}`);
  });
  const mimeType = mimeFor(path);
  const bytes = await readFile(path);

  if (info.size <= INLINE_MAX) {
    return { inlineData: { mimeType, data: bytes.toString("base64") } };
  }
  const fileUri = await uploadFile(bytes, mimeType, basename(path), auth);
  return { fileData: { fileUri, mimeType } };
}

// Resumable upload, then poll until the video finishes server-side processing (state ACTIVE).
async function uploadFile(bytes, mimeType, name, auth) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      ...auth,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { displayName: name } }),
  });
  if (!start.ok) throw new Error(`Upload start ${start.status}: ${await start.text()}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No upload URL returned by File API");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Upload ${up.status}: ${await up.text()}`);

  let file = (await up.json()).file;
  while (file?.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${API}/v1beta/${file.name}`, { headers: auth });
    file = await poll.json();
  }
  if (file?.state !== "ACTIVE") {
    throw new Error(`File not active (${file?.state}): ${file?.error?.message ?? ""}`);
  }
  return file.uri;
}

main();
