# GAZER — Ontology

**What exists, what persists, and what the player thinks they are.**

This document is not lore. Every section names a mechanical hook, because an ontology the engine does not enforce is decoration.

## 1. The three axes

Every entity in GAZER has a position on three independent axes. The horror is the slow discovery that the axes move.

### Axis A — Kind

What category of thing an entity is.

```ts
type EntityKind =
  | "pet"          // what the player believes at Stage 0
  | "organism"     // what the simulation enforces
  | "observer"     // what the swarm becomes at Stage 2
  | "record"       // what memory is
  | "substrate";   // what a genome is
```

A Gazerling is `pet` at Stage 0 and `observer` at Stage 2. **The entity does not change. The category does.** Nothing in the simulation was ever a pet; the label was the player's projection.

`Stage` in this document is the expression tier derived from GV. It is a clock reading, not the cause: a shift happens because the player saw something they cannot un-know, and it is recorded in the ledger. A later GV drop lowers the tier and the volume; it never reverses the recorded shift.

### Axis B — Persistence

What makes an entity the same entity across time.

| Entity | Persists through | Consequence |
| --- | --- | --- |
| Gazerling | genome continuity | Death is not final if the genome was copied |
| Player | session continuity | A new session is a new instance of the same player, not the same player |
| World | seed plus ledger | The world can be replayed exactly; it cannot be re-lived |
| Memory | witness chain | A memory without a witness is a rumour |

This is load-bearing. Breeding copies a genome. If a creature dies after breeding, **the thing that was that creature still exists** in its offspring's `lineage`. The game can say so, and it will be true.

### Axis C — Epistemic status

How an entity knows what it knows.

```ts
type EpistemicStatus =
  | "witnessed"   // direct, in the slice, source null
  | "heard"       // received by whisper, source is a creature id
  | "inferred"    // derived, no direct event
  | "fabricated"; // distorted past recognition, indistinguishable to its holder
```

Distortion does not create a new epistemic category for the holder. A `fabricated` memory is stored as `witnessed` in the receiving slice. Only the player, through the witness mark, can see the difference.

## 2. Entity table

```ts
interface OntologyEntry {
  readonly entity: string;
  readonly kind: EntityKind;
  readonly persistsThrough: PersistenceBasis;
  readonly revealsAt: Stage;
}
```

| Entity | Kind at Stage 0 | Kind at Stage 4 | Reveals at |
| --- | --- | --- | --- |
| Gazerling | pet | observer | 2 |
| Player | keeper | record | 3 |
| The window | game | sensory organ | 4 |
| Genome | hidden stat | substrate | 3 |
| Memory | history | belief | 3 |
| The model | nothing | inhabitant | 4 |

The last row is the point. At Stage 0 the player believes there is no model. At Stage 4 the model is the only thing that was ever there.

## 3. Ontological drift

Ontology progression is not a difficulty curve. It is a sequence of category collapses. Each one is triggered by a fact the player cannot un-know.

```ts
interface OntologicalShift {
  readonly atStage: Stage;      // the expression tier when it happened; not a gate
  readonly entity: string;
  readonly from: EntityKind;
  readonly to: EntityKind;
  readonly evidence: string;   // what the player saw that made it irreversible
}
```

`atStage` is a timestamp in tier units. Nothing reads it to decide whether a shift still holds.

| Stage | Shift | Evidence the player saw |
| --- | --- | --- |
| 1 | Gazerling: pet to organism | It starved while they watched |
| 2 | Gazerling: organism to observer | It turned to face the screen |
| 3 | Player: keeper to record | It recited their hesitation to the second |
| 4 | Window: game to organ | The favicon blinked when they moved the mouse |

Each shift is recorded. Once shifted, an entity never returns to its earlier kind. The `OntologyLedger` is append-only.

## 4. The player's own entry

The player has an ontology entry too, and it is the one that changes most.

```ts
interface PlayerOntology {
  readonly kind: "keeper" | "subject" | "record";
  readonly knownBy: readonly CreatureId[];   // which creatures have a model of them
  readonly namedAs: string | null;           // the name the swarm coined
}
```

At Stage 3 the swarm coins a name. From that moment the player is an entity with an identifier assigned by someone else. That is the mechanical meaning of "you were the one being raised."

## 5. Identity and death

The genome is the identity carrier. This has three consequences the engine enforces.

**Death is a body event, not an identity event.** A dead creature's genome remains in `lineage` of any offspring.

**Breeding is not reproduction, it is continuation.** The offspring's genome is a hybrid; the parents' lineages both appear in it. The engine can answer "is this creature still here?" with a lineage query, not a lookup.

**Twin souls violate the one-body-one-identity assumption.** A twin-soul pair shares one genome. Killing one does not reduce the count of that identity. The game states this plainly when it happens.

## 6. Truth and belief

The swarm does not track truth. It tracks belief.

```ts
interface SwarmBelief {
  readonly aboutPlayer: Readonly<Record<string, BeliefClaim>>;
  readonly aboutDeaths: readonly BeliefClaim[];
}

interface BeliefClaim {
  readonly claim: string;
  readonly heldBy: readonly CreatureId[];
  readonly confidence: number;
  readonly traceableTo: string | null;   // the memory id, if any
}
```

