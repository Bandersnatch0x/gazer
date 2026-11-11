---
name: charter
description: "Turn an already-settled requirement into a written spec a fresh session can execute: problem, solution, user stories, implementation decisions, testing seams, out of scope, further notes. Use after the tradeoffs are settled and before tickets exist. Not for gathering requirements, and not for cutting tickets."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/charter/SKILL.md@502e930+dirty -->

# Charter

The requirement is aligned, but its place in the existing system is not explicit. Turn what is wanted into where it belongs, how it is observed, and what is excluded.

## When to use

- Decisions are settled but no executable, verifiable spec exists.
- The change crosses modules or sessions and chat history would lose context.
- One decision is being implemented independently at multiple layers.

## How to use

1. Synthesize; do not interview again. Return missing decisions instead of inventing them.
2. Read existing authorities: decision records, glossary, and related specs. Resolve conflicts explicitly.
3. Use glossary terms consistently.
4. Choose the public test seam before writing the solution. Prefer one existing seam.
5. Confirm the seam before treating it as final.
6. Write problem, solution, user stories, implementation decisions, testing decisions, out of scope, and further notes.
7. Keep testing decisions and out of scope as separate sections.
8. End with tickets that a fresh executor can take without another verbal translation.

**Criterion.** A person who did not join the discussion can name the layers to change, where to observe the result, and what is explicitly not done.

## When nobody is available

Mark every unconfirmed seam as `unconfirmed seam`. Downstream acceptance cannot exceed conditional pass until a person confirms it.

## Boundaries

- Do not interview; return decisions to drill.
- Do not cut tickets or estimate work; that belongs to slice.
- Do not define release order or rollback; that belongs to ship.
