/**
 * Ticket 0069 — doc-alignment CI lock.
 *
 * The four numeric drift fixes from `REVIEW_CROSSCHECK.md` T7 / ③ Top10 #6 are
 * pinned here against the authoritative design docs so a future tuning change
 * cannot silently re-introduce the drift:
 *
 *   - `docs/design/HARNESS.md` §5 (lines 97-103): per-route latency budgets.
 *   - `docs/design/CONTEXT.md` §4 (lines 53-69): candidate-memory score weights.
 *   - `docs/design/CONTEXT.md` §8 (lines 154-165): degradation order.
 *   - `docs/design/CONTEXT.md` §2/§8: 600-token budget.
 *
 * Values below are transcribed from those docs, not from the implementation.
 */

import { describe, expect, it } from "vitest";
import { DAY_CYCLE_TICKS } from "../src/sim/clock";
import { isAsyncTask, routeTask } from "../src/director/router";
import type { TaskKind } from "../src/director/router";
import {
  DEGRADATION_LADDER,
  INFERRED_SOURCE_PENALTY,
  TOKEN_BUDGET,
  WEIGHTS,
  buildContext,
  scoreMemory,
} from "../src/director/context";
import type { AttendingCreature, BudgetLevel, ContextInput } from "../src/director/context";
import type { MemoryEntry } from "../src/sim/memory";
import type { CreatureState } from "../src/sim/types";
import type { PromptGenome } from "../src/sim/genome";

/** HARNESS.md §5 latency budgets, keyed by TaskKind. `tts` is local (0). */
const HARNESS_LATENCY_MS: Readonly<Record<TaskKind, number>> = Object.freeze({
  roundtable: 4000, // HARNESS.md:99 "4000 ms" (ADR 0023, supersedes 0019)
  ontology_staging: 1200, // HARNESS.md:100 "1200 ms"
  consolidation: 2000, // HARNESS.md:101 "2000 ms, off the critical path"
  level_b: 600, // HARNESS.md:102 "600 ms"
  tts: 0, // HARNESS.md:103 "none; it is local"
});

/** CONTEXT.md §4 score formula, lines 54-60. `salience` coefficient is 1.0. */
const CONTEXT_WEIGHTS = Object.freeze({
  relevance: 2.0, // §4 "+ 2.0 * relevance"
  recency: 1.5, // §4 "+ 1.5 * recency"
  isCore: 1.0, // §4 "+ 1.0 * is_core"
  valenceExtreme: 0.8, // §4 "+ 0.8 * valence_extreme"
  sourcePenalty: 0.5, // §4 "- 0.5 * source_penalty"
});

/** CONTEXT.md §8 degradation order, lines 158-161. */
const CONTEXT_DEGRADATION_LADDER: readonly BudgetLevel[] = Object.freeze([
  { memories: 3, drift: 2, actions: 10, traits: 2 }, // §8 start: top three
  { memories: 2, drift: 2, actions: 10, traits: 2 }, // step 1: 3 -> 2
  { memories: 1, drift: 2, actions: 10, traits: 2 }, // step 1: 2 -> 1
  { memories: 1, drift: 1, actions: 10, traits: 2 }, // step 2: drift 2 -> 1
  { memories: 1, drift: 1, actions: 5, traits: 2 }, // step 3: actions 10 -> 5
  { memories: 1, drift: 1, actions: 5, traits: 1 }, // step 4: traits top-2 -> top-1
]);

describe("0069 · HARNESS §5 routing table", () => {
  it("matches every route's latency budget to the harness table", () => {
    for (const kind of Object.keys(HARNESS_LATENCY_MS) as TaskKind[]) {
      expect(routeTask(kind).timeoutMs, kind).toBe(HARNESS_LATENCY_MS[kind]);
    }
  });

  it("keeps exactly the five documented routes and their fallback chains", () => {
    const expected: Readonly<Record<TaskKind, readonly [string, string, string]>> = {
      roundtable: ["primary_hosted", "smaller_hosted", "manual_pool"],
      ontology_staging: ["primary_hosted_effect_schema", "smaller_hosted", "scripted_shift_table"],
      consolidation: ["primary_hosted", "smaller_hosted", "seeded_prng_drift"],
      level_b: ["primary_hosted_single_creature", "smaller_hosted", "keep_original_turn"],
      tts: ["browser_speech_synthesis", "text_bubbles", "text_bubbles"],
    };
    for (const kind of Object.keys(expected) as TaskKind[]) {
      const route = routeTask(kind);
      expect([route.primary, route.secondary, route.fallback], kind).toEqual(expected[kind]);
    }
  });

  it("marks only the two off-critical-path routes as async (HARNESS §5 note)", () => {
    for (const kind of Object.keys(HARNESS_LATENCY_MS) as TaskKind[]) {
      expect(isAsyncTask(kind), kind).toBe(
        kind === "ontology_staging" || kind === "consolidation",
      );
    }
  });
});

