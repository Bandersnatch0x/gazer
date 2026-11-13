/**
 * L1 — Distortion engine: the LLM as the physical medium of memory decay.
 *
 * Every whisper hop calls the model once. On success the rewritten line is
 * validated and proposed under the exact gossip semantics: `heard`, sourced to
 * the sender. On any failure the reply falls back to `resolveWhisper`'s
 * built-in distorter — the manual word-swap pool — so a dead endpoint degrades
 * to shipping behaviour, never to no behaviour. The engine still owns the
 * retention roll: the model is invited only when the memory already failed to
 * survive intact.
 *
 * Async contract (GAME_REVIEW §11.3): the caller does not await this on the
 * tick path; the rewrite lands whenever it lands and the receiver's slice is
 * patched then. Same semantics either way — only the prose differs.
 */

import { resolveWhisper } from "../sim/gossip";
import type { MemoryEntry } from "../sim/memory";
import { createRng } from "../sim/rng";
import type { CreatureState } from "../sim/types";
import type { BridgeClient } from "./client";
import type { BudgetGuard } from "./budget";
import { cacheKey, type BridgeCache } from "./cache";
import { singleLine, truncate, wordCount } from "./validate";

export interface WhisperInput {
  readonly sender: CreatureState;
  readonly receiver: CreatureState;
  readonly entry: MemoryEntry;
  readonly worldSeed: number;
}

export interface WhisperRewriter {
  rewrite(input: WhisperInput): Promise<MemoryEntry | null>;
}

export interface WhisperRewriterDeps {
  readonly client: BridgeClient;
  readonly budget: BudgetGuard;
  readonly cache?: BridgeCache;
}

const MAX_CHARS = 90;
const MAX_WORDS = 18;

export const WHISPER_SYSTEM_RULES: string =
  "Rewrite one memory as a creature retells it to another creature. " +
  "Same event, one sentence, at most 18 words. You may sharpen it, shift who " +
  "it happened to, or add one detail that was not there. Never explain. " +
  "Never break a single line.";

export function buildWhisperPrompt(entry: MemoryEntry, senderId: string): string {
  return [
    WHISPER_SYSTEM_RULES,
    "",
    `Memory (as first witnessed): "${singleLine(entry.fact)}"`,
    `Retold by: creature ${senderId}`,
    "",
    "Return JSON: { \"text\": \"...\" }",
  ].join("\n");
}

/** Same retention roll as `resolveWhisper`: the engine decides survival first. */
function survivedWhisper(input: WhisperInput): MemoryEntry | null {
  return resolveWhisper(input);
}

function fallbackWhisper(input: WhisperInput): MemoryEntry {
  const survived = survivedWhisper(input);
  // The roll already passed the range + retention gates to get here, so the
  // only null case is out-of-range — which the caller must not reach.
  if (survived !== null) {
    return survived;
  }
  return {
    ...input.entry,
    fact: input.entry.fact,
    witnessed: "heard",
    source: input.sender.id,
    distortion: null,
  };
}

export function createWhisperRewriter(deps: WhisperRewriterDeps): WhisperRewriter {
  return {
    async rewrite(input: WhisperInput): Promise<MemoryEntry | null> {
      const survival = survivedWhisper(input);
      if (survival === null) {
        return null;
      }
      if (survival.witnessed === "heard" && survival.distortion === null) {
        // The memory survived intact; the model is never paid to say it again.
        return survival;
      }

      const prompt = buildWhisperPrompt(input.entry, input.sender.id);
      const key = cacheKey(
        0,
        "whisper",
        `${input.sender.id}:${input.receiver.id}:${input.entry.id}:${input.entry.fact}`,
      );
      const cached = deps.cache?.get(key) ?? null;

      let candidate: string | null = null;
      if (cached !== null) {
        candidate = cached;
      } else if (deps.budget.trySpend(Date.now())) {
        const result = await deps.client.ask({ kind: "whisper_rewrite", prompt });
        if (result.ok) {
          // Validate the raw line first, then trim: truncation must never be
          // what pulls a reply under the word limit.
          const line = singleLine(result.text);
          if (line.length > 0 && wordCount(line) <= MAX_WORDS) {
            candidate = truncate(line, MAX_CHARS);
            deps.cache?.set(key, candidate);
          }
        }
      }

      if (candidate === null) {
        return fallbackWhisper(input);
      }

      const rng = createRng(input.worldSeed, `bridge:${input.entry.id}`);
      return {
        ...input.entry,
        fact: candidate,
        witnessed: "heard",
        source: input.sender.id,
        distortion: null,
        valence: clampValence(rng, input.entry.valence),
      };
    },
  };
}

/** A retold memory keeps its charge within a bounded band; never amplifies. */
function clampValence(rng: ReturnType<typeof createRng>, original: number): number {
  const drift = (rng.next() - 0.5) * 0.2;
  const next = original + drift;
  return Math.round(Math.min(1, Math.max(-1, next)) * 100) / 100;
}
