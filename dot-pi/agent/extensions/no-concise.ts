/**
 * no-concise — strip the "Be concise in your responses" guideline from the
 * system prompt. Everything else stays untouched.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    event.systemPrompt = event.systemPrompt.replace(
      "- Be concise in your responses\n",
      "",
    );
  });
}
