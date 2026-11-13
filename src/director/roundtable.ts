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

function isGrounded(turn: RoundtableTurn, slices: Readonly<Record<CreatureId, MemorySlice>>): boolean {
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
 * fails grounding is replaced from the speaker's own pool when one exists, and
 * dropped otherwise — a speaker with no pool must never smuggle a fabricated
 * line through (the model's speaker list itself is untrusted). Returns null
 * when nothing survives, so the caller falls back to the manual pool.
 */
export function validateTurns(
  script: RoundtableScript,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
  pools: Readonly<Record<CreatureId, readonly string[]>>,
): RoundtableScript | null {
  const scene: RoundtableTurn[] = [];
  for (const [index, turn] of script.scene.entries()) {
    if (isGrounded(turn, slices)) {
      scene.push(turn);
      continue;
    }
    const replacement = replacementText(turn, pools, index);
    if (replacement !== null) {
      scene.push({ ...turn, text: replacement });
    }
  }
  return scene.length === 0 ? null : { scene };
}
