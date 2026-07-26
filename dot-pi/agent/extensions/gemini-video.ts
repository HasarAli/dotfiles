/**
 * gemini-video — one tool, `gemini_video`: ask Gemini about a video.
 *
 * source = public YouTube URL → passed straight through as fileData.
 * source = local file path    → inlined (<15MB) or uploaded via the File API,
 *                               polled to ACTIVE, then referenced by uri.
 *
 * Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

const API = "https://generativelanguage.googleapis.com";
const INLINE_MAX = 15 * 1024 * 1024; // base64 inflation keeps the request under the ~20MB inline cap

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mpeg": "video/mpeg", ".mpg": "video/mpeg", ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv", ".3gp": "video/3gpp", ".flv": "video/x-flv",
};

const isYouTube = (s: string) =>
  /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(s);
const mimeFor = (p: string) => MIME[extname(p).toLowerCase()] ?? "video/mp4";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "gemini_video",
    label: "Gemini Video",
    description:
      "Analyze a video with Gemini: summarize, transcribe, answer questions, or extract " +
      "timestamps. `source` is a public YouTube URL or a local video file path.",
    parameters: Type.Object({
      source: Type.String({ description: "Public YouTube URL or local video file path" }),
      prompt: Type.String({ description: "What to do with the video, e.g. 'summarize with timestamps'" }),
      model: Type.Optional(Type.String({ description: "Gemini model (default gemini-2.5-flash)" })),
    }),
    async execute(_id, params, signal) {
      const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY (or GOOGLE_API_KEY) is not set");
      const model = params.model || "gemini-2.5-flash";
      const auth = { "x-goog-api-key": key };

      const videoPart = isYouTube(params.source)
        ? { fileData: { fileUri: params.source } }
        : await localVideoPart(params.source, auth, signal);

      const res = await fetch(`${API}/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal,
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [videoPart, { text: params.prompt }] }] }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

      const data: any = await res.json();
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p.text)
        .filter(Boolean)
        .join("\n")
        .trim();

      return {
        content: [{ type: "text", text: text || "(no text returned)" }],
        details: { model, usage: data.usageMetadata },
      };
    },
  });
}

async function localVideoPart(path: string, auth: Record<string, string>, signal?: AbortSignal) {
  const info = await stat(path).catch(() => {
    throw new Error(`No such file: ${path}`);
  });
  const mimeType = mimeFor(path);
  const bytes = await readFile(path);

  if (info.size <= INLINE_MAX) {
    return { inlineData: { mimeType, data: bytes.toString("base64") } };
  }
  const fileUri = await uploadFile(bytes, mimeType, basename(path), auth, signal);
  return { fileData: { fileUri, mimeType } };
}

// Resumable upload, then poll until the video finishes server-side processing (state ACTIVE).
async function uploadFile(
  bytes: Buffer,
  mimeType: string,
  name: string,
  auth: Record<string, string>,
  signal?: AbortSignal,
) {
  const start = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    signal,
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
    signal,
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Upload ${up.status}: ${await up.text()}`);

  let file: any = (await up.json()).file;
  while (file?.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`${API}/v1beta/${file.name}`, { headers: auth, signal });
    file = await poll.json();
  }
  if (file?.state !== "ACTIVE") {
    throw new Error(`File not active (${file?.state}): ${file?.error?.message ?? ""}`);
  }
  return file.uri as string;
}
