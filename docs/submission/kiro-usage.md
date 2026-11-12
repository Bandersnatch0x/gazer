# Kiro usage

What Kiro was asked to do, what it produced, and what the engine enforces.

**Status.** The `.kiro` assets in this repository are written and load-bearing: specs pin the behaviour the tests assert, steering pins the red lines, and the hook runs the gate. The MCP server and Kiro powers are **not** used, and this document says so rather than implying otherwise. A recorded Kiro session is still pending; see the last section.

## 1. Spec: simulation core

**Prompt.** Write EARS requirements for a deterministic reducer that owns creature physics, where the LLM owns fate and never state.

**Produced.** `.kiro/specs/gazer/requirements.md` R1.1 to R1.6: no mutation, same sequence yields deeply equal results, no clock or randomness or I/O, tick advances only on a tick event, hunger zero means dead, duplicate hatch is a no-op.

**Enforced.** `tests/engine.test.ts` asserts every one of those clauses with fast-check. The boundary scan in `tests/boundary.test.ts` fails the build if `Date`, `Math.random`, `fetch`, `localStorage`, or `setTimeout` appears anywhere under `src/sim/`.

**Kept.** The requirement that identity persists through the genome rather than the body, which is what makes death a body event and breeding a continuation.

**Rejected.** An early draft put static room text inside `WorldState`. That made every snapshot carry duplicated prose and made equality checks meaningless. Static content moved to the world definition; the state holds only mutable facts.

## 2. Spec: GV and stages

**Prompt.** Specify a hidden 0..100 attention value that drives expression intensity, and state explicitly that it must not drive ontology.

**Produced.** R2.1 to R2.4: clamp to 0..100, stage is the highest satisfied threshold, GV is reversible, and the system shall not derive ontology from GV.

**Enforced.** `tests/engine.test.ts` covers clamp and threshold mapping. The layering rule is written into `docs/design/ARCHITECTURE.md`: GV decides how much the world says, ontology decides what it knows. A kind player can push GV back down; the creatures still know what they saw, they simply stop saying it.

**Rejected.** Treating stage as a one-way ratchet with GV as its input. That produced the contradiction where a kind player's world regresses while the creatures keep stage-3 lines.

## 3. Spec: behaviour ledger

**Prompt.** Specify an append-only record of player behaviour that survives a 200-entry rolling window and exposes a lifetime summary.

**Produced.** R3.1 to R3.4, including the night multiplier of 1.5 between 00:00 and 05:00 and the requirement that mean hesitation be exposed.

**Enforced.** `src/sim/ledger.ts` carries the weights and the night rule. The summary is the input to the Stage 3 recital, which is the moment the game quotes the player's own hesitation back at them.

**Kept.** Mean hesitation as a first-class metric. It is the most uncomfortable number in the game and it costs one field.

## 4. Spec: roundtable validator

**Prompt.** Specify one completion producing a multi-speaker scene, where every turn must cite a memory the speaker actually holds, and the engine replaces any turn that reaches beyond it.

**Produced.** R4.1 to R4.9.

**Enforced.** `tests/director-roundtable.test.ts` proves with fast-check that arbitrary JSON never throws, that a turn with an out-of-slice `memoryRef` is always replaced, and that a replaced turn keeps the scene's turn count.

**Kept, and stated plainly.** R4.6 exists because the honest description matters: this is one completion with many speakers, not N independent minds. The isolation is enforced by the validator and the engine, not pretended at the model layer. Saying so is stronger than being caught overclaiming.

**Level B.** When a turn is `deceive` or `accuse` at stage 3 or above, one verification call runs with only that speaker's slice. It is capped at one per scene, and a failure keeps the original turn rather than interrupting the performance.

## 5. Spec: private memory

**Prompt.** Specify memory as a per-creature slice, with gossip that can distort, and with a distorted memory stored as if witnessed.

**Produced.** The two-layer slice: 60 working entries that decay, 12 consolidated entries that do not.

**Enforced.** `tests/sim-gossip.test.ts` asserts that the same seed gives the same distortion, and that a distorted entry is stored with `witnessed: "witnessed"` and `source: null`. That is the mechanic: the holder cannot tell.

**Kept.** The witness mark in the UI. Without a surface where the player can see `heard` versus `witnessed`, the mechanic exists but is invisible. The bestiary panel shows the same split per creature.

**Rejected.** Letting the model author memory text directly. Memory is written by the engine from ledger events; the model only cites IDs.

## 6. Spec: silent run

**Prompt.** Specify a playable state with no model at all, where the world still runs and the absence is narrative rather than an error.

**Produced.** The requirement that a missing endpoint yields a running world with no speech and no anomalies, and that degradation never shows a loading indicator.

**Enforced.** `src/game.ts` passes `null` for the client when no endpoint is configured, and the status bar says `silent`. Manual pools still fill stage transitions, so the game is playable offline and without a key.

**Kept.** The rule that horror never waits on a network call. Every model path has a timeout and a manual fallback.

## 7. Steering: product red lines

**Prompt.** Turn the design's red lines into constraints an agent cannot quietly break.

**Produced.** `.kiro/steering/product.md` and `.kiro/steering/engineering.md`.

**Enforced.** The seven red lines are restated in `docs/design/ARCHITECTURE.md`. The two that are mechanically checkable are checked: no secrets in client code, and no clock or randomness in the simulation.

**Kept.** The fifth red line as the emotional floor: the AI keeper may hesitate and err but must never mock the player. The endpoint of horror is empathy, not humiliation.

## 8. Hook: gate on source change

**Prompt.** Run the repository gate whenever simulation source or tests change.

**Produced.** `.kiro/hooks/gate-on-src-change.kiro.hook`, watching `src/**` and `tests/**` and running `npm run check`.

**Status.** The hook file is written to Kiro's hook schema. It has **not** been observed firing inside Kiro. This document does not claim otherwise. The same gate runs locally on every commit and in CI on every push, so the protection is real even while the hook itself is unverified.

## What is not used

**MCP.** No MCP server is configured and no tool call is recorded. The project does not claim MCP usage.

**Kiro powers.** Not created. Nothing here claims them.

**Custom agents.** The design documents them (an interpreter agent and a front-end agent with a mechanical boundary). The boundary is enforced by `tests/boundary.test.ts`, which fails the build if UI code imports the machine. The agents themselves are not yet configured inside Kiro.

## What a judge can verify

In the repository, without running Kiro:

- `.kiro/specs/gazer/requirements.md` states the behaviour the tests assert.
- `.kiro/steering/` states the red lines, and the two checkable ones are checked by tests.
- `.kiro/hooks/gate-on-src-change.kiro.hook` exists and is not gitignored.
- `npm run check` runs 171 tests, including the boundary scan that fails on a leaked secret or a UI import of the machine.