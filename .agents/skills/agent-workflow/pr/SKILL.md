---
name: pr
description: Prepare a reviewable pull request summary with scope, before-and-after evidence, verification results, and merge-risk notes. Use after code review and before delivery; do not merge or rewrite the change.
disable-model-invocation: true
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/pr/SKILL.md@502e930+dirty -->

# Pull Request Closeout

## When to use

- A reviewed change is ready for a concise delivery summary.
- Reviewers need the user-visible impact, evidence, and remaining risk in one place.
- A change must be handed to another person without relying on chat history.

## How to use

1. Pin the base and head, confirm the diff is non-empty, and state the user problem in one sentence.
2. Summarize the behavior change and the files or surfaces it affects. Keep unrelated work out.
3. Record before-and-after evidence, including exact commands, results, and what was not run.
4. List review findings and their dispositions. Separate fixed, deferred, and rejected findings.
5. Call out merge danger: stale base, generated files, migrations, secrets, destructive actions, or host-dependent checks.
6. Leave the repository unchanged. The output is a review artifact, not a merge authorization.

## Boundaries

- Do not merge, push, deploy, or send an external message.
- Do not claim a host-dependent capability passed without real evidence.
- `retro` owns workflow lessons after this summary; `ship` owns release order and rollback.
