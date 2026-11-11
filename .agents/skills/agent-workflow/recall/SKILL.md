---
name: recall
description: Reconstruct the current state of an interrupted task from project files, commits, tickets, reports, and live evidence. Use before resuming work from another session.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/recall/SKILL.md@502e930+dirty -->

# Recall

## When to use

- A task is resumed after a context switch, interruption, or agent handoff.
- A prior report conflicts with the current branch, files, tests, or external state.
- The next action depends on what was actually verified rather than what was claimed.

## How to use

1. Read the current rules, task authority, handoff, decision trail, branch, head, and working tree.
2. Recheck claims against the actual files, tests, tickets, and external receipts that still exist.
3. Classify work as done, changed, pending, blocked, unknown, or not run.
4. Restore only the current authorization and continue from the first unverified or unfinished unit.
5. Report the next action and the evidence that would close it.

## Boundaries

- Do not treat an old self-report as current proof.
- Do not revive expired authorization, old processes, or stale external state.
- Do not redo evidence that remains valid, but do not skip a changed boundary.
