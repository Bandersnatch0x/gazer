---
name: code-review
description: Review a change for correctness, security, specification fit, maintainability, and missing evidence. Use before delivery or when the user asks for a review. Do not silently fix the reviewed change.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/code-review/SKILL.md@502e930+dirty -->

# Code Review

## When to use

- A branch, change set, or proposed delivery needs an independent review.
- The user asks whether an implementation satisfies its standards and originating requirement.
- A green test suite may still hide a specification, security, or scope problem.

## How to use

1. Establish the scope and originating requirement.
2. Pin the comparison point and confirm the diff is non-empty.
3. Identify the specification, project standards, tests, and callers before judging the change.
4. Read tests first, then changed code and callers. Check correctness and edge cases before style.
5. Judge two axes separately. Check documented standards and maintainability, then check specification fit, missing behavior, and scope creep.
6. Check trust boundaries, secrets, authorization, failure closure, data exposure, and real verification evidence.
7. If host dispatch is available, run the two axes independently. Otherwise state that the review is single-context.
8. Report findings first, ordered by severity, with exact file and line evidence. Separate confirmed findings from questions, residual risks, and optional improvements.

## Boundaries

- Do not treat a green test suite as proof that the spec is satisfied.
- Do not report style preferences as blocking defects.
- Do not edit during review unless the caller explicitly changes the task.
- Do not merge standards and specification findings into one score.
