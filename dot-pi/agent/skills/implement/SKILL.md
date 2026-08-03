---
name: implement
description: Implement a piece of work. Use when the user wants to implement or build something.
---

Implement the work described by the user. Follow this sequence, completing each step before moving on.

```
approach → wt switch -c feat → tracer bullet → red → green → commit → rebase → review → wt merge
                                     └────────────── widen ─────────────┘
```

## 1. Approach

If no design artifact (argument, ADR, spec, ticket with implementation notes, or this conversation) already decided the approach, suggest using /offer-alternatives to surface 2-3 strategies and confirm before proceeding.

## 2. Worktree

Create a worktree for this unit of work:

```
wt switch -c feat/<name>
```

## 3. Tracer bullet

Build the thinnest slice that runs end to end — a real call path through every layer. No tests yet, just enough to prove the shape works.

## 4. Widen

Use /tdd to widen the tracer bullet. Red first, then the minimum code to go green. Commit often and atomically — green at every commit. Repeat, one case at a time, until the full spec is covered.

## 5. Rebase

Use /commit to rebase — fixup and squash so history reads as a deliberate sequence.

## 6. Review

Use /code-review to review the work against the originating spec and the repo's code standards.

## Code style

Follow `~/.claude/code-style.md`. The repo's own conventions override it.
