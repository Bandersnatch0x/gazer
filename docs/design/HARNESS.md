# GAZER — Harness and lifecycle hooks

How the engine lets subsystems observe the simulation without scattering conditionals through the reducer. This document is the contract; the code must be written against it, not the reverse.

## 1. Principle

Awakening events, ledger anchoring, and stage transitions are all registered in one declarative hook table. There are no ad-hoc `if (stage === 2 && hasAwakened)` branches in the reducer, and no subsystem reaching into another's internals to notice that something happened.

Hooks come in two kinds:

| Kind | Contract |
| --- | --- |
| Synchronous | Runs inside the tick that fired the point, must finish within 5 ms, may not await, may not allocate unbounded work |
| Asynchronous | Enqueued with the triggering context; runs after the tick completes and may not write back into the state of that tick |

The hook table is data, not code. It is loaded at boot, can be replaced at runtime (hot reload), and is validated against the lifecycle point list before it is installed. A hook whose `point` is unknown fails installation instead of silently never firing.

Synchronous hooks are ordered by `priority` ascending, ties broken by `id`, so firing order is deterministic and replayable. Asynchronous hooks may complete in any order; anything that depends on their order is a bug.

## 2. Lifecycle points

Twelve points, each with a fixed firing moment.

| Point | Fires when | Sync | Registered hooks |
| --- | --- | --- | --- |
| `sim:tick` | Every tick, after the reducer has produced the next state | sync | `gv_accumulator`, `ontology_ratchet_check` |
| `action:pre` | A player action is accepted, before it mutates state | sync | `action_gate` |
| `action:post` | A player action has been applied | sync | `ledger_writer`, `gaze_detector`, `hesitation_recorder` |
| `ledger:anchor` | An entry is appended to the behaviour ledger | sync | `ledger_seal` |
| `gv:cross` | GV crosses a stage threshold in either direction | sync | `awakening_events`, `stage_gate` |
| `stage:shift` | The expression tier changes, after `gv:cross` has run | async | `palette_shift_queue` |
| `creature:death` | A creature transitions to `dead` | sync | `core_memory_mark`, `swarm_mourning_queue` |
| `memory:propagate` | A whisper is resolved between two creatures | async | `distortion_apply` |
| `session:start` | A run begins or resumes | async | `run_memory_load` |
| `session:end` | A run ends | async | `drift_consolidation`, `genome_persist` |
| `llm:budget` | Before a model call is issued, with the current call count | sync | `budget_guard` |
| `llm:fallback` | A model call failed, timed out, or was rejected | sync | `voice_degrade`, `manual_pool_fill` |

`gv:cross` fires on downward crossings too, because the tier can fall. `ontology_ratchet_check` runs on every tick and is the only place that may append to `OntologyLedger`; it never removes an entry, so a GV drop cannot undo a category collapse.

## 3. HookDef

```ts
type LifecyclePoint =
  | "sim:tick"
  | "action:pre"
  | "action:post"
  | "ledger:anchor"
  | "gv:cross"
  | "stage:shift"
  | "creature:death"
  | "memory:propagate"
  | "session:start"
  | "session:end"
  | "llm:budget"
  | "llm:fallback";

interface HookContext {
  readonly point: LifecyclePoint;
  readonly tick: number;
  readonly state: WorldState;
  readonly event: SimEvent | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface HookDef {
  point: LifecyclePoint;
  id: string;
  priority: number;
  sync: boolean;
  guard?: (ctx: HookContext) => boolean;
  handler: (ctx: HookContext) => void | Promise<void>;
  logged: boolean;
}
```

`guard` runs before `handler` and must be pure. A sync hook declaring `sync: false` in the table and returning a Promise is a contract violation and is reported at install time, not at the first tick.

`logged: true` writes a ledger entry with the hook id, point, tick, and outcome. Hooks that can change player-visible state are logged; pure observers are not, to keep the ledger readable.

## 4. First registry

| Point | Hook ids |
| --- | --- |
| `sim:tick` | `gv_accumulator`, `ontology_ratchet_check` |
| `action:post` | `ledger_writer`, `gaze_detector`, `hesitation_recorder` |
| `gv:cross` | `awakening_events`, `stage_gate` |
| `creature:death` | `core_memory_mark`, `swarm_mourning_queue` |
| `session:end` | `drift_consolidation`, `genome_persist` |

`core_memory_mark` no longer hard-codes an event-type list. It flags the death as a consolidation candidate; the model decides what survives, per the two-layer memory rules in `docs/design/ONTOLOGY.md`.

## 5. Runtime model routing

Five routes, each with a preferred, secondary, and fallback target.

| Route | Preferred | Secondary | Fallback | Latency budget |
| --- | --- | --- | --- | --- |
| Roundtable dialogue | Primary hosted model, Level A single call | Smaller hosted model, same prompt | `manualPool` lines | 800 ms |
| OntologyShift choreography | Primary hosted model with effect schema | Smaller hosted model | Scripted shift table | 1200 ms |
| Drift and consolidation | Primary hosted model at `session:end` | Smaller hosted model | Deterministic drift pick from the seeded PRNG | 2000 ms, off the critical path |
| Level B verification | Primary hosted model, single-creature context | Smaller hosted model | Keep the original turn | 600 ms |
| TTS | Browser `SpeechSynthesis`, Stage 3+ | — | Text bubbles only | none; it is local |

Routing is chosen per call, not per session, so one slow route does not degrade the others. `llm:budget` runs before every route and refuses the call when the ceiling is reached, which sends that route to its fallback instead of queueing.

## 6. Degradation is narrative

When a local or fallback model takes over, the harness sets `voice_degraded` on the world state. That flag is not an error path, and it must never surface as one:

- Speech lines gain a light character noise prefix.
- The creature's vitals display a slower heartbeat.
- The experiment log records "they changed throats".

The rule is fixed: **degradation is always absorbed into the fiction, and is never displayed as an error.** No banner, no toast, no red text, no spinner. A player should read a degraded scene as the world being tired, not as the software being broken.

This is also why `llm:fallback` is a synchronous point: the flag has to be set before the same tick renders, so the visual change and the text change land together.

## 7. Explicitly not doing

Three ideas were considered and rejected. They are recorded here so they are not silently reintroduced.

**Self-iterating narrative** — rewriting RT-SYSTEM at runtime and having it actually take effect. It puts a non-reproducible variable in the core path: if one line breaks on demo day, there is nothing to roll back to. It also answers "can the model rewrite itself", which is not the question the project is making; the question is whether what you raised is a model. It adds nothing for a judge and risks the demo. Left as future design.

**Ollama local fallback** — it adds one more failure point to the demo environment for no gain. Falling back to the manual pool is already sufficient, and it degrades narratively instead of introducing a second runtime to debug.

**A batch CLI** — it does not improve the submission materials, and CI regression has no payoff inside the remaining 23 days.
