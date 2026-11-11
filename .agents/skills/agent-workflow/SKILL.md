---
name: agent-workflow
description: Route coding work through the repository's native investigation, design, implementation, review, and acceptance skills. Use for any non-trivial coding task; do not use it for a narrow one-step question.
disable-model-invocation: true
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/SKILL.md@502e930+dirty -->

# Native Agent Workflow

This is the repository's self-contained workflow router. It does not depend on an external skill package or model-specific plugin.

The capability inventory is in `CAPABILITIES.json`. It distinguishes implementation ownership from discovery, dependency, runtime, and evidence states.

## When to use

- A coding task needs investigation, design, implementation, review, or acceptance.
- A task crosses more than one file, caller, state owner, or external contract.
- A narrow request is unclear enough that the next safe step is not obvious.

## How to use

1. Read the project rules, glossary, decisions, ticket, and acceptance gate first.
2. Choose the smallest route that matches the task and load only the required leaf skill.
3. Keep project-specific stage skills and host capabilities separate from this native pack.
4. Treat `runtime: passed` as the only runtime success claim. An asset path or `discovery: verified` entry does not prove that a user-facing capability works.
5. Verify the real artifact, inspect the diff, and report what was not run before delivery.

## Route

- A simple factual request goes directly to the answer.
- An ambiguous requirement goes to `drill` before design or code.
- An investigation goes to `how` or `research`; a design-rationale question goes to `why`.
- A settled requirement goes to `charter`, then `slice`.
- A bug goes to diagnosis, then `tdd` or `build`.
- A refactor goes to `refactor`; a performance problem goes to `benchmark` before changing code.
- An empirical fork goes to `prototype`; a domain or terminology problem goes to `domain-modeling`.
- A large or unattended effort goes to `figure-it-out`; long-running work keeps a `show-me-your-work` trail.
- A structural or cross-module change goes to `architect` and, when risk is material, `blast-radius` analysis.
- Implementation goes to `build`.
- Review goes to `code-review` and then the acceptance stage; contested or high-risk review requires `interrogate`.
- Ordinary delivery closes as `build -> code-review -> pr -> retro -> gate -> ship`.
- Parallel work goes to `swarm` and uses only verified host dispatch and disjoint write sets.
- Repeated mistakes go to `correct`; completed sessions and delivery closeouts go to `retro` when a rule or gate may need to change.
- Acceptance goes to `gate`. Delivery closeout goes to `ship`.

## Operating rules

1. Read project rules, glossary, existing decisions, and the current ticket before acting.
2. Name the data shape, owner, write set, and observable result before adding stateful logic.
3. Put validation at external boundaries and keep internal logic simple and typed by construction.
4. Prefer deletion and the smallest complete change. Do not add a wrapper for a single caller.
5. Make tests assert user-observable behavior. Compilation and self-report are not proof.
6. Keep authorization, review, merge, deployment, and messaging as separate actions.
7. Preserve the distinction between passed, failed, blocked, unknown, and not run.
8. Before declaring done, run the real artifact, inspect the diff, and record residual risks.

## Design and engineering checks

- Trace callers, state owners, external contracts, and failure paths before changing a shared module.
- Compare whole-system designs when more than one shape is viable. Prefer the smallest interface that hides the most complexity.
- For bugs, reproduce first, test the root cause, and fix the shared invariant rather than the reported symptom.
- For reviews, findings come first and are ordered by severity. Cite exact files and lines.
- For risky changes, inspect callers outside the diff and run one real check that proves each safety assumption.
- For tests, use the highest existing public seam and assert literal behavior rather than implementation details.

## Boundaries

- This router does not grant credentials, merge rights, deployment rights, or background execution.
- It does not replace project rules or ticket authority.
- It does not claim a host capability merely because a skill file exists.
- It does not depend on an external workflow package.
