---
name: create-verification
description: Create a user-facing verification recipe for a repository feature with startup, health, operation, evidence, side-effect, and cleanup steps. Use when no reliable control path exists.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/create-verification/SKILL.md@502e930+dirty -->

# Create Verification

## When to use

- A feature has no repeatable way to drive it like a user.
- Documentation claims a workflow works but no live evidence is retained.
- A new integration needs a safe acceptance path before implementation is called complete.

## How to use

1. Map the user entry point, prerequisites, observable result, side effects, and cleanup boundary.
2. Reuse existing project tools before adding a driver or fixture.
3. Write the smallest recipe with startup readiness, a read-only health check, the real operation, evidence capture, and post-operation assertions.
4. Run one representative feature end to end and preserve the result outside the product working tree.
5. State unsupported environments and the exact condition required to make them runnable.

## Boundaries

- Do not call a mock or help output end-to-end evidence.
- Do not hide a product regression by changing the verification recipe.
- Do not clean up user-owned processes or data; clean only resources created by the recipe.
