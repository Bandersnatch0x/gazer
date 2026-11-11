import type {
  ConsolidatedEntry,
  MemoryEntry,
  MemorySlice,
} from "./memory";
import { CONSOLIDATED_CAPACITY } from "./memory";

/** A demoted permanent memory returns as ordinary episodic memory. */
export const LOW_SALIENCE = 0.15;

const TOP_N = 2;
const TICK_PREFIX = "tick_";

function stamp(atTick: number): string {
  return `${TICK_PREFIX}${atTick}`;
}

function tickOf(consolidatedAt: string): number {
  if (!consolidatedAt.startsWith(TICK_PREFIX)) {
    return 0;
  }
  const parsed = Number(consolidatedAt.slice(TICK_PREFIX.length));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextNumber(slice: MemorySlice): number {
  let max = 0;
  for (const entry of slice.consolidated) {
    const digits = /^cons_(\d+)$/.exec(entry.id)?.[1];
    if (digits !== undefined) {
      max = Math.max(max, Number(digits));
    }
  }
  return max;
}

function rankScore(entry: MemoryEntry): number {
  return entry.salience * (1 + Math.abs(entry.valence));
}

/**
 * Deterministic stand-in for the model's consolidation pass: the two working
 * memories that pull hardest become self-knowledge. No model, no perspective.
 */
export function fallbackConsolidate(
  slice: MemorySlice,
  atTick: number,
): readonly ConsolidatedEntry[] {
  const ranked = slice.working
    .map((entry, index) => ({ entry, index, score: rankScore(entry) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, TOP_N);

  const start = nextNumber(slice);
  return ranked.map(({ entry }, offset) => ({
    id: `cons_${String(start + offset + 1).padStart(3, "0")}`,
    content: entry.fact,
    derivedFrom: [entry.id],
    consolidatedAt: stamp(atTick),
    perspectiveNote: null,
  }));
}

function demote(entry: ConsolidatedEntry): MemoryEntry {
  return {
    id: `${entry.id}_demoted`,
    atTick: tickOf(entry.consolidatedAt),
    wallClock: entry.consolidatedAt,
    fact: entry.content,
    witnessed: "inferred",
    source: null,
    distortion: null,
    salience: LOW_SALIENCE,
    valence: 0,
  };
}

/**
 * Append, honour explicit retirements, then enforce capacity. Nothing is ever
 * deleted: a retired or overflowing entry moves back into the working tail as a
 * low-salience memory, and the caller sees exactly where it went.
 */
export function applyConsolidation(
  slice: MemorySlice,
  added: readonly ConsolidatedEntry[],
  retire: readonly string[],
): MemorySlice {
  const retiring = new Set(retire);
  const kept: ConsolidatedEntry[] = [];
  const demoted: MemoryEntry[] = [];

  for (const entry of [...slice.consolidated, ...added]) {
    if (retiring.has(entry.id)) {
      demoted.push(demote(entry));
    } else {
      kept.push(entry);
    }
  }

  while (kept.length > CONSOLIDATED_CAPACITY) {
    const oldest = kept.shift();
    if (oldest === undefined) {
      break;
    }
    demoted.push(demote(oldest));
  }

  return {
    working: demoted.length === 0 ? slice.working : [...slice.working, ...demoted],
    consolidated: kept,
  };
}