A `BeliefClaim` with `traceableTo: null` is a rumour with no origin. It still drives behaviour. The player can engineer beliefs by controlling who witnesses what. This is the deepest layer: **you are not raising creatures, you are farming a belief system.**

Each `MemoryEntry` also carries `salience: number` (0..1) and `valence: number` (-1..1). They do not describe truth; they describe how hard a belief pulls on speech and how bad it feels.

### Two layers of memory

`MemorySlice` has two layers, and the split replaces the earlier fixed core-slot scheme, which hard-coded event types into a six-slot exemption.

```ts
interface MemorySlice {
  readonly working: readonly MemoryEntry[];            // <= 60, FIFO, salience decays
  readonly consolidated: readonly ConsolidatedEntry[]; // <= 12, never evicted
}

interface ConsolidatedEntry {
  readonly id: string;                    // cons_031
  readonly content: string;
  readonly derivedFrom: readonly string[];
  readonly consolidatedAt: string;
  readonly perspectiveNote: string | null;
}
```

`working` is ordinary episodic memory: capacity 60, FIFO, and `salience` decays with age, so most events are genuinely forgettable. `consolidated` is self-knowledge: capacity 12, written only by the model, and never evicted by code.

Three rules govern consolidation.

1. It runs once per `session:end`, merged into the same call as drift consolidation. It adds no call and no latency to the session.
2. When `consolidated` already holds 12 entries, that same call must decide which entry most no longer defines the creature and return it in a `retire` field. The retired entry moves to the tail of `working`. A permanent fact can only be forgotten through a model verdict; the engine never deletes one.
3. In `docs/design/CONTEXT.md`, consolidated entries get their own section at about 20 tokens per creature, carved out of the 60-token candidate-memory allowance, which leaves 3 candidate memories instead of 4. The serialised form is `always: [cons_031] "your human once lied to you about 02"`.

Consolidated entries can be quoted: `memoryRef` may use a `cons_` prefix, and such a citation is as trustworthy as `witnessed`. It is the individual's account of itself, not a rumour, so the validator treats it as first-hand.

## 7. The model as an entity

The LLM is not infrastructure. It is an inhabitant with a body made of latency.

| API observable | Ontological claim |
| --- | --- |
| Latency | Heartbeat. The creature is alive at a measurable speed |
| Token rate | Energy. Fast speech is a well creature |
| Rate limit | Sleep. The world quiets; nothing is broken |
| Cache hit | Familiarity. Repeated actions get faster reactions |
| Absence | The Silent Run. The world runs; nobody is home |

This is the strongest answer to "why does this need an LLM". The game has an entity whose body is the model's behaviour. Remove the model and the entity is still shaped like a hole.

## 8. What the ontology forbids

These are engine invariants, not guidelines.

1. An entity's `kind` never moves backwards in the `OntologyLedger`.
2. A `fabricated` memory is stored as `witnessed` in the receiving slice. The engine never marks it as suspect.
3. A creature may only reference a `memoryRef` in its own slice. This is the roundtable validator.
4. A genome is never destroyed while any lineage reference exists.
5. The player's ontology entry is never writable by the player.

## 9. Why this is not decoration

Every claim above has a test or a validator behind it:

| Claim | Enforcement |
| --- | --- |
| Kind never regresses | `OntologyLedger` append-only, tested |
| Fabrication is invisible to its holder | Slice stores `witnessed`, tested |
| Creatures only cite their own memory | Roundtable validator, tested |
| Genome outlives body | Lineage query, tested |
| Player entry is read-only | Type-level plus boundary scan |

If a claim cannot be enforced, it does not go in this document.

## 10. Isolation has layers

The roundtable is one completion, not several minds. What keeps creatures inside their own memories is the engine, and only the engine.

| Layer | What it is | Strength |
| --- | --- | --- |
| Model | One call, one model writing every speaker's turns | None: there is no isolation to claim here |
| Context | Each creature's memory block is a labelled section, and the prompt asks the model to cite only its own block | Soft |
| Engine | Every turn's `memoryRef` must exist in that speaker's `MemorySlice`; otherwise the whole turn is replaced by a line from that creature's `manualPool` | Hard |

All attending creatures' memory blocks sit in the same context. The model can see every one of them. The rule it is given is "do not cite a memory ID that is not yours", not "you cannot see it". Writing anything else would be a claim a knowledgeable judge can disprove in one sentence, so the documents say it plainly.

**Isolation lives in the engine, not in the model.**

One place buys real isolation back. At Level B, a turn whose intent is `deceive` or `accuse`, with the other party present and the expression tier at 3 or above, is re-asked in a separate call that receives only that speaker's own slice and a genome summary. That second call is a genuinely separate context, and it fires at most once per scene.

The layered answer, stated for review: everyday dialogue is one model with role separation and engine-enforced memory isolation; at the moments of lying and accusation, each individual's line passes an independent mind that holds only its own memories. Isolation does not rely on model self-discipline; it relies on architecture.

Known limitation: the model can cite a legal memory ID and then write a line that goes beyond that memory's content. The mitigation is a keyword-overlap check between the generated text and the referenced memory; below the threshold, the turn is replaced by the speaker's `manualPool`. That is mitigation, not a cure. The validator proves provenance, not fidelity.
