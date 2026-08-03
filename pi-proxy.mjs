/** pi-proxy — capture pi's system prompt & full request payload.
 *
 * Adapted from Matt Pocock's Claude Code proxy.
 * Sits between pi and any provider API, logs every request as readable Markdown.
 *
 * Run:   PROXY_UPSTREAM=api.deepseek.com node pi-proxy.mjs
 * Then point pi at it by overriding baseUrl in ~/.pi/agent/models.json.
 *
 * Zero runtime dependencies — Node built-ins only. Requires Node 18+.
 */

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PROXY_PORT ?? 8787);
const UPSTREAM = process.env.PROXY_UPSTREAM ?? "api.deepseek.com";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(HERE, "pi-logs");

const estTokens = (bytes) => Math.round(bytes / 4);

const isTokenCount = (reqPath) => reqPath.includes("count_tokens");

const REDACT = new Set(["authorization", "x-api-key", "api-key"]);

function forwardHeaders(headers, body) {
  const out = { ...headers };
  delete out["host"];
  delete out["connection"];
  delete out["accept-encoding"];
  delete out["transfer-encoding"];
  delete out["content-length"];
  if (body.length > 0) out["content-length"] = String(body.length);
  return out;
}

function baseName() {
  const stamp = new Date().toISOString().replace(/:/g, "-").replace(".", "-").replace("Z", "");
  return `${stamp}_${UPSTREAM.replace(/\./g, "_")}`;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function auditRequest(reqJson) {
  // OpenAI format: tools are in `tools` array with `type: "function"` wrapper
  // Anthropic format: tools are in `tools` array directly
  const tools = Array.isArray(reqJson?.tools) ? reqJson.tools : [];
  const toolRows = tools
    .map((t) => {
      const bytes = Buffer.byteLength(JSON.stringify(t));
      return { name: t?.function?.name ?? t?.name ?? "(unnamed)", bytes, tokens: estTokens(bytes) };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const toolsBytes = toolRows.reduce((n, r) => n + r.bytes, 0);

  // System prompt: Anthropic puts it in `system`, OpenAI in messages[0] with role=system
  let systemBytes = 0;
  if (reqJson?.system != null) {
    systemBytes = Buffer.byteLength(JSON.stringify(reqJson.system));
  } else if (Array.isArray(reqJson?.messages)) {
    const sysMsg = reqJson.messages.find((m) => m?.role === "system");
    if (sysMsg) systemBytes = Buffer.byteLength(JSON.stringify(sysMsg));
  }

  const totalBytes = Buffer.byteLength(JSON.stringify(reqJson ?? {}));

  return { toolRows, toolCount: toolRows.length, toolsBytes, systemBytes, totalBytes };
}

function renderAudit(a) {
  const pct = (b) => (a.totalBytes ? ((b / a.totalBytes) * 100).toFixed(1) : "0.0");
  const rows = a.toolRows
    .map((r) => `| ${r.name} | ${r.bytes.toLocaleString()} | ~${r.tokens.toLocaleString()} | ${pct(r.bytes)}% |`)
    .join("\n");

  return [
    "<audit>",
    "",
    `- **tools**: ${a.toolCount} definitions, ${a.toolsBytes.toLocaleString()} bytes (~${estTokens(a.toolsBytes).toLocaleString()} tokens)`,
    `- **system prompt**: ${a.systemBytes.toLocaleString()} bytes (~${estTokens(a.systemBytes).toLocaleString()} tokens)`,
    `- **total request**: ${a.totalBytes.toLocaleString()} bytes`,
    "",
    "**Tools, ranked by size:**",
    "",
    "| tool | bytes | ~tokens | % of request |",
    "| --- | --: | --: | --: |",
    rows,
    "",
    "</audit>",
  ].join("\n");
}

function printAudit(a, base) {
  const top = a.toolRows.slice(0, 12);
  const w = Math.max(4, ...top.map((r) => r.name.length));
  console.log(`\n[pi-proxy] ${a.toolCount} tools · ${a.toolsBytes.toLocaleString()} tool bytes · upstream=${UPSTREAM}`);
  for (const r of top) {
    console.log(`  ${r.name.padEnd(w)}  ${String(r.bytes).padStart(7)} B  ~${r.tokens} tok`);
  }
  if (a.toolRows.length > top.length) console.log(`  … ${a.toolRows.length - top.length} more`);
  console.log(`  pi-logs/${base}.md\n`);
}

// ---------------------------------------------------------------------------
// Markdown render
// ---------------------------------------------------------------------------

const fenceJson = (v) => "```json\n" + JSON.stringify(v, null, 2) + "\n```";

function extractSystemPrompt(reqJson) {
  // Anthropic format
  if (reqJson?.system != null) {
    if (typeof reqJson.system === "string") return reqJson.system;
    if (Array.isArray(reqJson.system)) {
      return reqJson.system
        .map((b) => (b?.type === "text" ? b.text : JSON.stringify(b)))
        .join("\n\n");
    }
    return JSON.stringify(reqJson.system);
  }
  // OpenAI format: look for system or developer message
  if (Array.isArray(reqJson?.messages)) {
    const sysMsg = reqJson.messages.find((m) => m?.role === "system" || m?.role === "developer");
    if (sysMsg) {
      if (typeof sysMsg.content === "string") return sysMsg.content;
      if (Array.isArray(sysMsg.content)) {
        return sysMsg.content.map((c) => (c?.type === "text" ? c.text : JSON.stringify(c))).join("\n\n");
      }
      return JSON.stringify(sysMsg.content);
    }
  }
  return "(no system prompt found)";
}

function renderTools(tools) {
  const rendered = tools.map((t) => {
    const name = t?.function?.name ?? t?.name ?? "(unnamed)";
    const desc = t?.function?.description ?? t?.description ?? "";
    const schema = t?.function?.parameters ?? t?.input_schema ?? null;
    const lines = [`### ${name}`, ""];
    if (desc) lines.push(desc, "");
    if (schema) lines.push(fenceJson(schema));
    return lines.join("\n");
  });
  return ["<tools>", "", rendered.join("\n\n"), "", "</tools>"].join("\n");
}

function renderMessages(messages) {
  if (!Array.isArray(messages)) return "<messages></messages>";
  const rendered = messages.map((m, i) => {
    const role = m.role ?? "unknown";
    let content = "";
    if (typeof m.content === "string") content = m.content;
    else if (Array.isArray(m.content)) {
      content = m.content
        .map((b) => {
          if (b?.type === "text") return b.text ?? "";
          if (b?.type === "tool_use") return `<tool-use name="${b.name}" id="${b.id ?? ""}">\n${fenceJson(b.input ?? {})}\n</tool-use>`;
          if (b?.type === "tool_result") return `<tool-result is-error="${!!b.is_error}">\n${typeof b.content === "string" ? b.content : fenceJson(b.content)}\n</tool-result>`;
          if (b?.type === "image") return `[image: ${b.source?.media_type ?? "unknown"}]`;
          return fenceJson(b);
        })
        .join("\n\n");
    } else {
      content = fenceJson(m.content);
    }
    return [`<message index="${i + 1}" role="${role}">`, "", content, "", "</message>"].join("\n");
  });
  return ["<messages>", "", rendered.join("\n\n"), "", "</messages>"].join("\n");
}

function renderMarkdown(c, audit) {
  const headers = Object.entries(c.headers).map(([k, v]) =>
    `${k}: ${REDACT.has(k.toLowerCase()) ? "[REDACTED]" : Array.isArray(v) ? v.join(", ") : v ?? ""}`
  );
  const req = c.reqJson;
  const systemPrompt = extractSystemPrompt(req);
  const parts = [
    ["<meta>", "", `- **timestamp**: ${c.timestamp}`, `- **model**: ${req?.model ?? "unknown"}`, `- **endpoint**: ${c.method} ${c.path}`, `- **upstream**: ${UPSTREAM}`, `- **upstream status**: ${c.statusCode}`, "", "</meta>"].join("\n"),
    renderAudit(audit),
    ["<headers>", "", "```", ...headers, "```", "", "</headers>"].join("\n"),
    ["<system-prompt>", "", systemPrompt, "", "</system-prompt>"].join("\n"),
  ];
  if (Array.isArray(req?.tools) && req.tools.length) parts.push(renderTools(req.tools));
  parts.push(renderMessages(req?.messages));
  return parts.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

http.createServer((req, res) => {
  const reqPath = req.url ?? "/";
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const timestamp = new Date().toISOString();
    const base = baseName();

    const upstream = https.request(
      { hostname: UPSTREAM, port: 443, path: reqPath, method: req.method, headers: forwardHeaders(req.headers, body) },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        const respChunks = [];
        up.on("data", (c) => { respChunks.push(c); res.write(c); });
        up.on("end", () => {
          res.end();
          if (isTokenCount(reqPath)) return;
          try {
            const reqJson = JSON.parse(body.toString("utf8"));
            const audit = auditRequest(reqJson);
            fs.mkdirSync(LOG_DIR, { recursive: true });
            fs.writeFileSync(path.join(LOG_DIR, `${base}.request.txt`), body.toString("utf8"));
            fs.writeFileSync(path.join(LOG_DIR, `${base}.md`), renderMarkdown({ reqJson, timestamp, method: req.method ?? "POST", path: reqPath, statusCode: up.statusCode ?? 0, headers: req.headers }, audit));
            printAudit(audit, base);
          } catch (err) {
            console.error(`[pi-proxy] could not render: ${err.message}`);
          }
        });
      }
    );
    upstream.on("error", (err) => {
      console.error(`[pi-proxy] upstream error: ${err.message}`);
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `pi-proxy upstream error: ${err.message}` }));
    });
    if (body.length > 0) upstream.write(body);
    upstream.end();
  });
}).listen(PORT, () => {
  console.log(`[pi-proxy] listening on http://localhost:${PORT}`);
  console.log(`[pi-proxy] forwarding to https://${UPSTREAM}`);
  console.log(`[pi-proxy] point pi at it: set baseUrl to http://localhost:${PORT} in models.json`);
});
