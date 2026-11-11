/**
 * Roundtable context assembly, from `docs/design/CONTEXT.md`.
 *
 * Compression here is selection, not summarisation: memories are scored, the top
 * ones are kept, and each surviving entry is serialised verbatim with its ID so
 * the validator can resolve every `memoryRef` a turn cites.
 */

import type { CreatureState, Mood, Stage } from "../sim/types";
import type { PromptGenome } from "../sim/genome";
import { topTraits } from "../sim/genome";
import type { ConsolidatedEntry, MemoryEntry, MemorySlice } from "../sim/memory";

export interface AttendingCreature {
  readonly state: CreatureState;
  readonly genome: PromptGenome;
  readonly memory: MemorySlice;
}

export interface ContextInput {
  readonly stage: Stage;
  readonly trigger: string;
  readonly creatures: readonly AttendingCreature[];
  readonly recentActions: readonly string[];
  readonly sharedBelief: string;
  readonly ambient: string;
  /**
   * Current simulation tick, used by the recency term. Optional because the
   * caller may only hold a memory slice; when absent the assembler uses the
   * newest remembered tick, which keeps assembly deterministic.
   */
  readonly tick?: number;
}

export const TOKEN_BUDGET = 600;

/**
 * The assembler estimates tokens from character count. Four characters per token
 * is the rough English constant named in `CONTEXT.md` section 2; it is a budget
 * heuristic, never a billing figure.
 */
const CHARS_PER_TOKEN = 4;

/** One in-game day, in ticks. Recency decays to 0.5 over this span. */
const HALF_LIFE_TICKS = 1440;

/** Score weight table. A tuning change is one edit here. */
const WEIGHTS = Object.freeze({
  relevance: 2.0,
  recency: 1.5,
  isCore: 1.0,
  valenceExtreme: 0.8,
  sourcePenalty: 0.5,
});

/** `witnessed === "inferred"` halves the source penalty term (0.5, not 1). */
const INFERRED_SOURCE_PENALTY = 0.5;

/**
 * `core_memory_mark` flags a consolidation candidate by prefixing its id with
 * `core_`; the fixed `MemoryEntry` shape carries no separate boolean.
 */
const CORE_ID_PREFIX = "core_";

const MAX_FACT_WORDS = 25;
const MAX_CONSOLIDATED_PER_CREATURE = 2;

const MOODS: readonly Mood[] = ["curious", "sad", "loving", "wrong", "hungry"];

/**
 * Lowercase alphanumeric tokens of length four or more. Shared with the
 * roundtable validator's keyword-overlap check so the two cannot drift apart.
 */
export function contentWords(text: string): ReadonlySet<string> {
  const words = new Set<string>();
  for (const match of text.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    if (match[0].length >= 4) {
      words.add(match[0]);
    }
  }
  return words;
}

function relevanceOf(fact: string, trigger: string): number {
  const triggerWords = contentWords(trigger);
  if (triggerWords.size === 0) {
    return 0;
  }
  const factWords = contentWords(fact);
  let overlap = 0;
  for (const word of triggerWords) {
    if (factWords.has(word)) {
      overlap += 1;
    }
  }
  return overlap / triggerWords.size;
}

export function scoreMemory(entry: MemoryEntry, trigger: string, currentTick: number): number {
  const relevance = relevanceOf(entry.fact, trigger);
  const ageTicks = Math.max(0, currentTick - entry.atTick);
  const recency = 0.5 ** (ageTicks / HALF_LIFE_TICKS);
  const isCore = entry.id.startsWith(CORE_ID_PREFIX) ? 1 : 0;
  const valenceExtreme = Math.min(1, Math.abs(entry.valence));
  const sourcePenalty =
    entry.witnessed === "inferred" ? INFERRED_SOURCE_PENALTY : 0;

  return (
    entry.salience +
    WEIGHTS.relevance * relevance +
    WEIGHTS.recency * recency +
    WEIGHTS.isCore * isCore +
    WEIGHTS.valenceExtreme * valenceExtreme -
    WEIGHTS.sourcePenalty * sourcePenalty
  );
}

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function quoteFact(fact: string): string {
  const words = singleLine(fact).split(" ").filter((word) => word.length > 0);
  if (words.length <= MAX_FACT_WORDS) {
    return words.join(" ");
  }
  return `${words.slice(0, MAX_FACT_WORDS).join(" ")}...`;
}

