# GAZER — Context Assembly (RT-CONTEXT)

How a roundtable request is built from world state. The budget is 600 tokens. Selection is code; only the final prose is the model's.

## 1. Principle: selection, not summarisation

Compression here is **selection**. A summary rewrites a memory in different words, and the rewrite breaks `memory_ref` provenance: the engine can no longer prove that a cited ID says what the speaker said. So the assembler never paraphrases a memory. It scores entries, keeps the top ones, and serialises them verbatim with their IDs.

Allocation follows the speaker. A creature's own block is the only place its memories appear, and the block is capped so that four creatures fit inside one call.

Every selection rule below is expressible in code over `WorldState`: a score is arithmetic, a top-k is a sort, a budget is a running sum. The LLM receives the assembled string and does one thing with it: write the turns.

## 2. Token budget

Total 600. Rough counts at 4 tokens per word; the assembler measures the serialised string and trims by the degradation order in section 8.

| Section | Tokens | Contents |
| --- | --- | --- |
| SCENE TRIGGER | 30 | Stage, tick, trigger kind, one line of what just happened |
| SHARED BELIEF | 25 | The swarm's belief about the player and about deaths |
| SHARED AMBIENT | 40 | Structures, palette decay, silence flag, current UI labels |
| PER-CREATURE | 360 | 4 creatures at 90 each (identity 15, consolidated 20, candidates 40, drift 15) |
| RECENT HUMAN ACTIONS | 80 | Last 10 actions with numeric timings |
| BUDGET and RULES | 40 | Output schema, turn count, memory-ref rule |
| Reserve | 25 | Headroom for a long creature name or a wide number |
| **Total** | **600** | |

PER-CREATURE is 360 because the scene assumes four attending creatures. Speaker pre-selection keeps the count at four or fewer; a fifth creature is dropped before assembly rather than shrinking everyone's block.

## 3. Per-creature block: 90 tokens

| Part | Tokens | Contents |
| --- | --- | --- |
| Identity line | 15 | ID, generation, top traits, current mood and impression |
| Consolidated | 20 | At most 2 entries, verbatim, always included |
| Candidate memories | 40 | At most 3 working entries, verbatim, with IDs |
| Drift summary | 15 | At most 2 drift fragments, verbatim |

90 is a ceiling, not a target. A creature with two memories sends two.

The consolidated section is carved out of what used to be a 60-token candidate allowance. Consolidated entries are the creature's self-knowledge and are never selected by score; they are always present, in this form:

```
always: [cons_031] "your human once lied to you about 02"
```

They are quotable: a turn's `memoryRef` may carry a `cons_` prefix, and the validator treats that citation as first-hand, on the same footing as `witnessed`. It is the individual's account of itself, not a rumour.

## 4. Candidate memory scoring

Every entry in the speaker's `working` layer is scored, and the top three go into the block. `consolidated` entries bypass scoring entirely.

```
score = salience
      + 2.0 * relevance
      + 1.5 * recency
      + 1.0 * is_core
      + 0.8 * valence_extreme
      - 0.5 * source_penalty
```

| Term | Definition |
| --- | --- |
| `salience` | The entry's own `salience` field, 0..1 |
| `relevance` | Keyword overlap between the entry `fact` and the scene trigger terms, normalised to 0..1 |
| `recency` | `0.5 ** (ageTicks / HALF_LIFE)`, where `ageTicks = state.tick - entry.atTick` and `HALF_LIFE` is one in-game day (1440 ticks) |
| `is_core` | 1 if the entry is a consolidation candidate (a death, a player answer, or an exposed lie), else 0 |
| `valence_extreme` | `abs(valence)`, 0..1: strong feeling is more speakable than mild |
| `source_penalty` | 1 if `witnessed === "inferred"`, else 0; derived memories are weaker evidence for a speaker |

Weights are constants in one table so a tuning change is one edit. Ties break by `atTick` descending, then by `id`, so assembly is deterministic.

`relevance` is the only term that depends on the scene. It is computed with the same tokeniser used for the keyword-overlap check in the roundtable validator, so the two cannot drift apart.

## 5. Serialisation format

Every memory line carries its ID and its source, because the model must be able to cite one and the engine must be able to check it.

```
[mem_1042|witnessed] "02 starved while you watched" (sal .8, val -.9)
```

The convention is `[ID|source] "verbatim fact, at most 25 words" (salience, valence)`:

- `ID` is `MemoryEntry.id`, unchanged.
- `source` is the epistemic status the holder believes: `witnessed`, `heard`, or `inferred`.
- The quoted text is the entry's `fact`, never rewritten. Over 25 words it is truncated at a word boundary and marked with `...`; truncation is a budget artefact, and the ID still resolves to the full entry.
- `salience` prints with one decimal, `valence` with one decimal and an explicit sign.

