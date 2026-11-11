# GAZER — Architecture (v3)

**A 1997 virtual pet game that was never a pet game.**

Kiroween 2026, Resurrection track. Deadline 2026-12-05 06:00 Beijing.

## The claim

Delete the LLM and GAZER becomes an ordinary pixel pet game. Every player's world shape, every anomaly, every rumour the swarm believes, and the one line only they hear are decided by the model at runtime. The LLM is not a pipe. It is the life.

You do not raise pets. You raise a model. It remembers, lies, breeds, and its soul is a few lines of prompt you can open and read.

## Version history

| Version | LLM role | One-liner |
| --- | --- | --- |
| v1 | Voice | Some text is AI-written |
| v2 | Director | An AI directs your world |
| v3 | Life itself | You raise a model |

**Design axiom.** Every LLM capability gap becomes a mechanic. Latency becomes heartbeat. Drift becomes aging. Token stream becomes voice. Absence becomes the Silent Run.

## Layer boundary

```
frontend        PixiJS renderer + effect primitive executor + Web API escapes
   ▲
   │ structured directives (tool calls, roundtable scripts)
   │
director        LLM layer (async, event-driven)
   │            roundtable · world mutation · anomaly choreography
   │            player model · memory consolidation · drift · breeding
   ▲
   │ behaviour ledger / world state summary / private memory slices
   │
simulation      deterministic engine (state machine, resources, gossip, save)
```

Hard rule: the simulation owns physics. The LLM owns fate. If the LLM is unavailable the engine keeps running and the world goes silent, which is a designed state with its own scripted line.

## Data shapes

### Ontology

Every entity carries a kind, a persistence basis, and an epistemic status. Stage progression is a sequence of irreversible category collapses, recorded in an append-only `OntologyLedger`. Full specification in `docs/ONTOLOGY.md`.

```ts
type EntityKind = "pet" | "organism" | "observer" | "record" | "substrate";
type EpistemicStatus = "witnessed" | "heard" | "inferred" | "fabricated";

interface OntologyShift {
  readonly atStage: Stage;
  readonly entity: string;
  readonly from: EntityKind;
  readonly to: EntityKind;
  readonly evidence: string;
}

interface SwarmBelief {
  readonly aboutPlayer: Readonly<Record<string, BeliefClaim>>;
  readonly aboutDeaths: readonly BeliefClaim[];
}
```

Three consequences the engine enforces: an entity's kind never regresses; a distorted memory is stored as `witnessed` in the receiving slice and is indistinguishable to its holder; and the player's own ontology entry is never writable by the player.

### Creature and world

```ts
interface CreatureState {
  readonly id: CreatureId;
  readonly genome: PromptGenome;
  readonly memory: MemorySlice;
  readonly impression: number;              // -1..1, personal trust of the player
  readonly stats: CreatureStats;
  readonly behavior: CreatureBehavior;
  readonly position: TilePos;
  readonly hatchedAtTick: number;
}

interface WorldState {
  readonly tick: number;
  readonly gv: number;
  readonly stage: Stage;
  readonly creatures: Readonly<Record<CreatureId, CreatureState>>;
  readonly structures: readonly Structure[];
  readonly uiLabels: Readonly<Record<string, string>>;
  readonly paletteDecay: number;
  readonly seed: number;
  readonly silent: boolean;
  readonly belief: SwarmBelief;
}
```

### Prompt genome

The soul is a prompt.

```ts
interface PromptGenome {
  readonly id: CreatureId;
  readonly generation: number;
  readonly lineage: readonly string[];
  readonly base: string;
  readonly traits: {
    readonly curiosity: number;
    readonly loyalty: number;
    readonly deceit: number;
    readonly clinging: number;
    readonly watchfulness: number;
  };
  readonly drift: readonly string[];        // append-only, FIFO, max 8
  readonly secrets: readonly string[];
  readonly manualPool: readonly string[];
  readonly temperatureBias: number;
  readonly distortionBias: number;
}
```

Genomes are written to `genomes/<id>.json` in the save payload, so a player can open the file and read the prompt. Drift length maps to visible aging.

### Private memory

The horror engine. Each creature witnesses a subset of the ledger.

```ts
interface MemoryEntry {
  readonly id: string;                      // evt_0001
  readonly atTick: number;
  readonly wallClock: string;
  readonly fact: string;                    // short, model-readable
  readonly witnessed: "direct" | "heard" | "inferred";
  readonly source: CreatureId | null;       // who told it, when heard
  readonly distortion: DistortionKind | null;
}

interface MemorySlice {
  readonly entries: readonly MemoryEntry[]; // capacity 40, FIFO
}
```

Spread rules: two creatures within 2 tiles for over 4 seconds trigger a whisper. Retention is `0.9 - distortionBias`. On failure the memory is stored distorted and indistinguishable from a real one.

Distortion kinds: `intensify` (0.3), `role_swap` (0.2), `invent_detail` (0.1).

### Roundtable

One call, many speakers. The response is a script, not a line.

```ts
interface RoundtableTurn {
  readonly speaker: CreatureId;
  readonly text: string;
  readonly intent: "observe" | "deceive" | "query" | "confide" | "accuse" | "comfort";
  readonly mood: Mood;
  readonly memoryRef: string;               // REQUIRED: an id in the speaker's slice
}

interface RoundtableScript {
  readonly scene: readonly RoundtableTurn[];  // 2..4 turns
}
```

**Validator.** Every turn's `memoryRef` must exist in that speaker's `MemorySlice`. A turn that fails is replaced by a line from that creature's `manualPool`. This is what makes lying structural rather than random: a creature may only lie about what it can plausibly know.

### Effect primitives

