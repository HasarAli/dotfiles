---
name: offer-alternatives
description: Offer alternative approaches before committing to a design or implementation path. Use when the user asks for alternatives.
---

Before committing to an approach, confirm 2-3 perspectives with the user. Pitch each alternative in one line — first principles, YAGNI, prior art, or a cheap disproving spike.

Once the user picks, fan out subagents if the exploration needs parallel work.

Hand each perspective to a subagent with only the raw intent, not the ask's framing.

Avoid anchoring the subagents in the existing solution. Provide a high-level description of the purpose, behaviour, or requirements — not the artifact itself. For example: when reorganizing a document, describe what it communicates (not its headers or structure); when refactoring code, give the feature specs or desired outcomes (not the current implementation). This keeps alternatives genuine rather than incremental tweaks on what already exists.
