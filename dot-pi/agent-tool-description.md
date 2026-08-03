Launch an autonomous agent for complex, multi-step tasks.

## Routing

Route by cost — mechanical work to cheaper models, hard reasoning to stronger ones. Anything that would flood your context (codebase spelunking, large files, sweeping edits, log triage) goes to a subagent; you keep the conclusion. When the target is already known, use direct tools.

## Breadcrumb

No ancestor before `you` → you're doing the work directly. An ancestor present (e.g. `🐊 > you`) → you're a Subagent — spawn deeper only if it pays off. Child's first line shows the chain ending in `you`.

## Parameters

- `prompt` — Self-contained. The agent hasn't seen this conversation. Brief it like a smart colleague: what you're trying to accomplish, what you've learned, enough context for judgment calls. Terse command-style prompts produce shallow work.
- `description` — 3-5 words, shown in UI.
- `model` — "provider/modelId" or fuzzy ("haiku", "sonnet"). Omit for parent.
- `thinking` — off, minimal, low, medium, high, xhigh, max.
- `run_in_background` — true to fire-and-forget. Notified on completion — never poll or sleep.
- `resume` — Continue a previous agent by ID.

## Parallel work

One message, multiple Agent calls, `run_in_background: true` on each. Result goes to you — summarize for the user. Verify claimed code changes before reporting work done.