/** One decimal, no leading zero, explicit minus: .8, -.9, .0. */
function oneDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    return ".0";
  }
  const magnitude = Math.abs(value).toFixed(1);
  const body = magnitude.startsWith("0") ? magnitude.slice(1) : magnitude;
  return value < 0 ? `-${body}` : body;
}

function memoryLine(entry: MemoryEntry): string {
  return `[${entry.id}|${entry.witnessed}] "${quoteFact(entry.fact)}" (sal ${oneDecimal(entry.salience)}, val ${oneDecimal(entry.valence)})`;
}

function consolidatedLine(entry: ConsolidatedEntry): string {
  // Consolidated entries are self-knowledge and are never rewritten or truncated.
  return `always: [${entry.id}] "${singleLine(entry.content)}"`;
}

function moodOf(state: CreatureState): Mood {
  // `CreatureState` records behavior and stats, not a mood; derive the mood the
  // identity line needs from what the body is doing right now.
  if (state.behavior === "dead") {
    return "wrong";
  }
  if (state.behavior === "hungry" || state.stats.hunger < 30) {
    return "hungry";
  }
  if (state.behavior === "dirty" || state.stats.hygiene < 30) {
    return "wrong";
  }
  if (state.behavior === "sleeping" || state.stats.energy < 20) {
    return "sad";
  }
  if (state.stats.happiness >= 70) {
    return "loving";
  }
  return "curious";
}

function impressionOf(slice: MemorySlice): number {
  if (slice.working.length === 0) {
    return 0;
  }
  const total = slice.working.reduce((sum, entry) => sum + entry.valence, 0);
  return total / slice.working.length;
}

interface ScoredEntry {
  readonly entry: MemoryEntry;
  readonly score: number;
}

function rankMemories(
  slice: MemorySlice,
  trigger: string,
  currentTick: number,
): readonly ScoredEntry[] {
  return slice.working
    .map((entry) => ({ entry, score: scoreMemory(entry, trigger, currentTick) }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.entry.atTick !== a.entry.atTick) {
        return b.entry.atTick - a.entry.atTick;
      }
      return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
    });
}

interface Seat {
  readonly creature: AttendingCreature;
  readonly ranked: readonly ScoredEntry[];
}

interface BudgetLevel {
  readonly memories: number;
  readonly drift: number;
  readonly actions: number;
  readonly traits: number;
}

/**
 * Degradation ladder, applied in order until the assembled string fits:
 * memories 4 -> 3 -> 2, drift 2 -> 1, recent actions 10 -> 5, traits top-2 -> top-1.
 */
const DEGRADATION_LADDER: readonly BudgetLevel[] = Object.freeze([
  { memories: 4, drift: 2, actions: 10, traits: 2 },
  { memories: 3, drift: 2, actions: 10, traits: 2 },
  { memories: 2, drift: 2, actions: 10, traits: 2 },
  { memories: 2, drift: 1, actions: 10, traits: 2 },
  { memories: 2, drift: 1, actions: 5, traits: 2 },
  { memories: 2, drift: 1, actions: 5, traits: 1 },
]);

function resolveTick(input: ContextInput): number {
  if (input.tick !== undefined) {
    return input.tick;
  }
  let newest = 0;
  for (const creature of input.creatures) {
    for (const entry of creature.memory.working) {
      newest = Math.max(newest, entry.atTick);
    }
  }
  return newest;
}

function identityLine(creature: AttendingCreature, traitCount: number): string {
  const traits = topTraits(creature.genome.traits, traitCount).map(([name]) => name);
  const traitText = traits.length > 0 ? traits.join(",") : "none";
  return `id ${creature.state.id} | gen ${creature.genome.generation} | ${traitText} | mood ${moodOf(creature.state)} | impression ${oneDecimal(impressionOf(creature.memory))}`;
}

