---
name: interrogate
description: Stress-test a design or change from independent correctness, security, specification, and maintainability angles. Use when the decision is contested or the cost of being wrong is high.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/interrogate/SKILL.md@502e930+dirty -->

# Interrogate

## When to use

- Two viable designs remain and the tradeoff is material.
- A high-risk change needs an adversarial pass before delivery.
- Reviewers disagree and direct evidence is needed to resolve the disagreement.

## How to use

1. State the intent and the decision under pressure.
2. Ask independent reviewers to challenge the same evidence.
3. Normalize findings, identify agreement and disagreement, and check each finding against the code.
4. Classify findings as act on, consider, noted, or dismissed with a reason.
5. Do not let majority vote replace lead judgment or direct evidence.

## Boundaries

- Do not auto-apply reviewer suggestions.
- Do not dismiss a lone finding without checking it.
- Do not use review to invent new product scope.
