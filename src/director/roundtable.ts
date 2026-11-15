/**
 * Roundtable parsing and validation, from `docs/design/ARCHITECTURE.md` and
 * `docs/design/ONTOLOGY.md`.
 *
 * Model output is untrusted input. Parsing is hand-written and all-or-nothing:
 * one malformed turn rejects the whole script, and no input shape ever throws.
 * Validation then replaces ungrounded turns with a deterministic manual line.
 */

import type { CreatureId, Mood } from "../sim/types";
import type { MemorySlice } from "../sim/memory";
import { hasMemoryRef, memoryText } from "../sim/memory";
import type {
  RoundtableScript,
  RoundtableTurn,
  TurnIntent,
} from "../sim/roundtable";
import { MAX_TURNS, MIN_TURNS } from "../sim/roundtable";
import { contentWords } from "./context";

const INTENTS: readonly TurnIntent[] = [
  "observe",
  "deceive",
  "query",
  "confide",
  "accuse",
  "comfort",
];

const MOODS: readonly Mood[] = ["curious", "sad", "loving", "wrong", "hungry"];

/**
 * 0078: the single shared definition of a "successful roundtable body" for the
 * edge (middleware) that decides whether a call may spend quota. A merely
 * parseable object is not enough: it must carry a `scene` array of MIN..MAX
 * turns. Grounding (memoryRef / shared words) still runs client-side later.
 */
export function isValidSceneShape(scene: unknown): boolean {
  if (!isRecord(scene)) return false;
  const turns = scene["scene"];
  return Array.isArray(turns) && turns.length >= MIN_TURNS && turns.length <= MAX_TURNS;
}

/** Below this many shared content words, the line has left its cited memory. */
const MIN_SHARED_WORDS = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function parseTurn(value: unknown): RoundtableTurn | null {
  if (!isRecord(value)) {
    return null;
  }

  const speaker = value["speaker"];
  const text = value["text"];
  const intent = value["intent"];
  const mood = value["mood"];
  const memoryRef = value["memoryRef"];

  if (
    !isNonEmptyString(speaker) ||
    !isNonEmptyString(text) ||
    !isNonEmptyString(memoryRef) ||
    !isOneOf(intent, INTENTS) ||
    !isOneOf(mood, MOODS)
  ) {
    return null;
  }

  return {
    speaker: speaker.trim(),
    text: text.trim(),
    intent,
    mood,
    memoryRef: memoryRef.trim(),
  };
}

/**
 * All-or-nothing: a script is usable only when the root is an object with a
 * `scene` array of 2..4 fully valid turns. Any other shape returns null.
 */
export function parseRoundtable(raw: unknown): RoundtableScript | null {
  try {
    if (!isRecord(raw)) {
      return null;
    }

    const scene = raw["scene"];
    if (!Array.isArray(scene) || scene.length < MIN_TURNS || scene.length > MAX_TURNS) {
      return null;
    }

    const turns: RoundtableTurn[] = [];
    for (const item of scene) {
      const turn = parseTurn(item);
      if (turn === null) {
        return null;
      }
      turns.push(turn);
    }

    return { scene: turns };
  } catch {
    return null;
  }
}

/** FNV-1a over a short key; stable across runs and platforms. */
function hashKey(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function replacementText(
  turn: RoundtableTurn,
  pools: Readonly<Record<CreatureId, readonly string[]>>,
  turnIndex: number,
): string | null {
  const pool = pools[turn.speaker];
  if (pool === undefined || pool.length === 0) {
    return null;
  }
  const seed = hashKey(`${turn.speaker}|${turn.memoryRef}|${turn.intent}|${turnIndex}`);
  return pool[seed % pool.length] ?? null;
}

function sharesEnoughWithMemory(text: string, memory: string): boolean {
  const textWords = contentWords(text);
  const memoryWords = contentWords(memory);
  let shared = 0;
  for (const word of textWords) {
    if (memoryWords.has(word)) {
      shared += 1;
      if (shared >= MIN_SHARED_WORDS) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 0087: the context exposes a `SHARED BELIEF` block with no memory id, and the
 * model reasonably anchors a line to it as `memoryRef: "shared_belief"`. That
 * anchor is legitimate — it is grounded in text the prompt really showed — so it
 * is accepted when the line shares content words with that belief block.
 */
export const SHARED_BELIEF_REF = "shared_belief";

function isGrounded(
  turn: RoundtableTurn,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
  sharedBelief: string | undefined,
): boolean {
  if (turn.memoryRef === SHARED_BELIEF_REF) {
    return sharedBelief !== undefined && sharedBelief.trim().length > 0 &&
      sharesEnoughWithMemory(turn.text, sharedBelief);
  }
  const slice = slices[turn.speaker];
  if (slice === undefined || !hasMemoryRef(slice, turn.memoryRef)) {
    return false;
  }
  const memory = memoryText(slice, turn.memoryRef);
  if (memory === null) {
    return false;
  }
  return sharesEnoughWithMemory(turn.text, memory);
}

/**
 * Keep only turns that are grounded in the speaker's own memory. A turn that
 * fails grounding is replaced from the speaker's own pool when one exists.
 * When no trustworthy line exists (no pool, or a speaker the slices/pools do
 * not know at all), the WHOLE scene falls back to `null` so the caller uses the
 * manual pool. R4.3 forbids silently dropping a turn and keeping a shortened
 * 1–3 turn scene (0077); the model's speaker list itself is untrusted, so an
 * unknown id must never smuggle a fabricated line through.
 */
export function validateTurns(
  script: RoundtableScript,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
  pools: Readonly<Record<CreatureId, readonly string[]>>,
  sharedBelief?: string,
): RoundtableScript | null {
  const scene: RoundtableTurn[] = [];
  for (const [index, turn] of script.scene.entries()) {
    if (isGrounded(turn, slices, sharedBelief)) {
      scene.push(turn);
      continue;
    }
    const replacement = replacementText(turn, pools, index);
    if (replacement === null) {
      // 0077 / R4.3: a single unrepairable turn invalidates the scene whole,
      // rather than returning a shorter script with a silent gap.
      return null;
    }
    scene.push({ ...turn, text: replacement });
  }
  return scene.length === 0 ? null : { scene };
}
