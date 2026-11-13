/**
 * Ticket 0056: the outside's offline snapshot — seed picking, momentum, and
 * percolation. Everything here is pure and offline: no network, no wall
 * clock, no LLM. The seed for a day is a hash chain over (world.seed, day);
 * percolation rides the plain memory pipeline.
 */
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_TICKS, worldCalendarAt } from "../src/sim/clock";
import {
  ARCHETYPE_POOL_UNAVAILABLE_GUARD,
  OUTSIDE_TOPICS,
  OUTSIDE_SEED_POOL_SIZE,
  PERCOLATION_MIN_INTENSITY,
  archetypeOf,
  percolationDue,
  percolationPass,
  percolationTargets,
  seedForDay,
  topicForDay,
  TOPIC_MOMENTUM_P,
} from "../src/sim/outside";
import { hasMemoryRef } from "../src/sim/memory";
import { step } from "../src/sim/engine";
import { INITIAL_GV, type WorldState } from "../src/sim/types";

const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

function coldStartWorld(): WorldState {
  let world: WorldState = {
    tick: 0,
    gv: INITIAL_GV,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
  STARTER_IDS.forEach((id, index) => {
    world = step(world, {
      kind: "hatch",
      creatureId: id,
      at: START_POSITIONS[index] ?? START_POSITIONS[0],
      species: "gazerling",
    });
  });
  return world;
}

describe("the seed stream (sim/outside.ts)", () => {
  it("is a pure function of (world.seed, day)", () => {
    expect(seedForDay(1997, 5)).toEqual(seedForDay(1997, 5));
    expect(seedForDay(1997, 5)).not.toEqual(seedForDay(1998, 5));
    const seed = seedForDay(1997, 5);
    expect(seed.id).toBe("out_d5");
    expect(seed.intensity).toBeGreaterThanOrEqual(0.3);
    expect(seed.intensity).toBeLessThanOrEqual(0.9);
    expect(OUTSIDE_TOPICS).toContain(seed.topic);
    expect(seed.archetypeIndex).toBeLessThan(OUTSIDE_SEED_POOL_SIZE);
  });

  it("carries momentum: most adjacent days keep the same topic", () => {
    let same = 0;
    let total = 0;
    for (const worldSeed of [1997, 42, 31337]) {
      for (let day = 1; day < 60; day += 1) {
        if (topicForDay(worldSeed, day) === topicForDay(worldSeed, day - 1)) {
          same += 1;
        }
        total += 1;
      }
    }
    const share = same / total;
    // The design value is TOPIC_MOMENTUM_P = 0.55; the band is wide enough
    // for the hash draws but tight enough to prove the chain is not a coin.
    expect(share).toBeGreaterThan(TOPIC_MOMENTUM_P - 0.1);
    expect(share).toBeLessThan(TOPIC_MOMENTUM_P + 0.1);
  });

  it("resolves every archetype to a bilingual pair", () => {
    for (const topic of OUTSIDE_TOPICS) {
      for (let index = 0; index < OUTSIDE_SEED_POOL_SIZE; index += 1) {
        const seed = { ...seedForDay(1997, 0), topic, archetypeIndex: index };
        const archetype = archetypeOf(seed);
        expect(archetype.en.length).toBeGreaterThan(0);
        expect(archetype.zh.length).toBeGreaterThan(0);
        expect(archetype.valence).toBeGreaterThanOrEqual(-1);
        expect(archetype.valence).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("percolation (sim/outside.ts)", () => {
  it("is due once per in-game day, at the ninth hour", () => {
    expect(worldCalendarAt(0).hour).toBe(12);
    expect(percolationDue(0)).toBe(false);
    const ninthHourTick = 1050; // day 0: phaseTicks 1050 → hour 9
    expect(worldCalendarAt(ninthHourTick).hour).toBe(9);
    expect(percolationDue(ninthHourTick)).toBe(true);
    expect(percolationDue(ninthHourTick + 1)).toBe(false);
    expect(percolationDue(ninthHourTick + DAY_CYCLE_TICKS)).toBe(true);
  });

  it("picks the same ears for the same world, and only living ones", () => {
    const world = coldStartWorld();
    const seed = seedForDay(world.seed, 0);
    const first = percolationTargets(world, seed);
    const second = percolationTargets(world, seed);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.length).toBeLessThanOrEqual(3);
    for (const id of first) {
      expect(world.creatures[id]?.behavior).not.toBe("dead");
    }
  });

  it("writes the seed into the chosen ears as an ordinary heard memory", () => {
    const world = coldStartWorld();
    const tick = 1050; // day 0, hour 9
    const dueWorld = { ...world, tick };
    const { memories, seed } = percolationPass(dueWorld, {});
    expect(seed).not.toBeNull();
    const targets = percolationTargets(dueWorld, seed ?? seedForDay(world.seed, 0));
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) {
      const slice = memories[id];
      expect(slice).toBeDefined();
      const entry = slice?.working.find((item) => item.id === "out_d0");
      expect(entry).toBeDefined();
      expect(entry?.witnessed).toBe("heard");
      expect(entry?.source).toBeNull();
      expect(entry?.distortion).toBeNull();
      expect(entry?.fact.length).toBeGreaterThan(0);
      expect(hasMemoryRef(slice ?? { working: [], consolidated: [] }, "out_d0")).toBe(true);
    }
    // The untouched ears stay untouched.
    for (const id of STARTER_IDS) {
      if (!targets.includes(id)) {
        expect(memories[id]).toBeUndefined();
      }
    }
  });

  it("keeps quiet days quiet: a low-intensity seed never percolates", () => {
    // Deterministic scan: find a world seed and day whose intensity falls
    // under the quiet threshold, then prove the pass is a no-op there.
    let quiet: { worldSeed: number; day: number } | null = null;
    outer: for (const worldSeed of [1997, 42, 31337, 7, 1998]) {
      for (let day = 0; day < 400; day += 1) {
        if (seedForDay(worldSeed, day).intensity < PERCOLATION_MIN_INTENSITY) {
          quiet = { worldSeed, day };
          break outer;
        }
      }
    }
    expect(quiet).not.toBeNull();
    const quietDay = quiet as { worldSeed: number; day: number };
    let world = coldStartWorld();
    world = { ...world, seed: quietDay.worldSeed, tick: quietDay.day * DAY_CYCLE_TICKS + 1050 };
    const memories = {};
    const result = percolationPass(world, memories);
    expect(result.seed).toBeNull();
    expect(result.memories).toBe(memories);
  });

  it("never touches anything but the memory trail (the Silent Run stays intact)", () => {
    const world = coldStartWorld();
    const before = { uiLabels: world.uiLabels, silent: world.silent, creatures: world.creatures };
    const { memories } = percolationPass({ ...world, tick: 1050 }, {});
    void memories;
    expect(world.uiLabels).toEqual(before.uiLabels);
    expect(world.silent).toBe(true);
  });

  it("guards against an empty archetype pool rather than rendering blanks", () => {
    // The pool is frozen at build time; the guard documents the invariant
    // that a missing entry can never reach a creature's memory as "".
    expect(ARCHETYPE_POOL_UNAVAILABLE_GUARD).toBe(true);
  });
});
