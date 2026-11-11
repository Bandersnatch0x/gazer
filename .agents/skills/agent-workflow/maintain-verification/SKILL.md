---
name: maintain-verification
description: Keep a user-facing verification recipe aligned with the current product by checking source, feature maps, live behavior, and evidence. Use after product or workflow changes.
---
<!-- scaffold-stamp: agent-scaffold/skills/workflow/maintain-verification/SKILL.md@502e930+dirty -->

# Maintain Verification

## When to use

- A feature, route, command, or integration changed.
- A verification recipe may be stale, incomplete, or masking a regression.
- The project needs a periodic audit of its control path.

## How to use

1. Read the recipe and feature map, then inspect the source that owns each claimed path.
2. Drive every listed feature through its real entry point when the environment is available.
3. Classify each mismatch as documentation drift, tool failure, environment limitation, or product regression.
4. Fix only the owning layer. Preserve evidence for failed and not-run paths.
5. Run the recipe again after changes and report coverage, gaps, cleanup, and residual risk.

## Boundaries

- Do not edit the product to make a stale recipe pass.
- Do not mark an unavailable environment as passed.
- Do not treat a static feature list as evidence of reachable behavior.
