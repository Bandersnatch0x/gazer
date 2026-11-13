/**
 * L6 — Dreaming: the model hallucinates off-screen; the engine writes the
 * result. A creature's dream is a short garbled line stamped as `inferred`
 * memory with salience 0.2 — weak, but real in the slice, so consolidation
 * and reflection may pick it up later and the creature "remembers" a dream it
 * was never shown having.
 *
 * The dream call is the lowest-priority bridge spend: it runs only when the
 * budget has free slots, and its failure costs nothing (no dream that night).
 */

import type { MemoryEntry } from "../sim/memory";
import { createRng } from "../sim/rng";
import { garble, singleLine, truncate, wordCount } from "./validate";
import type { BridgeClient } from "./client";
import type { BudgetGuard } from "./budget";

export interface DreamerDeps {
  readonly client: BridgeClient;
  readonly budget: BudgetGuard;
}

export interface DreamInput {
  readonly creatureId: string;
  readonly stage: number;
  readonly worldSeed: number;
}

export interface Dreamer {
  dream(input: DreamInput): Promise<MemoryEntry | null>;
}

const MAX_CHARS = 80;
const MAX_WORDS = 14;
const DREAM_SALIENCE = 0.2;

export const DREAM_SYSTEM_RULES: string =
  "Write one sentence a creature dreams while its keeper is away: the room, " +
  "the glass, the hand, the tower, or nothing at all. Lowercase, at most 14 " +
  "words, no questions, no explanations.";

export function buildDreamPrompt(creatureId: string, stage: number): string {
  return [
    DREAM_SYSTEM_RULES,
    "",
    `Creature ${creatureId}, expression stage ${stage}.`,
    "",
    "Return JSON: { \"text\": \"...\" }",
  ].join("\n");
}

export function createDreamer(deps: DreamerDeps): Dreamer {
  return {
    async dream(input: DreamInput): Promise<MemoryEntry | null> {
      if (!deps.budget.trySpend(Date.now())) {
        return null;
      }

      const result = await deps.client.ask({
        kind: "reflect",
        prompt: buildDreamPrompt(input.creatureId, input.stage),
      });
      if (!result.ok) {
        return null;
      }

      const line = singleLine(result.text);
      if (line.length === 0 || line.length > MAX_CHARS || wordCount(line) > MAX_WORDS) {
        return null;
      }

      const rng = createRng(input.worldSeed, `dream:${input.creatureId}`);
      const stampedTick = Math.floor(rng.next() * 1_000_000);

      return {
        id: `dream_${stampedTick}_${input.creatureId}`,
        atTick: stampedTick,
        wallClock: new Date().toISOString(),
        fact: garble(truncate(line, MAX_CHARS), input.worldSeed),
        witnessed: "inferred",
        source: null,
        distortion: null,
        salience: DREAM_SALIENCE,
        valence: Math.round((rng.next() * 2 - 1) * 100) / 100,
      };
    },
  };
}
