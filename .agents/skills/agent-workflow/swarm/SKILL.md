---
name: swarm
description: Partition independent investigation or implementation work into disjoint, verifiable units and aggregate the evidence. Use when parallel execution improves coverage without shared writes.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/swarm/SKILL.md@502e930+dirty -->

# Swarm

## When to use

- The task has independent angles, fixtures, or work units that can run concurrently.
- Coverage, race, or adversarial exploration matters more than one linear attempt.
- Each worker can own a disjoint write set or remain read-only.

## How to use

1. Define the question, partitions, dependencies, write sets, budgets, and completion evidence.
2. Check for shared files, state, branches, credentials, and external actions before dispatch.
3. Run workers with the smallest context and permissions they need. A failed dispatch is not independent review.
4. Normalize each result into facts, evidence, failures, unknowns, and recommended action.
5. Aggregate in the lead context, resolve conflicts by direct evidence, and verify the selected result.

## Boundaries

- Do not parallelize a shared mutable write without a real serialization invariant.
- Do not call multiple identical outputs independent merely because they ran separately.
- Do not let worker reports authorize merge, deployment, deletion, or external messaging.
