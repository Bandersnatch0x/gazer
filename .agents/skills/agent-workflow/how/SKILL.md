---
name: how
description: Explain how a subsystem works by tracing its real entry points, state owners, side effects, and failure paths. Use before changing unfamiliar code; use research when repository evidence is not enough.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/how/SKILL.md@502e930+dirty -->

# How

## When to use

- Someone needs a code walkthrough or an ownership and layering answer.
- A change touches a subsystem whose runtime path is not yet understood.
- A review needs a complete call and state model before judging a fix.

## How to use

1. State the question, scope, and user-visible result.
2. Trace the entry point through callers, data shapes, state owners, side effects, and failure paths.
3. Read the relevant source, tests, configuration, and runtime entry points. Run a small real check when a claim depends on behavior.
4. Explain the overview, key concepts, runtime flow, file ownership, and gotchas.
5. Separate observed facts, inferences, and unanswered questions. Point to the next verification when evidence is incomplete.

## Boundaries

- Do not edit product code while producing a read-only walkthrough.
- Do not infer motivation from control flow alone; use `why` for history and rationale.
- Do not broaden a narrow question into a repository-wide survey without a concrete risk.
- Use `teach` when the result must become a maintainer-facing mental model rather than an investigation answer.
