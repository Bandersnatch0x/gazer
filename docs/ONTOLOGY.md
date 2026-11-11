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

Stage progression is not a difficulty curve. It is a sequence of category collapses. Each one is triggered by a fact the player cannot un-know.

```ts
interface OntologicalShift {
  readonly atStage: Stage;
  readonly entity: string;
  readonly from: EntityKind;
  readonly to: EntityKind;
  readonly evidence: string;   // what the player saw that made it irreversible
}
```

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