describe("0069 · CONTEXT §4 score weights", () => {
  it("matches the weight table term by term", () => {
    expect(WEIGHTS).toEqual(CONTEXT_WEIGHTS);
  });

  it("uses source_penalty = 1 for inferred, so the full deduction is 0.5", () => {
    // CONTEXT.md:69 "1 if witnessed === \"inferred\", else 0".
    expect(INFERRED_SOURCE_PENALTY).toBe(1);
    expect(WEIGHTS.sourcePenalty * INFERRED_SOURCE_PENALTY).toBeCloseTo(0.5, 10);
  });

  it("keeps a 1.0 salience coefficient (score = salience + ...)", () => {
    const base: MemoryEntry = {
      id: "mem_sal",
      atTick: 0,
      wallClock: "02:14",
      fact: "no matching trigger words here",
      witnessed: "witnessed",
      source: null,
      distortion: null,
      salience: 0.25,
      valence: 0,
    };
    const raised: MemoryEntry = { ...base, salience: 0.75 };
    // recency = 1, relevance = 0, isCore = 0, valenceExtreme = 0, sourcePenalty = 0.
    expect(scoreMemory(raised, "zzzz", 0) - scoreMemory(base, "zzzz", 0)).toBeCloseTo(0.5, 10);
  });

  it("applies the documented formula exactly for a fully-known entry", () => {
    const entry: MemoryEntry = {
      id: "mem_doc",
      atTick: 720,
      wallClock: "02:14",
      fact: "player stared at 02",
      witnessed: "witnessed",
      source: null,
      distortion: null,
      salience: 0.8,
      valence: -0.6,
    };
    const trigger = "player_stared 6200ms";
    const relevance = 2 / 3; // trigger content words: player, stared, 6200ms
    const recency = 0.5 ** ((1000 - 720) / DAY_CYCLE_TICKS); // HALF_LIFE = one in-game day (CONTEXT.md:66, 0084)
    const expected =
      0.8 +
      CONTEXT_WEIGHTS.relevance * relevance +
      CONTEXT_WEIGHTS.recency * recency +
      CONTEXT_WEIGHTS.isCore * 0 +
      CONTEXT_WEIGHTS.valenceExtreme * 0.6 -
      CONTEXT_WEIGHTS.sourcePenalty * 0;
    expect(scoreMemory(entry, trigger, 1000)).toBeCloseTo(expected, 10);
  });
});

describe("0069 · CONTEXT §8 degradation order", () => {
  it("matches the ladder term by term to the documented 3->2->1 / 2->1 / 10->5 / 2->1", () => {
    expect(DEGRADATION_LADDER).toEqual(CONTEXT_DEGRADATION_LADDER);
  });

  it("starts at three candidate memories (CONTEXT.md §4: top three go into the block)", () => {
    expect(DEGRADATION_LADDER[0]?.memories).toBe(3);
  });

  it("degrades monotonically, one dimension at a time, in §8 step order", () => {
    const keys: readonly (keyof BudgetLevel)[] = ["memories", "drift", "actions", "traits"];
    for (let i = 1; i < DEGRADATION_LADDER.length; i += 1) {
      const previous = DEGRADATION_LADDER[i - 1]!;
      const current = DEGRADATION_LADDER[i]!;
      const changed = keys.filter((key) => previous[key] !== current[key]);
      expect(changed.length, `ladder step ${i}`).toBe(1);
      expect(current[changed[0]!]!, `ladder step ${i}`).toBeLessThan(previous[changed[0]!]!);
      for (const key of keys) {
        expect(current[key], `ladder step ${i} / ${key}`).toBeLessThanOrEqual(previous[key]!);
      }
    }
  });

  it("keeps the 600-token budget from CONTEXT.md §2/§8", () => {
    expect(TOKEN_BUDGET).toBe(600);
  });
});

describe("0069 · assembled context honours the aligned ladder", () => {
  function creature(id: string, working: readonly MemoryEntry[]): AttendingCreature {
    const state: CreatureState = {
      id,
      species: "gazerling",
      stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
      behavior: "idle",
      trait: null,
      position: { x: 1, y: 1 },
      palette: ["#fff"],
      mask: ["x"],
      hatchedAtTick: 0,
      name: null,
      willingness: 40,
      courtshipTicks: 0,
    };
    const genome: PromptGenome = {
      id,
      generation: 2,
      lineage: [],
      base: "watcher",
      traits: { curiosity: 0.9, loyalty: 0.4, deceit: 0.2, clinging: 0.7, watchfulness: 0.8 },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias: 0,
    };
    return { state, genome, memory: { working, consolidated: [] } };
  }

  function input(working: readonly MemoryEntry[]): ContextInput {
    return {
      stage: 2,
      tick: 3180,
      trigger: "player_stared 6200ms",
      creatures: [creature("01", working)],
      recentActions: [],
      sharedBelief: "player: the one who watches",
      ambient: "silent no",
    };
  }

  function memory(id: string, witnessed: MemoryEntry["witnessed"]): MemoryEntry {
    return {
      id,
      atTick: 0,
      wallClock: "02:14",
      fact: "the tower moved at night",
      witnessed,
      source: null,
      distortion: null,
      salience: 0.8,
      valence: -0.9,
    };
  }

  it("renders at most three candidate memories before trimming", () => {
    const working = Array.from({ length: 6 }, (_, i) => memory(`mem_${i + 1}`, "witnessed"));
    const { text } = buildContext(input(working));
    expect(text.match(/^\[mem_/gm)?.length).toBe(3);
  });

  it("applies a 0.5 score gap between witnessed and inferred memories", () => {
    const witnessed = memory("mem_w", "witnessed");
    const inferred = memory("mem_i", "inferred");
    expect(scoreMemory(witnessed, "tower", 0) - scoreMemory(inferred, "tower", 0)).toBeCloseTo(
      0.5,
      10,
    );
  });
});
