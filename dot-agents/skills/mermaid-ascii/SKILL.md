---
name: mermaid-ascii
description: Render flowcharts and sequence diagrams as terminal text with the `mermaid-ascii` CLI. Use this whenever a response would explain a flow, pipeline, state machine, request/response exchange, or call sequence that is too big to sketch by hand in a few lines of ASCII, even if the user never says "diagram" or "mermaid".
---

# mermaid-ascii

Hand-drawn ASCII boxes drift out of alignment once a diagram has more than a handful of nodes, and the reader is looking at a monospace terminal where broken alignment breaks the meaning. Writing Mermaid and letting `mermaid-ascii` lay it out gives a correctly aligned diagram every time.

Small figures, like a three-item tree or a single arrow chain, read fine drawn by hand. Reach for this tool when the layout itself would be the hard part.

## Render

Pipe the Mermaid source in on stdin and paste the output into a fenced code block:

```bash
mermaid-ascii -f - --max-width 100 <<'MMD'
graph LR
  A[request] --> B{cached?}
  B -->|yes| C[return]
  B -->|no| D[fetch]
MMD
```

Pass a fixed `--max-width`, because `--max-width auto` exits with an error unless stdout is a terminal, and an agent's never is.

Sequence diagrams work the same way:

```bash
mermaid-ascii -f - --max-width 100 <<'MMD'
sequenceDiagram
  Client->>API: POST /login
  API-->>Client: 200 token
MMD
```

## Keep it readable

Paste only the rendered output, not the Mermaid source. The reader wants the picture.

The diagram should fit on one screen. If it runs long or wide, try `graph TD` instead of `graph LR`, shorten the labels, or split it into two diagrams. A diagram that scrolls loses the at-a-glance view that justified drawing it.
