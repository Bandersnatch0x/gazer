---
name: domain-modeling
description: Establish and sharpen the vocabulary, ownership, and invariants of a codebase before changing stateful logic. Use when terms or repeated shape assumptions are drifting.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/domain-modeling/SKILL.md@502e930+dirty -->

# Domain Modeling

## When to use

- The same concept has multiple names or subtly different meanings.
- Branches repeat a shape assumption that should be represented explicitly.
- A new stateful feature needs terms, invariants, or ownership before code.

## How to use

1. Collect terms from user paths, source, tests, configuration, and accepted decisions.
2. Define each term, its allowed states, owner, transitions, and forbidden synonyms.
3. Put the vocabulary in the project glossary or decision record that owns it.
4. Shape code, tests, and error messages around the agreed terms.
5. Check that illegal combinations are harder to construct and that callers do not reimplement the invariant.

## Boundaries

- Do not rename a domain concept only for stylistic consistency.
- Do not create a glossary entry for an implementation detail with no shared meaning.
- Do not let a new term silently contradict an accepted decision.
