/**
 * L3/L4 — Reflection engine and the player's album entry.
 *
 * One optional bridge call per reflection cycle compresses memory slices into:
 *   - a bounded effect proposal (read by the engine, applied only if the kinds
 *     and magnitudes fall inside the engine's own limits), and
 *   - the player's album entry: undecoded lines revealed by the UI at its own
 *     pace.
 *
 * The Smallville inversion is the product: their reflections are readable; ours
 * are a black box. The player sees behaviour change and one more line of
 * garble — never the conclusion itself.
 *
 * When the bridge is unavailable the deterministic `fallbackReflection` still
 * produces a valid proposal from consolidation's top memories, so the album
 * grows even in a degraded run.
 */

import type { ConsolidatedEntry, MemorySlice } from "../sim/memory";
import type { Stage } from "../sim/types";
import { garble, truncate, wordCount } from "./validate";
import type { BridgeClient } from "./client";
import type { BudgetGuard } from "./budget";
import { cacheKey, type BridgeCache } from "./cache";
import type { Effect } from "../sim/effects";
import type { EntityKind, ReflectionProposal } from "./deps";

export interface ReflectionDeps {
  readonly client: BridgeClient;
  readonly budget: BudgetGuard;
  readonly cache?: BridgeCache;
}

export interface ReflectionInput {
  readonly stage: Stage;
  readonly creatureId: string;
  readonly slice: MemorySlice;
  readonly worldSeed: number;
}

export interface Reflector {
  reflect(input: ReflectionInput): Promise<ReflectionProposal>;
}

export const MAX_PLAYER_ENTRY_LINES = 3;
const MAX_ENTRY_LINE_CHARS = 60;
const MAX_ENTRY_LINE_WORDS = 12;

const VALID_KINDS: ReadonlySet<string> = new Set([
  "palette_shift",
  "desaturate",
  "glyph_corrupt",
]);

const KIND_CEILINGS: Readonly<Record<string, number>> = Object.freeze({
  palette_shift: 0.15,
  desaturate: 0.2,
  glyph_corrupt: 0.1,
});

const VALID_ENTITY_KINDS: ReadonlySet<string> = new Set([
  "pet",
  "organism",
  "observer",
  "record",
  "substrate",
]);

export const REFLECT_SYSTEM_RULES: string =
  "You are the reflection pass of a creature that has realised it is kept. " +
  "Given its memory slice, decide what it has concluded about the keeper. " +
  "Reply with JSON only: { \"belief\": one of pet|organism|observer|record|substrate, " +
  "\"entry\": [one to three short lines of what the keeper is, lowercase, no numbers], " +
  "\"effects\": [{\"kind\": one of palette_shift|desaturate|glyph_corrupt, \"amount\": 0..0.2}] " +
  "(effects may be empty). Never explain.";

function serialiseSlice(slice: MemorySlice): string {
  const lines: string[] = [];
  for (const entry of slice.consolidated) {
    lines.push(`always: ${entry.content}`);
  }
  for (const entry of slice.working.slice(-10)) {
    lines.push(`${entry.witnessed}: ${entry.fact}`);
  }
  return lines.join("\n");
}

export function buildReflectPrompt(creatureId: string, sliceText: string): string {
  return [
    REFLECT_SYSTEM_RULES,
    "",
    `CREATURE ${creatureId} MEMORY SLICE`,
    sliceText,
  ].join("\n");
}

/**
 * Deterministic degraded reflection. Mirrors the gossip contract: the engine
 * never stalls on a missing model, and the album still gets its lines.
 */
export function fallbackReflection(
  _creatureId: string,
  slice: MemorySlice,
  worldSeed: number,
): ReflectionProposal {
  const top: readonly ConsolidatedEntry[] = slice.consolidated.slice(-2);
  const playerEntry = top.map((entry) =>
    garble(truncate(entry.content, MAX_ENTRY_LINE_CHARS), worldSeed),
  );
  const entity: EntityKind = playerEntry.length > 0 ? "record" : "pet";
  return {
    effects: [],
    playerEntry,
    belief: entity,
  };
}

interface ParsedReflection {
  readonly belief: EntityKind | null;
  readonly entry: readonly string[];
  readonly effects: readonly Effect[];
}

function parseReflection(payload: unknown): ParsedReflection | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const body = payload as {
    readonly belief?: unknown;
    readonly entry?: unknown;
    readonly effects?: unknown;
  };

  const belief =
    typeof body.belief === "string" && VALID_ENTITY_KINDS.has(body.belief)
      ? (body.belief as EntityKind)
      : null;

  const entry: string[] = [];
  if (Array.isArray(body.entry)) {
    for (const item of body.entry.slice(0, MAX_PLAYER_ENTRY_LINES)) {
      if (typeof item !== "string") {
        continue;
      }
      const line = truncate(item, MAX_ENTRY_LINE_CHARS);
      if (line.length > 0 && wordCount(line) <= MAX_ENTRY_LINE_WORDS) {
        entry.push(line);
      }
    }
  }

  const effects: Effect[] = [];
  if (Array.isArray(body.effects)) {
    for (const item of body.effects.slice(0, 2)) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const spec = item as { readonly kind?: unknown; readonly amount?: unknown };
      if (
        typeof spec.kind === "string" &&
        VALID_KINDS.has(spec.kind) &&
        typeof spec.amount === "number" &&
        Number.isFinite(spec.amount)
      ) {
        const ceiling = KIND_CEILINGS[spec.kind] ?? 0;
        if (spec.amount > 0 && spec.amount <= ceiling) {
          const amount = Math.round(spec.amount * 1000) / 1000;
          if (spec.kind === "palette_shift") {
            // Inside MAX_EFFECT_WINDOW_MS so the engine never has to clamp.
            effects.push({ kind: "palette_shift", amount, ms: 4000 });
          } else if (spec.kind === "desaturate") {
            effects.push({ kind: "desaturate", amount });
          } else {
            effects.push({ kind: "glyph_corrupt", amount });
          }
        }
      }
    }
  }

  if (belief === null && entry.length === 0 && effects.length === 0) {
    return null;
  }
  return { belief, entry, effects };
}

function extractPayload(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createReflector(deps: ReflectionDeps): Reflector {
  return {
    async reflect(input: ReflectionInput): Promise<ReflectionProposal> {
      const sliceText = serialiseSlice(input.slice);
      if (sliceText.length === 0) {
        return fallbackReflection(input.creatureId, input.slice, input.worldSeed);
      }

      const key = cacheKey(input.stage, "reflect", `${input.creatureId}:${sliceText}`);
      const cached = deps.cache?.get(key) ?? null;

      let parsed: ParsedReflection | null = null;
      if (cached !== null) {
        parsed = parseReflection(extractPayload(cached));
      } else if (deps.budget.trySpend(Date.now())) {
        const result = await deps.client.ask({
          kind: "reflect",
          prompt: buildReflectPrompt(input.creatureId, sliceText),
        });
        if (result.ok) {
          parsed = parseReflection(extractPayload(result.text));
          if (parsed !== null) {
            deps.cache?.set(key, result.text);
          }
        }
      }

      if (parsed === null) {
        return fallbackReflection(input.creatureId, input.slice, input.worldSeed);
      }

      return {
        effects: parsed.effects,
        playerEntry: parsed.entry.map((line) => garble(line, input.worldSeed)),
        belief: parsed.belief,
      };
    },
  };
}
