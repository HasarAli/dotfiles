---
name: llm-council
description: Run a question or decision through 5 independent AI advisors, have them peer-review each other anonymously, then synthesize a final verdict. For genuine decisions with stakes and real tradeoffs.
user-invocable: true
---

# LLM Council

Five advisors, parallel — each from a fixed angle:

- **Contrarian** — finds what's wrong, what fails, the fatal flaw
- **First Principles** — strips assumptions, may reframe the question entirely
- **Expansionist** — finds upside and adjacent opportunity being missed
- **Outsider** — zero context, catches the curse of knowledge
- **Executor** — only cares what gets done and what the first step is

## Process

**Step 1 — Frame.** Scan for context (CLAUDE.md, memory/, referenced files). Produce a neutral framing with: the decision, key context, and what's at stake. Ask one clarifying question if the input is too vague.

**Step 2 — Advise (parallel).** Spawn all 5 advisors simultaneously. Each gets their identity and the framed question. Instruct: respond independently, don't hedge, lean fully into your angle. 150–300 words, no preamble.

**Step 3 — Peer review (parallel).** Anonymize responses as A–E (randomize mapping). Spawn 5 reviewers, each seeing all 5. Each answers: (1) strongest response and why, (2) biggest blind spot, (3) what all five missed. Under 200 words each.

**Step 4 — Chairman synthesis.** One agent gets everything de-anonymized. Produces the final verdict:

- **Where the Council Agrees** — convergence = high-confidence signal
- **Where the Council Clashes** — real disagreements, both sides, no smoothing
- **Blind Spots Caught** — things only peer review surfaced
- **Recommendation** — a real answer, not "it depends"
- **One Thing to Do First** — single concrete next step

Chairman may disagree with the majority if the reasoning supports it.

**Step 5 — Transcript.** Save `council-transcript-[timestamp].md` to the working directory with: framed question, all advisor responses, all peer reviews (with anonymization mapping revealed), and the chairman synthesis.
