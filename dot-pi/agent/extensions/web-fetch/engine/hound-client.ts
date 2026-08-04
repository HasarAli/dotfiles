import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FETCH_TIMEOUT_MS, HOUND_BIN } from "../shared/config.js";
import type { Page } from "../shared/page.js";

/** Arguments forwarded to hound's `mcp_smart_fetch`. */
export type SmartFetchArgs = {
  url: string;
  max_content_chars: number;
  cache_ttl: number;
  offset?: number;
  pages?: string;
  focus?: string;
};

/**
 * A private hound child, connected over stdio MCP and reused for the session —
 * separate from any hound wired into mcp.json.
 */
export class HoundClient {
  private client?: Promise<Client>;

  /** Fetch one page; returns the parsed smart_fetch payload (or a best-effort body). */
  async smartFetch(args: SmartFetchArgs, signal?: AbortSignal): Promise<Page> {
    const client = await this.connect();
    const res = await client.callTool({ name: "mcp_smart_fetch", arguments: args }, undefined, {
      signal,
      timeout: FETCH_TIMEOUT_MS,
    });
    const text = res.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    try {
      return JSON.parse(text);
    } catch {
      // Not JSON — hound failed out-of-band; surface the raw text as a healthy page.
      return { content: [text], status: 200 };
    }
  }

  /** Close the child; safe to call repeatedly. */
  stop(): void {
    this.client?.then((c) => c.close()).catch(() => {});
    this.client = undefined;
  }

  private connect(): Promise<Client> {
    this.client ??= (async () => {
      const client = new Client({ name: "pi-web-fetch", version: "1" });
      // The SDK otherwise passes a sudo-style env whitelist; hound reads more than that.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined),
      ) as Record<string, string>;
      await client.connect(new StdioClientTransport({ command: HOUND_BIN, env, stderr: "ignore" }));
      client.onclose = () => (this.client = undefined);
      return client;
    })().catch((e) => {
      this.client = undefined;
      throw new Error(`cannot start ${HOUND_BIN}: ${e.message}`);
    });
    return this.client;
  }
}
