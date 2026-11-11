---
name: gate
description: "Gate a delivery on independent evidence: a revert test that fails without the change, a standards axis and a spec axis reviewed in separate contexts, and an explicit record of what was not run. Use before calling work done, before handing it to someone else, or when the same agent built and tested it. Not for writing the spec, cutting tickets, or fixing what the review finds."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/gate/SKILL.md@502e930+dirty -->

# Gate

Answer one question: what evidence proves this is correct? This stage produces a verdict, not edits.

## When to use

- A delivery is about to be declared complete.
- A change is being handed off or merged.
- The builder and tester are the same context.

## How to use

1. Run the full suite and read the complete log, not a truncated pipeline tail.
2. Run a revert test. The new test must fail against the old implementation for the claimed behavior.
3. Review the standards axis and spec axis in separate contexts.
4. Keep the two reports separate so correctness and style cannot average each other out.
5. Check conformance against every spec item, including out of scope.
6. Record the exact head and run location.
7. Separate passed, failed, and not-run evidence. Explain every not-run item.
8. Allow channels to disagree. A spec failure blocks even when tests and standards pass.

**Criterion.** Another person can reproduce the run and identify which evidence supports each verdict.

## When nobody is available

Run both axes in one context, keep reports separate, and mark the result as single-context rather than independent.

## Boundaries

- Do not fix findings; return them to build.
- Do not change the spec; return conflicts to charter.
- Do not decide release timing; that belongs to ship.
- Do not claim completion without fresh evidence.
