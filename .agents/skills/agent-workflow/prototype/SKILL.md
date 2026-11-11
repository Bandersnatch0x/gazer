---
name: prototype
description: Build a throwaway experiment to settle an empirical design or behavior fork before production implementation. Use when observation is cheaper and safer than arguing from preference.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/prototype/SKILL.md@502e930+dirty -->

# Prototype

## When to use

- Two options remain and the difference can be observed in a small experiment.
- The question concerns interaction, output, state transitions, or runtime behavior.
- A design choice is expensive to reverse but cheap to sketch in isolation.

## How to use

1. State the fork, the observation that would decide it, and the success criteria.
2. Build the smallest isolated versions that exercise the decision, not a production framework.
3. Run the same inputs and record outputs, side effects, usability observations, and limits.
4. Choose or reject the options from evidence. Delete the prototype or clearly mark it as non-production.
5. Re-enter the normal design and implementation workflow with the decision recorded.

## Boundaries

- Do not promote throwaway shortcuts without production constraints and verification.
- Do not ask the user to choose a fact that a runnable experiment can settle.
- Do not keep a prototype as a hidden second implementation.
