---
name: drill
description: "Interview one decision at a time until a requirement's goal, scope and tradeoffs are settled, then stop before any code is written. Use when a request arrives as one sentence, when two readers could implement it differently, or when a plan needs stress-testing before build. Not for requirements whose decisions are already settled, and not for writing the spec itself."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/drill/SKILL.md@502e930+dirty -->

# Drill

Turn a one-sentence request into explicit decisions, then stop. This stage answers whether everyone understands the same problem.

## When to use

- The request is one sentence and different people could act on different interpretations.
- The same sentence could produce different observable behavior.
- The choice affects permission, money, privacy, compatibility, or migration risk.

## How to use

1. Scan the repository before asking. Find affected modules, existing rules, and contradictions.
2. Draw a decision tree. Each branch must change behavior or risk; order branches by dependency.
3. Ask one branch at a time and wait for the answer before continuing.
4. Include a recommendation and reason with each question. The user should only need to accept or reject it.
5. Separate facts from decisions. Verify facts yourself; send business consequences to the user.
6. Record each decision as a checkable sentence, not an adjective.
7. Do not write code, tickets, or a solution while a material tradeoff is unresolved.
8. Close with the goal, scope, confirmed decisions, unresolved items, and explicit non-goals.

**Criterion.** Every confirmed branch can be expressed as Given/When/Then.

## When nobody is available

Record each assumption as the question, assumed answer, and reason. Mark the result as not aligned with a person. Downstream work must recheck it before treating it as confirmed.

## Boundaries

- Do not design the technical solution; that belongs to charter.
- Do not split implementation work; that belongs to slice.
- Do not repeat an interview for a requirement that is already aligned.
