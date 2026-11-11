---
name: retro
description: Turn a completed task, delivery, or failed attempt into one evidence-backed improvement to skills, checks, tooling, or project instructions. Use after a session, review, or pull request closeout; do not rewrite product history.
disable-model-invocation: true
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/retro/SKILL.md@502e930+dirty -->

# Retrospective

## When to use

- A task or session produced a correction, unexpected failure, or repeated workaround.
- A delivery exposed a repeated correction, missing gate, or avoidable uncertainty.
- A verification failure or review finding suggests the workflow can prevent the class next time.
- A completed session needs one durable lesson before release closeout.

## How to use

1. Read the actual transcript, diff, tests, decisions, review findings, and failure evidence rather than memory alone.
2. Separate one-off environment noise from a recurring failure class, and preserve the concrete evidence for each.
3. Name the smallest owner that can prevent recurrence: type, architecture, test, check, skill, or instruction.
4. Propose one concrete change and one counterexample that should fail before the change.
5. Apply only changes within the current authorization. Otherwise record the lesson in the process area with a revisit condition.

## Boundaries

- Do not edit product code merely to make the retrospective look complete.
- Do not turn an unverified suspicion or every inconvenience into a permanent rule.
- Do not record a lesson without a source event and an observable prevention path.
- `pr` owns delivery evidence; `ship` owns release order, rollback, and handoff.
