---
name: ship
description: "Close out a verified change: an ordered release plan with a rollback path, a handoff document written for a fresh session, and the lessons worth keeping. Use after acceptance passes and before the work is merged, released, or handed to someone else, and mid-task when work spans sessions. Not for verifying the work, and not for deciding whether to merge."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/ship/SKILL.md@502e930+dirty -->

# Ship

Merged code is not the same as delivered work. This stage handles release order, handoff, and durable lessons.

## When to use

- Acceptance passed and the change is ready to merge, release, or hand off.
- Work crosses sessions and needs a mid-task handoff.
- A lesson has appeared twice and may belong in a lasting rule.

## How to use

1. Write the release order for cross-repository or cross-surface dependencies.
2. Write the rollback path, trigger, and switch location for every step.
3. Write a handoff for a fresh session: goal, completed work, decision locations, specs and diffs, verification, risks, and next step.
4. Link to existing artifacts instead of copying them.
5. Keep handoff material in the process area, not the project working tree.
6. Remove secrets, passwords, and personal data before handoff.
7. Name the skills the next person should use.
8. Keep only repeatable judgment lessons; do not turn one-off facts into permanent rules.
9. Record scope and uncovered work in the ticket log.

**Criterion.** A new session can identify its next action and follow the evidence without the original conversation.

## Boundaries

- Do not change code; return problems to build.
- Do not replace acceptance; acceptance must pass first.
- Do not decide merge timing or authorization.
- Optimize handoff for immediate action, not minimum length.
