import type { CreatureId } from "./types";
import type { Rng } from "./rng";

export type EpistemicStatus = "witnessed" | "heard" | "inferred" | "fabricated";

export type DistortionKind = "intensify" | "role_swap" | "invent_detail";

export interface MemoryEntry {
  readonly id: string;
  readonly atTick: number;
  readonly wallClock: string;
  readonly fact: string;
  readonly witnessed: EpistemicStatus;
  readonly source: CreatureId | null;
  readonly distortion: DistortionKind | null;
  readonly salience: number;
  readonly valence: number;
}

export interface ConsolidatedEntry {
  readonly id: string;
  readonly content: string;
  readonly derivedFrom: readonly string[];
  readonly consolidatedAt: string;
  readonly perspectiveNote: string | null;
}

export const WORKING_CAPACITY = 60;
export const CONSOLIDATED_CAPACITY = 12;

export interface MemorySlice {
  readonly working: readonly MemoryEntry[];
  readonly consolidated: readonly ConsolidatedEntry[];
}

export function emptySlice(): MemorySlice {
  return { working: [], consolidated: [] };
}

/**
 * A reference is valid only if it resolves inside the creature's own slice.
 * Consolidated entries count: they are the creature's self-knowledge, not rumour.
 */
export function hasMemoryRef(slice: MemorySlice, id: string): boolean {
  return (
    slice.working.some((entry) => entry.id === id) ||
    slice.consolidated.some((entry) => entry.id === id)
  );
}

export function memoryText(slice: MemorySlice, id: string): string | null {
  const working = slice.working.find((entry) => entry.id === id);
  if (working !== undefined) {
    return working.fact;
  }
  const consolidated = slice.consolidated.find((entry) => entry.id === id);
  return consolidated?.content ?? null;
}

/** A demoted consolidated entry re-enters the episodic stream as inference. */
function toEpisodic(entry: ConsolidatedEntry): MemoryEntry {
  return {
    id: entry.id,
    atTick: 0,
    wallClock: entry.consolidatedAt,
    fact: entry.content,
    witnessed: "inferred",
    source: null,
    distortion: null,
    salience: 0.5,
    valence: 0,
  };
}

/**
 * 「出生即带着未亲见的记忆」: one memory drawn from a parent, seeded so the
 * same parents and world seed always hand down the same memory. The child
 * holds it as something heard from that parent — it never saw it itself.
 */
export function sampleInherited(parentId: CreatureId, slice: MemorySlice, rng: Rng): MemoryEntry | null {
  const candidates =
    slice.working.length > 0 ? slice.working : slice.consolidated.map(toEpisodic);
  if (candidates.length === 0) {
    return null;
  }
  const entry = rng.pick(candidates);
  return {
    ...entry,
    id: `inherited_${entry.id}`,
    witnessed: "heard",
    source: parentId,
    distortion: null,
  };
}

/** Pure append for the `remember` event, honouring working capacity. */
export function rememberEntry(slice: MemorySlice, entry: MemoryEntry): MemorySlice {
  return { ...slice, working: [...slice.working, entry].slice(-WORKING_CAPACITY) };
}
