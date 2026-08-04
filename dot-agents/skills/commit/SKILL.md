---
name: commit
description: Write commit messages and follow commit conventions. Use when the user is about to commit, asks for a commit message, mentions committing, or when another skill reaches the commit step.
---

## Messages

Brief imperative subject; body only when it adds *why*.

## Atomic commits

Each commit is one logical change — green at every commit.

## Rebase

Rebase freely on your own unpushed branch — fixup and squash so each commit tells one coherent story.

Ask user approval before rebasing pushed commits. Never roll feature-branch changes into base-branch commits (e.g., fixup into a `main` commit from your feature branch).

Before any rebase, create a backup branch. After the rebase, verify the backup and rewritten branches are byte-identical, then delete the backup.
