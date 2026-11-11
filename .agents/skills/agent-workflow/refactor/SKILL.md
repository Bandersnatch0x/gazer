---
name: refactor
description: Reshape code without changing observable behavior by fixing ownership, deleting dead paths, and migrating callers in one verified wave. Use for structure-only work; use build for behavior changes.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/refactor/SKILL.md@502e930+dirty -->

# Refactor

## When to use

- The requested change is structural and the public behavior must remain the same.
- A shared invariant is duplicated across callers or modules.
- A wrapper, compatibility path, or layer has no current consumer and can be removed safely.

## How to use

1. Capture the current observable behavior at the highest useful seam.
2. Map callers, state owners, duplicated rules, and external contracts before editing.
3. Delete dead code and choose the smallest owner that can enforce the invariant.
4. Migrate every known caller in the same change. Do not leave a compatibility API without a current consumer and removal plan.
5. Run the same behavior checks before and after the structural change, then run the affected suite and delivery gate.

## Boundaries

- Do not smuggle a product behavior change into a structure-only refactor.
- Do not create a generic framework for a single variation.
- Do not keep an old interface merely to avoid migrating known callers.
