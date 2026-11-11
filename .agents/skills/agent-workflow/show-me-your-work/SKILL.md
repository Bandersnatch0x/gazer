---
name: show-me-your-work
description: Keep a compact, reviewable decision trail for long, autonomous, or high-risk work. Use when another context must trust the run later.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/show-me-your-work/SKILL.md@502e930+dirty -->

# Show Me Your Work

## When to use

- Work spans multiple phases or may run while the operator is away.
- A reviewer needs to understand decisions, evidence, and outcomes without replaying the whole session.
- The task has retries, external actions, or meaningful rejected alternatives.

## How to use

1. Create a local process log with one row per decision or state transition.
2. Record the action, reason, evidence pointer, result, and unresolved risk in stable fields.
3. Update the log after each verifiable unit, including skipped and not-run checks.
4. Audit that the trail matches the transcript, files, commits, and external receipts.
5. Keep the log local unless a project reviewer needs it as a durable artifact.

## Boundaries

- Do not paste secrets, credentials, or full noisy logs into the trail.
- Do not use the trail as a second source of project requirements or task authority.
- Do not claim a decision was evidence-backed when its evidence pointer is missing.
