---
name: teach
description: Explain a subsystem, change, or design decision so a new maintainer can build a correct mental model. Use when understanding matters more than a short answer.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/teach/SKILL.md@502e930+dirty -->

# Teach

## When to use

- Someone needs to understand how a change works before owning or modifying it.
- A repository concept spans code, history, rules, and runtime evidence.
- A review found the implementation is correct but the mental model is missing.

## How to use

1. Start from the learner's question and define the smallest useful scope.
2. Explain the data shape, owners, entry path, state transitions, side effects, and failure paths.
3. Connect behavior to the accepted rationale and point to source, tests, and live evidence.
4. Use one concrete example and one failure example. Label facts, inferences, and unknowns.
5. End with the next safe change or verification a maintainer can perform.

## Boundaries

- Do not replace source evidence with analogy.
- Do not copy a whole file when a focused explanation and pointers are enough.
- Do not teach stale behavior without checking the current artifact.
- Use `how` for a read-only investigation answer; use `teach` when a new maintainer must own or modify the subsystem.
