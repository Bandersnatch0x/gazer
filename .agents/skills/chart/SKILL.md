---
name: chart
description: "Turn work too large for one session into a reviewable map: an overview ticket holding decisions, fog and notes, sub-tickets attached by ownership edges, and blocking edges that declare order. Use when the boundary of a delivery is unclear or dependencies decide the sequence. Not for cutting an already-specified plan into slices, and not for implementing anything."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/chart/SKILL.md@502e930+dirty -->

# Chart

Do not map work that one session can finish reliably. Mapping costs time; it buys a next step that no longer depends on memory or guesswork.

## When to use

- The delivery boundary is unclear or the affected area is not understood.
- Dependencies determine order, but the dependencies are not known yet.
- The goal is known, but the slice and sequence are unclear and parallel work could collide.

## How to use

1. Decide whether the work is large enough. It is large when one session cannot hold it or when order depends on unknowns. Otherwise proceed directly.
2. Create an overview ticket with decisions, fog, and notes. Append decisions; do not overwrite them.
3. Cut sub-tickets as independently deliverable progress, not as document chapters. Keep work that has no delivery behavior in fog.
4. Add ownership edges and blocking edges. Parallel work without real dependency analysis is a bet.
5. Write unknowns as questions in fog. Fog is input to the next investigation, not evidence of failure.
6. Treat the first write as ownership. Check assignment before dispatch and never dispatch an already-owned ticket twice.
7. Advance the frontier: open, unblocked, unassigned tickets in map order. Take the first one, not the most attractive one.
8. Write back the answer, close the ticket, and append its gist to the map's decisions.

**Criterion.** A person who did not join the discussion can read the map and identify the next ticket and why it is next.

## Boundaries

- Do not write the spec; that belongs to charter.
- Do not cut implementation tickets; that belongs to slice.
- Do not implement, review, or publish.
- A map is not a document tree. If it grows without deliverable tickets, narrow the goal first.
