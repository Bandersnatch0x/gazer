---
name: correct
description: Turn a repeated agent mistake into a structural, typed, mechanical, or tested guard. Use after the same failure or correction appears again.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/correct/SKILL.md@502e930+dirty -->

# Correct

## When to use

- The same defect, review finding, or operator correction appears twice.
- A written rule exists but agents still violate it.
- A failure could be prevented at a higher layer than the final documentation.

## How to use

1. Collect the concrete counterexamples, affected actors, and first violated invariant.
2. Prefer a better data shape or owner. Then consider a type check, mechanical gate, regression test, and only then documentation.
3. Implement the smallest guard that prevents the mistake at its source.
4. Prove the guard catches a real past counterexample and does not reject valid work.
5. Record the lesson, evidence, and remaining escape hatch.

## Boundaries

- Do not add a warning where an invalid state can be made unrepresentable.
- Do not turn a one-off preference into a project-wide rule without repeated evidence.
- Do not delete a rule until its replacement has passed the old counterexample.
