---
name: arena
description: Compare two or three structurally different designs or implementations before committing to one. Use when the choice is novel, costly to reverse, or not settled by existing code.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/arena/SKILL.md@502e930+dirty -->

# Arena

## When to use

- More than one whole-system design can satisfy the requirement.
- A wrong interface or state shape would be expensive to unwind.
- A review needs alternatives rather than another patch inside the current shape.

## How to use

1. State the decision, constraints, evidence, and evaluation criteria.
2. Produce at least two materially different candidates with interfaces, ownership, failure behavior, and verification seams.
3. Compare depth, locality, migration cost, edge cases, and reversibility.
4. Choose one base. Graft only improvements that remain consistent with its ownership model.
5. Verify the combined design and record rejected alternatives with reasons.

## Boundaries

- Do not create fake alternatives by renaming the same design.
- Do not let a vote replace direct evidence or lead judgment.
- Do not implement all candidates when a throwaway prototype can settle the fork.