The engine's vocabulary. The director composes; it never emits rendering calls.

```ts
type Effect =
  | { kind: "freeze_all"; ms: number }
  | { kind: "gaze_at_player"; creatureId: CreatureId; ms: number }
  | { kind: "mirror_click_rhythm"; creatureId: CreatureId }
  | { kind: "palette_shift"; amount: number; ms: number }
  | { kind: "desaturate"; amount: number }
  | { kind: "audio_drop_track"; track: string }
  | { kind: "spawn_structure"; structure: "black_tower"; at: TilePos }
  | { kind: "relabel_ui"; target: string; text: string }
  | { kind: "set_trait"; creatureId: CreatureId; trait: CreatureTrait }
  | { kind: "rewrite_sprite"; creatureId: CreatureId; palette: readonly string[]; mask: readonly string[] }
  | { kind: "glyph_corrupt"; amount: number }
  | { kind: "creature_speech"; creatureId: CreatureId; text: string; mood: Mood }
  | { kind: "collective_speech"; text: string; mood: Mood }
  | { kind: "ui_shake"; intensity: number; ms: number }
  | { kind: "creature_wink"; creatureId: CreatureId }
  | { kind: "cursor_pull"; creatureId: CreatureId; strength: number }
  | { kind: "favicon_eye"; intensity: number }
  | { kind: "title_mutate"; text: string }
  | { kind: "outside_eyes"; opacity: number };
```

Full catalogue with intensity tiers in `docs/EFFECT_PRIMITIVES.md`.

### Director output

```ts
interface DirectorPlan {
  readonly mutation: WorldProposal | null;
  readonly choreography: readonly TimedEffect[];
  readonly lines: readonly LineSpec[];
  readonly playerModelPatch: PlayerModelPatch | null;
}
```

The engine validates every proposal. Illegal proposals are refused, logged, and change nothing. Same refusal semantics the Z-machine version proved with reference equality.

### Player model and persistent memory

```ts
interface PlayerModel {
  readonly archetype: "nurturer" | "tyrant" | "ghost" | "analyst" | "ambivalent_guardian";
  readonly traits: { empathy: number; cruelty: number; curiosity: number; patience: number };
  readonly signatureMoment: string;
  readonly nextDirective: string;
  readonly plannedEvents: readonly string[];
}

interface RunMemory {
  readonly runId: string;
  readonly endedAt: string;
  readonly remembering: readonly string[];
  readonly unnoticedHabit: string;
  readonly nextQuestion: string;
  readonly ending: EndingId;
  readonly genomes: readonly PromptGenome[];
  readonly belief: SwarmBelief;
}
```

NG+ opens from `RunMemory`: "You came back. 07 still asks about you. We kept its spot empty."

## Memory visibility

The private-memory mechanic only exists if the player can perceive it. Two surfaces, both quiet:

1. Every speech line carries a hairline witness mark. Default is nearly invisible; hover reveals `witnessed`, `heard`, or `inferred`. A creature reciting something it never saw shows `heard`, which is the tell.
2. The Album panel lists each creature's memory slice and current impression. Players who look find the mechanism; players who do not are never interrupted.

## Replay

Replay input is `Snapshot + Effect[] + LedgerEntry[]`. Never natural language, never raw model output. The director is outside the replay path.

## Determinism

The simulation is a pure reducer over `(WorldState, SimEvent)`. No clock, no randomness beyond the stored seed, no I/O. LLM output arrives as validated effects and is applied deterministically. Gossip distortion uses a seeded PRNG so a run replays exactly.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| Roundtable timeout (800 ms) | Manual pool lines, world continues |
| Invalid JSON | Rejected, retried once, then manual pool |
| Turn fails memory validation | That turn replaced by the speaker's manual pool |
| Illegal world proposal | Refused by the engine, logged, world unchanged |
| No API key | Silent Run: creatures behave, no speech, no anomalies. Scripted line at minute 40 |
| Rate limit or outage | Creatures "sleep", world quiets, staged not errored |

No loading spinner ever appears. Horror does not wait on a network call.

## Voice

Text bubbles at Stages 0 to 2. Streaming TTS from Stage 3, single speaker only. Pacing follows the token stream, so a generation stall reads as hesitation. Latency is performance.

## Cost

One roundtable call per scene. Speaker pre-selection when more than five creatures are present. Drift and breeding batched at session end. Cache key `stage + trigger + hash(state)`, target hit rate above 60 percent. Hard budget about 15 calls per 30 minutes; beyond it, manual pools only.

## Tech stack

```
Frontend  PixiJS 8, TypeScript, native DOM for shell
Sim       pure reducers, Vitest + fast-check, seeded PRNG
Director  fetch to a same-origin proxy; no SDK
Storage   localStorage (world, ledger, GV, seed, genomes, run memories)
Audio     WebAudio, procedural, no asset files
TTS       browser SpeechSynthesis, Stage 3+, single voice
Escapes   favicon canvas, document.title, visibilitychange, DOM overlays
```

No React, no state library, no parser library, no provider SDK.

## Red lines

1. No jump scares, no gore. All horror is cognitive.
2. LLM output is filtered by schema validation plus a keyword blocklist, with a manual fallback pool.
3. The cozy act must not exceed 20 minutes for an engaged player.
4. Web escapes touch page-internal APIs only. Never camera, microphone, files, or real identity.
5. Ghost profiles carry portraits only, never raw logs, and are opt-out.
6. Swarm lying concerns in-game events only. The model never invents facts about the player's real life.
7. Inversion Mode's AI keeper must never mock the player. It hesitates and errs, but it is gentle.

Red line 7 is the emotional floor: **the endpoint of horror must be empathy, not humiliation.**
