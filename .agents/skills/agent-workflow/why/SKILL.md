---
name: why
description: Recover the rationale behind a design, threshold, defensive branch, or regression from repository history and project records. Use when motivation matters; use how for runtime behavior.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/why/SKILL.md@502e930+dirty -->

# Why

## When to use

- A design choice, workaround, threshold, or compatibility path needs an evidence-based explanation.
- A proposed change may invalidate an earlier decision or ticket constraint.
- A regression or postmortem needs the forcing function, not only the current behavior.

## How to use

1. Anchor the question in files, symbols, commits, tickets, and relevant configuration.
2. Check source history, project records, tests, and available first-party evidence in parallel when possible.
3. Record observed facts with their source locations. Label inferences and list missing evidence separately.
4. Compare the current rationale with the proposed change and state what must be preserved, changed, or avoided.

## Boundaries

- Do not treat a recent comment as authoritative when an accepted ticket or later change contradicts it.
- Do not turn an inferred motivation into a requirement without a project decision.
- Do not edit implementation or rewrite history as part of the investigation.
