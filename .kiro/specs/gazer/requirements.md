# GAZER — Requirements

EARS-style requirements for the parts of GAZER that already have a mechanical seam. Each requirement names what the system must do, not how it is written. Terms follow `docs/agents/glossary.md`.

## 1. Simulation core

The simulation is a pure reducer over `(WorldState, SimEvent)`. It owns physics; the director owns fate.

**R1.1** When `step(state, event)` is called, the system shall return a new `WorldState` and shall not mutate the argument.

**R1.2** When the same state and the same event sequence are applied twice, the system shall produce deeply equal results.

**R1.3** The simulation shall not read the wall clock, call `Math.random`, or perform I/O.

**R1.4** When a `tick` event is applied, the system shall advance `tick` by exactly one and shall not advance it for any other event kind.

**R1.5** When a creature's `hunger` reaches 0, the system shall set its behavior to `dead` and shall not resume stat decay for that creature.

**R1.6** When a `hatch` event names an id that already exists, the system shall return the input state unchanged.

## 2. GV and expression tier

**R2.1** When a `gv` event is applied, the system shall clamp `gv` into 0..100.

**R2.2** When `gv` changes, the system shall set `stage` to the highest tier whose threshold is satisfied (0 at 0, 1 at 20, 2 at 40, 3 at 60, 4 at 80).

**R2.3** GV shall be reversible: a decrease shall lower `stage` without altering any recorded ontology shift.

**R2.4** The system shall not derive ontology state from `gv` or `stage`.

## 3. Behaviour ledger

**R3.1** When a ledger event is recorded, the system shall append an entry carrying the tick, the wall-clock string, and the event.

**R3.2** When the ledger exceeds 200 entries, the system shall evict the oldest.

**R3.3** When computing a GV delta, the system shall multiply the event weight by 1.5 for events recorded between 00:00 and 05:00 local time, and by 1.0 otherwise.

**R3.4** The system shall expose a lifetime summary containing feed count, death count, mean hesitation, favourite creature, typical hours, session count, and reset count.

## 4. Roundtable validator

**R4.1** When a roundtable script is submitted, the system shall accept it only if it contains 2..4 turns.

**R4.2** When a turn's `memoryRef` is absent from the speaker's `MemorySlice`, the system shall replace that entire turn with a line from that speaker's `manualPool`.

**R4.3** The system shall not silently drop a rejected turn; the script shall keep its turn count after replacement.

**R4.4** When the roundtable call exceeds 800 ms, the system shall abandon it and fill the scene from `manualPool` lines.

**R4.5** When a turn's text and its cited memory fall below the keyword-overlap threshold, the system shall replace that turn with a `manualPool` line and record the replacement.

**R4.6** The system shall treat the roundtable as one completion with many speakers; it shall not claim per-creature context isolation.

**R4.7** When a turn's intent is `deceive` or `accuse`, the other party is present, and the expression tier is 3 or above, the system shall issue at most one Level B verification call per scene, carrying only that speaker's slice and genome summary.

**R4.8** When Level B returns `verdict: no`, the system shall replace that turn with `replacement` and record the original line in the speaker's slice as an `inferred` memory.

**R4.9** When Level B fails or times out, the system shall keep the original turn rather than interrupting the scene.

## 5. Private memory

**R5.1** When two creatures remain within 2 tiles for more than 4 seconds, the system shall trigger a whisper from one to the other.

**R5.2** When a memory is transmitted, the system shall retain it with probability `0.9 - distortionBias`, using the seeded PRNG.

**R5.3** When retention fails, the system shall store the distorted memory with epistemic status `witnessed` and `source: null`, indistinguishable from a direct memory.

**R5.4** When the `working` layer exceeds 60 entries, the system shall evict the oldest entry and decay the salience of the rest.

**R5.5** The `consolidated` layer shall hold at most 12 entries, shall be written only by the consolidation call at `session:end`, and shall never be evicted by code.

**R5.6** When `consolidated` is full, the system shall retire exactly the entry named by the model's `retire` field and move it to the tail of `working`; it shall not delete it.

**R5.7** When a turn's `memoryRef` carries a `cons_` prefix, the system shall accept it as first-hand if that entry exists in the speaker's `consolidated` layer.

**R5.8** Every working memory entry shall carry `salience` in 0..1 and `valence` in -1..1.

## 6. Silent run

**R6.1** When no API key is configured, the system shall run the simulation normally with `silent: true`, emitting no speech and no anomalies.

**R6.2** When the silent run reaches minute 40, the system shall emit the single scripted line.

**R6.3** When the director is unavailable for any reason, the system shall not show a loading indicator.

**R6.4** When the network is offline, the system shall serve from the service worker cache and keep the world running.

## 7. Harness

**R7.1** The system shall fire exactly twelve lifecycle points, in the order and sync mode declared in `docs/design/HARNESS.md`.

**R7.2** When a synchronous hook exceeds 5 ms, the system shall record the overrun and shall not block the tick further.

**R7.3** When a hook declares an unknown point, the system shall reject the hook table at install time.

**R7.4** The system shall only append to `OntologyLedger` from `ontology_ratchet_check`; no other hook shall remove or rewrite an entry.

**R7.5** When a fallback model takes over, the system shall set `voice_degraded` and shall not render an error, toast, or loading indicator.