The model must reference these IDs in the `memoryRef` field of each turn. A turn whose `memoryRef` is absent from the speaker's slice is replaced by a `manualPool` line.

## 6. RECENT HUMAN ACTIONS

Raw ledger events are too verbose. They are templated, not summarised, and the numbers survive because they are the ammunition for the Stage 3 recitation.

| Ledger event | Rendered line |
| --- | --- |
| `feed` | `feed 02, hesitated 1400ms` |
| `clean` | `clean 02` |
| `stare` | `stared at 02 for 6200ms` |
| `rapid_click` | `clicked 02 x7` |
| `drag_to_hazard` | `dragged 02 toward hazard` |
| `idle` | `idle 45000ms` |
| `session_start` | `session began 02:14` |
| `player_answer` | `answered "do you love it" with "yes"` |
| `death` | `02 died of starvation` |

Ten lines, oldest dropped first. `hesitationMs`, `durationMs`, `count`, and `localHour` are printed as integers. A Stage 3 scene recites these numbers back with the exact values; rounding them at assembly time would make the recitation wrong.

## 7. Assembled example

```
SCENE TRIGGER
stage 2 | tick 3180 | trigger: player_stared 6200ms

SHARED BELIEF
player: "the one who watches" (3 hold, .7) | deaths: "02 chose to leave" (2 hold, .6)

SHARED AMBIENT
structures: black_tower@(4,4) | decay .35 | silent no | labels: feed="Offer"

CREATURE 01
id 01 | gen 2 | watcher,clinging | mood wrong | impression .2
[mem_1042|witnessed] "02 starved while you watched" (sal .8, val -.9)
[mem_1044|heard] "the keeper counts our breaths" (sal .5, val -.4)
drift: "asks about the window"

CREATURE 02
id 02 | gen 2 | mourner | mood sad | impression -.3
[mem_1051|witnessed] "01 was fed before me, twice" (sal .6, val -.5)
drift: "repeats the last thing it heard"

CREATURE 03
id 03 | gen 1 | herald | mood curious | impression .5
[mem_1060|inferred] "the tower grew when the room went dark" (sal .4, val -.2)

CREATURE 04
id 04 | gen 1 | mimic | mood hungry | impression .1
[mem_1063|witnessed] "the cursor stopped moving" (sal .3, val .1)

RECENT HUMAN ACTIONS
stared at 02 for 6200ms
feed 01, hesitated 1400ms
clicked 02 x7
idle 45000ms
session began 02:14

BUDGET
2..4 turns | cite only your own memoryRef | mood from: curious,sad,loving,wrong,hungry
```

Counted, this is about 250 tokens with two creatures' blocks trimmed; a full four-creature scene fills the 600.

## 8. Degradation order

When the assembled string exceeds 600 tokens, trim in this order and stop as soon as it fits.

1. Candidate memories 3 -> 2 -> 1 per creature, dropping the lowest score first.
2. Drift summary 2 -> 1 per creature, keeping the newest.
3. RECENT HUMAN ACTIONS 10 -> 5, dropping the oldest.
4. Traits top-2 -> top-1 in the identity line.

Never trimmed: SHARED BELIEF, the consolidated section, every creature's identity line, and every memory ID that survives selection. Removing an identity line makes a speaker unattributable; removing an ID breaks provenance for a turn the model already wrote; removing a consolidated entry erases self-knowledge that the model is allowed to cite.

If the budget still overflows after step 4, the assembler drops the lowest-scoring attending creature entirely and records the drop. It never sends a partial creature block.

## 9. Cache key and cost

```
key = stage + trigger + hash(serialised context)
```

The hash covers the exact assembled string, so a cache hit is a byte-identical request. Target hit rate is above 60 percent, which the architecture doc sets as the design target. A hit costs no tokens and no latency.

Cost per scene is one roundtable call. With the 600-token budget, four creatures, and the 15-calls-per-30-minutes hard ceiling, the context is roughly 60 percent of a typical small-model call; the ceiling, not the context, is what bounds spend. Beyond the ceiling the world falls back to `manualPool` lines.

## 10. Field contract

`salience` and `valence` are `MemoryEntry` fields in `docs/design/ARCHITECTURE.md`, typed `number`, with ranges 0..1 and -1..1. They are written when the memory is created, carried through gossip distortion unchanged in range, and read only by the scorer above.

Memory has two layers. `working` is a FIFO of at most 60 entries with decaying salience; `consolidated` holds at most 12 entries and is never evicted by the engine. Consolidation runs once per `session:end`, batched with drift so it costs no extra call; when the layer is full, that call returns a `retire` verdict and the retired entry drops to the tail of `working`. Only the model may retire a permanent fact — code never deletes one.

Deaths, player answers, and exposed lies are consolidation candidates; the `is_core` term keeps them in view until the model decides what to keep. The former fixed six-slot core-memory scheme is replaced by this two-layer design.
