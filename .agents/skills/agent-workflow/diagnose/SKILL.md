---
name: diagnose
description: Diagnose a reported bug or performance problem by reproducing it, tracing the first broken invariant, and separating facts from hypotheses. Use before fixing an unknown failure or regression.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/diagnose/SKILL.md@502e930+dirty -->

# Diagnose

## When to use

- A failure, regression, or unexpected result has an unknown cause.
- The same symptom has received more than one local patch.
- A performance report lacks a trustworthy reproduction or baseline.

## How to use

1. Reproduce the symptom on the real user surface when possible.
2. Record exact inputs, state, version, environment, and failure evidence.
3. Trace backward from the symptom to the first violated invariant.
4. Test competing hypotheses with one discriminating observation at a time.
5. Fix the shared root cause, not the reported entry point.
6. State what remains unknown and what evidence would change the diagnosis.

## Boundaries

- Do not hide a failure with a broad catch or silent fallback.
- Do not call an unreproduced hypothesis a fix.
- Do not claim a performance result without a comparable baseline.
