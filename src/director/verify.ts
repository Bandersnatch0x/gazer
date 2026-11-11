/**
 * Level B verification, from `docs/design/HARNESS.md` section 5 and
 * `docs/design/ARCHITECTURE.md`.
 *
 * At most one extra call per scene, and only at a dramatic moment: a lie or an
 * accusation, at Stage 3 or above, with another creature present. The call is a
 * separate context holding only the speaker's own memories.
 */

import type { CreatureId, Stage } from "../sim/types";
import type { MemoryEntry, MemorySlice } from "../sim/memory";
import type { RoundtableTurn } from "../sim/roundtable";

export interface LevelBVerdict {
  readonly verdict: "yes" | "no";
  readonly replacement: string | null;
}

export const LEVEL_B_MIN_STAGE: Stage = 3;

const VERIFIABLE_INTENTS: ReadonlySet<string> = new Set(["deceive", "accuse"]);

/** A heard line is weaker than a witnessed one, but it is still memorable. */
const INFERRED_SALIENCE = 0.5;

/** Lies and accusations are negatively charged for the creature that heard them. */
const INFERRED_VALENCE = -0.5;

/**
 * True only for a lie or accusation, at Stage 3 or above, with a counterparty
 * present, and only while this scene has not spent its single verification.
 *
 * `RoundtableTurn` carries no target field, so "the accused is present" is read
 * as "another attending creature besides the speaker is present".
 */
export function shouldVerify(
  turn: RoundtableTurn,
  stage: Stage,
  present: readonly CreatureId[],
  alreadyVerified: number,
): boolean {
  if (alreadyVerified !== 0) {
    return false;
  }
  if (stage < LEVEL_B_MIN_STAGE) {
    return false;
  }
  if (!VERIFIABLE_INTENTS.has(turn.intent)) {
    return false;
  }
  return present.some((id) => id !== turn.speaker);
}

function nextMemoryId(slice: MemorySlice | undefined): string {
  let highest = 0;
  for (const entry of slice?.working ?? []) {
    const match = /^mem_(\d+)$/.exec(entry.id);
    if (match !== null) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  for (const entry of slice?.consolidated ?? []) {
    const match = /^mem_(\d+)$/.exec(entry.id);
    if (match !== null) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `mem_${highest + 1}`;
}

function newestWorking(slice: MemorySlice | undefined): MemoryEntry | null {
  let newest: MemoryEntry | null = null;
  for (const entry of slice?.working ?? []) {
    if (newest === null || entry.atTick > newest.atTick) {
      newest = entry;
    }
  }
  return newest;
}

/**
 * The original line survives as an inferred memory: the speaker remembers hearing
 * someone else say it. The entry is returned, not inserted; the caller owns the
 * slice and decides when to append.
 */
function inferredMemory(turn: RoundtableTurn, slice: MemorySlice | undefined): MemoryEntry {
  const newest = newestWorking(slice);
  const heard = turn.text.replace(/"/g, "'");

  return {
    id: nextMemoryId(slice),
    atTick: newest?.atTick ?? 0,
    wallClock: newest?.wallClock ?? "",
    fact: `heard another say "${heard}"`,
    witnessed: "inferred",
    source: null,
    distortion: null,
    salience: INFERRED_SALIENCE,
    valence: INFERRED_VALENCE,
  };
}

/**
 * `yes` keeps the turn and records nothing. `no` swaps in the verifier's
 * replacement line and returns the inferred memory. A `no` without a usable
 * replacement keeps the original turn, because a broken performance is worse
 * than a blemish.
 */
export function applyVerdict(
  turn: RoundtableTurn,
  verdict: LevelBVerdict,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
): { readonly turn: RoundtableTurn; readonly inferred: MemoryEntry | null } {
  if (verdict.verdict === "yes") {
    return { turn, inferred: null };
  }

  const replacement = verdict.replacement;
  if (replacement === null || replacement.trim().length === 0) {
    return { turn, inferred: null };
  }

  return {
    turn: { ...turn, text: replacement.trim() },
    inferred: inferredMemory(turn, slices[turn.speaker]),
  };
}
