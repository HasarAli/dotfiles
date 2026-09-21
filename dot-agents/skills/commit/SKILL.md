---
name: commit
description: Write commit messages following conventions. Use when about to commit, asking for a commit message, or mentioning committing.
---

## Messages

Brief imperative subject; body only when it adds *why*.

Commit bodies and PR/MR descriptions stay brief and high level — what changed and why, not a walkthrough. Let the diff carry the detail; never restate it in prose.

## Atomic commits

Each commit is one logical change — green at every commit.

## Rebase

Rebase freely on your own unpushed branch — fixup and squash so each commit tells one coherent story.

Ask user approval before rebasing pushed commits. Never roll feature-branch changes into base-branch commits (e.g., fixup into a `main` commit from your feature branch).

Before any rebase, create a backup branch. After the rebase, verify the backup and rewritten branches are byte-identical, then delete the backup.
