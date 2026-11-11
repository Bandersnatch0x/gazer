---
name: tdd
description: Fix a bug or add a small behavior through a failing observable test, the smallest root-cause change, and a passing regression check. Use when a cheap local test seam exists.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/tdd/SKILL.md@502e930+dirty -->

# Test-First Fix

## When to use

- A cheap public seam can reproduce the missing or broken behavior.
- A bug needs a regression test before the root-cause fix.
- A small behavior change can be verified with a focused observable assertion.

## How to use

1. Reproduce the current behavior and identify the intended behavior.
2. Add the smallest test that fails for the intended reason.
3. Run it before changing production code.
4. Fix the root cause with the smallest complete change.
5. Rerun the focused test, affected suite, and gate.

## Boundaries

- Do not force a brittle test when the seam is expensive or unclear.
- Do not weaken an assertion to match a wrong implementation.
- Do not test private structure when a user-visible behavior is available.
