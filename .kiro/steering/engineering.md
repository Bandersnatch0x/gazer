# Engineering constraints

## Pure reducer

The simulation is `step(state, event) -> state`. No mutation of the argument, no wall clock, no `Math.random`, no I/O, no `Date.now`. Time arrives as tick counts; the wall-clock string is carried in the event, not read inside the reducer.

Randomness exists only through the stored seed. Gossip distortion, drift selection, and any other stochastic choice derive from a seeded PRNG so a run replays exactly.

## Replay path

Replay input is `Snapshot + Effect[] + LedgerEntry[]`. Never natural language, never raw model output. The LLM is outside the replay path: its output is validated into effects and events before the reducer sees it, and replay never calls the model.

## Validation at the boundary

Every director output is untrusted input. Validate the schema, reject unknown effect kinds, reject `memoryRef` values outside the speaker's slice, and fall back to `manualPool` rather than throwing. An illegal world proposal is refused and logged; the world does not change.

## Secrets

No secrets in client code. The model is reached through a same-origin proxy; no provider key is shipped in the bundle, committed, or written to `localStorage`. Configuration holds references, not tokens.

## Dependencies

No React, no state library, no parser library, no provider SDK. The installed stack is PixiJS 8, TypeScript, Vite, Vitest, fast-check. Adding a dependency requires a recorded decision in `docs/agents/decisions/`.

## Gate

`npm run check` is `tsc --noEmit && vitest run`. It must be green before delivery. Tests assert user-observable behaviour: reducer output, validator replacement, threshold mapping. They do not assert internal call order.

## Claims must be enforceable

If an invariant cannot be tested or validated, it does not go into `docs/design/`. A documented claim without an enforcement point is decoration, and this project does not ship decoration.
