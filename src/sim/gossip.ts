import type { DistortionKind, MemoryEntry } from "./memory";
import { createRng } from "./rng";
import type { Rng } from "./rng";
import type { CreatureState } from "./types";

export const WHISPER_RANGE = 2;
export const WHISPER_TICKS = 4;

/** Retention is 0.9 minus the receiver's distortion bias; a gullible ear keeps less. */
export const BASE_RETENTION = 0.9;

const INTENSIFIERS: readonly string[] = [
  "It was worse than that.",
  "It happened again, and it lasted longer.",
  "It was meant for you.",
];

const INVENTED_DETAILS: readonly string[] = [
  "There was a second shadow in the room.",
  "The door was already open.",
  "It was raining indoors.",
];

/** Weights from the architecture document; normalised at pick time. */
const DISTORTION_WEIGHTS: readonly (readonly [DistortionKind, number])[] = [
  ["intensify", 0.3],
  ["role_swap", 0.2],
  ["invent_detail", 0.1],
];

export interface WhisperInput {
  readonly sender: CreatureState;
  readonly receiver: CreatureState;
  readonly entry: MemoryEntry;
  readonly worldSeed: number;
}

function chebyshev(a: CreatureState, b: CreatureState): number {
  return Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y));
}

function chooseDistortion(rng: Rng): DistortionKind {
  const total = DISTORTION_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [kind, weight] of DISTORTION_WEIGHTS) {
    roll -= weight;
    if (roll < 0) {
      return kind;
    }
  }
  return "intensify";
}

/** Role swap: the player stops being the subject of the sentence. */
function stripPlayer(fact: string): string {
  return fact
    .replace(/\byour\b/gi, "its")
    .replace(/\byou\b/gi, "it")
    .replace(/\bthe player\b/gi, "something")
    .replace(/\bplayer\b/gi, "something");
}

function distort(entry: MemoryEntry, kind: DistortionKind, rng: Rng): string {
  switch (kind) {
    case "intensify":
      return `${entry.fact} ${rng.pick(INTENSIFIERS)}`;
    case "role_swap":
      return stripPlayer(entry.fact);
    case "invent_detail":
      return `${entry.fact} ${rng.pick(INVENTED_DETAILS)}`;
  }
}

/**
 * Resolve one whisper. Returns null when the creatures are too far apart,
 * otherwise the entry as the receiver stores it: `heard`, sourced to the
 * sender, distorted on a failed retention roll and indistinguishable from a
 * real memory to its holder.
 */
export function resolveWhisper(input: WhisperInput): MemoryEntry | null {
  const { sender, receiver, entry, worldSeed } = input;
  if (chebyshev(sender, receiver) > WHISPER_RANGE) {
    return null;
  }

  const bias = receiver.genome?.distortionBias ?? 0;
  const retention = Math.min(1, Math.max(0, BASE_RETENTION - bias));
  const roll = createRng(worldSeed, `${entry.id}:${receiver.id}`).next();

  if (roll < retention) {
    return { ...entry, witnessed: "heard", source: sender.id, distortion: null };
  }

  const rng = createRng(worldSeed, entry.id);
  const distortion = chooseDistortion(rng);
  return {
    ...entry,
    fact: distort(entry, distortion, rng),
    witnessed: "heard",
    source: sender.id,
    distortion,
  };
}
