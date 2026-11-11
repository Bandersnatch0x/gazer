---
name: unslop
description: Remove vague, inflated, repetitive, and unsupported language from agent-facing or engineering prose. Use before publishing a report, skill, specification, or handoff.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/unslop/SKILL.md@502e930+dirty -->

# Unslop

## When to use

- Prose sounds generic, overconfident, repetitive, or longer than the decision requires.
- A report mixes facts with guesses or hides what was not checked.
- A skill or instruction repeats another source instead of pointing to it.

## How to use

1. Remove filler, slogans, redundant headings, and claims without evidence.
2. Replace vague verbs with observable actions and name the owner or artifact.
3. Put the evidence or uncertainty in the same sentence as the consequential claim.
4. Keep one idea per sentence. Preserve necessary constraints, caveats, and failure exits.
5. Read the result once as the user and once as the next maintainer.

## Boundaries

- Do not shorten away safety, accessibility, authorization, or rollback information.
- Do not make a claim sound certain by deleting its uncertainty.
- Do not rewrite quoted source material as if it were project-owned policy.
