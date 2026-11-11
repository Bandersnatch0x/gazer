---
name: architect
description: Design a non-trivial change before implementation by tracing the existing system, defining data shapes and module boundaries, comparing viable whole-system designs, and shaping deep interfaces. Use when a change crosses boundaries, code is hard to trace, or a local patch would create a new abstraction.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/architect/SKILL.md@502e930+dirty -->

# Architect

## When to use

- The change crosses modules, state owners, permissions, or external boundaries.
- Several designs could satisfy the requirement.
- Repeated local fixes suggest that the current shape is wrong.
- A module is hard to understand because its interface exposes too much internal knowledge.
- Several callers repeat the same invariant or navigation chain.
- A new seam, adapter, wrapper, or abstraction is being proposed.

## How to use

1. Trace the real entry point, callers, state, side effects, tests, and failure paths.
2. State the user-visible behavior, data shape, owner, write set, and invariants.
3. Find duplicated invariants, one-caller wrappers, and the question each caller needs answered.
4. Describe the interface as everything a caller must know: ordering, errors, configuration, and performance constraints.
5. Produce two or three structurally different designs, moving repeated domain knowledge behind the owner that can enforce it.
6. Compare interface depth, failure behavior, migration cost, and verification seams; prefer a deep interface over a pass-through chain, and add an adapter only when two real implementations vary.
7. Choose the smallest design that makes illegal states difficult to construct; keep boundary parsing at the edge, verify the shape deletes branches or hidden reader state, implement against the chosen sketch, and record any deviation as design feedback.

## Boundaries

- Do not implement while the core shape is unresolved.
- Do not add an abstraction only because a future caller might exist.
- Do not preserve a legacy API without a current consumer and a removal plan.
- Do not create a generic framework without a real second use.
- Do not relocate complexity and call it simplification.
- When several materially different designs are needed and the choice is expensive to reverse, use `arena` for independent candidates.
- Do not change behavior under a structure-only refactor; use `refactor`.
