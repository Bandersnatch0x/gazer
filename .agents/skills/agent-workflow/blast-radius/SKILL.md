---
name: blast-radius
description: Find what a change can break beyond its diff by tracing callers, shared state, external contracts, fixtures, and real user paths. Use before shipping a change you do not fully trust.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/blast-radius/SKILL.md@502e930+dirty -->

# Blast Radius

## When to use

- A change crosses a shared module, external contract, state store, or user path.
- A small diff may affect callers or fixtures outside the edited files.
- A delivery claim depends on a safety assumption that should be proven directly.

## How to use

1. Enumerate changed symbols, files, contracts, state stores, and external calls.
2. Trace callers, consumers, tests, fixtures, configuration, and deployment paths.
3. Identify shared writers, stale caches, compatibility assumptions, and failure paths.
4. Run one real check for each claimed safety assumption.
5. Report affected, protected, and unverified areas separately.

## Boundaries

- Do not widen implementation merely to make the report look complete.
- Do not infer safety from search results alone; run the fact that carries the risk.
