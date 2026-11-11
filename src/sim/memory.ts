import type { CreatureId } from "./types";

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