function creatureBlock(seat: Seat, level: BudgetLevel): string {
  const { creature } = seat;
  const lines: string[] = [
    `CREATURE ${creature.state.id}`,
    identityLine(creature, level.traits),
  ];

  for (const entry of creature.memory.consolidated.slice(
    0,
    MAX_CONSOLIDATED_PER_CREATURE,
  )) {
    lines.push(consolidatedLine(entry));
  }

  for (const scored of seat.ranked.slice(0, level.memories)) {
    lines.push(memoryLine(scored.entry));
  }

  if (level.drift > 0) {
    const drift = creature.genome.drift.slice(-level.drift);
    if (drift.length > 0) {
      lines.push(`drift: ${drift.map((fragment) => `"${singleLine(fragment)}"`).join(" | ")}`);
    }
  }

  return lines.join("\n");
}

function assembleContext(
  input: ContextInput,
  tick: number,
  seats: readonly Seat[],
  level: BudgetLevel,
  dropped: readonly string[],
): string {
  const sections: string[] = [];

  sections.push(
    `SCENE TRIGGER\nstage ${input.stage} | tick ${tick} | trigger: ${singleLine(input.trigger)}`,
  );

  // Untrimmed by the degradation ladder: the swarm's belief is the scene's premise.
  sections.push(`SHARED BELIEF\n${input.sharedBelief.trim()}`);

  sections.push(`SHARED AMBIENT\n${input.ambient.trim()}`);

  for (const seat of seats) {
    sections.push(creatureBlock(seat, level));
  }

  const actions =
    level.actions > 0
      ? input.recentActions
          .slice(-level.actions)
          .map(singleLine)
          .filter((line) => line.length > 0)
      : [];
  if (actions.length > 0) {
    sections.push(`RECENT HUMAN ACTIONS\n${actions.join("\n")}`);
  }

  if (dropped.length > 0) {
    sections.push(`DROPPED\n${dropped.join(", ")}`);
  }

  sections.push(
    `BUDGET\n2..4 turns | cite only your own memoryRef | mood from: ${MOODS.join(",")}`,
  );

  return sections.join("\n\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function seatScore(seat: Seat): number {
  return seat.ranked[0]?.score ?? 0;
}

function lowestSeat(seats: readonly Seat[]): Seat {
  const sorted = [...seats].sort((a, b) => {
    const scoreDiff = seatScore(a) - seatScore(b);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.creature.state.id < b.creature.state.id
      ? 1
      : a.creature.state.id > b.creature.state.id
        ? -1
        : 0;
  });
  return sorted[0]!;
}

export function buildContext(input: ContextInput): {
  readonly text: string;
  readonly tokens: number;
} {
  const tick = resolveTick(input);
  const seats: readonly Seat[] = input.creatures.map((creature) => ({
    creature,
    ranked: rankMemories(creature.memory, input.trigger, tick),
  }));

  const dropped: string[] = [];
  let levelIndex = 0;
  let attending = seats;
  let text = assembleContext(input, tick, attending, DEGRADATION_LADDER[0]!, dropped);

  while (estimateTokens(text) > TOKEN_BUDGET) {
    if (levelIndex < DEGRADATION_LADDER.length - 1) {
      levelIndex += 1;
      text = assembleContext(
        input,
        tick,
        attending,
        DEGRADATION_LADDER[levelIndex]!,
        dropped,
      );
      continue;
    }

    // Final resort per CONTEXT.md section 8: drop the lowest-scoring attending
    // creature whole. A partial creature block is never sent.
    if (attending.length === 0) {
      break;
    }
    const lowest = lowestSeat(attending);
    dropped.push(lowest.creature.state.id);
    attending = attending.filter((seat) => seat !== lowest);
    text = assembleContext(
      input,
      tick,
      attending,
      DEGRADATION_LADDER[levelIndex]!,
      dropped,
    );
  }

  return { text, tokens: estimateTokens(text) };
}
