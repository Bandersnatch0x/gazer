---
name: build
description: "Implement one approved ticket through a short feedback loop: a verification entry built before the edit, a test that fails first, the smallest change that makes it pass, and a handoff to a review in another context. Use when a ticket is approved and the code change starts, or when a bug needs reproducing before fixing. Not for cutting tickets, and not for reviewing your own work."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/build/SKILL.md@502e930+dirty -->

# Build

The hard part is not writing code. It is making every change immediately falsifiable and leaving evidence where another context can inspect it.

## When to use

- A ticket is approved and implementation starts.
- A bug needs reproduction before the fix.
- One change keeps failing and another patch layer is tempting.

## How to use

1. Use the ticket, not memory. Read its acceptance behavior before coding.
2. Build the verification entry before the change. Use the seam chosen by charter; do not invent one here.
3. Make the check fail for the missing behavior before changing production code.
4. Make the smallest independently explainable change.
5. Run fast checks during the loop. Keep the full suite for the closeout run.
6. Classify failures as load flake, self-inflicted failure, or pre-existing failure before acting.
7. After three failed fixes in the same place, return to design or slicing instead of adding another patch.
8. Close with a ticket-only commit, an exact run/not-run record, and a handoff to another context.

**Criterion.** The slice has a fresh, repeatable verification result that can be pasted into the record.

## Boundaries

- Do not change the spec; return requirement problems to charter.
- Do not split tickets; return slicing problems to slice.
- Do not self-review; hand off to gate.
- Do not publish or expand scope.
