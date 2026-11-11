---
name: slice
description: "Cut a spec into vertical slices so each one is narrow yet crosses every layer, can be demoed or verified on its own, and fits one fresh context. Use after a spec exists and before implementation starts, when the work arrives as one indivisible block or was already split by technical layer. Not for writing the spec, not for implementing it, and not for ticket fields: blocking edges and acceptance criteria are owned by the ticket format, so this skill does not restate them."
---
<!-- scaffold-stamp: agent-scaffold/templates/stage-skills/slice/SKILL.md@502e930+dirty -->

# Slice

A spec does not make work executable. Cut the solution into pieces that can each be demonstrated independently. Ticket fields belong to the ticket format.

## When to use

- The spec is ready but the work still arrives as one large implementation block.
- A technical-layer split produced tasks that are individually complete but cannot integrate.
- Several tickets may run in parallel but their ordering is unclear.

## How to use

1. Make every ticket a vertical slice: narrow, complete, and crossing every relevant layer.
2. Require an independent demo or verification for every ticket. If you cannot name the demo, the slice is wrong.
3. Size each slice for one clean context, not for a calendar estimate.
4. Put prerequisite refactors in their own tickets before dependent slices.
5. Let the ticket format carry blocking edges and acceptance behavior. Confirm those fields exist; do not duplicate them here.
6. Ask three closing questions: Is the size right? Are blockers real? Should any slice merge or split?
7. When a person is present, submit the answers for confirmation. Otherwise mark the result as not aligned with a person.

**Criterion.** Anyone can state what one ticket will demonstrate without reading another ticket.

## Boundaries

- Do not change the spec; return problems to charter.
- Do not define ticket fields; use the ticket format.
- Do not implement or estimate hours.
- One ticket solves one thing. Put adjacent discoveries in new tickets.
