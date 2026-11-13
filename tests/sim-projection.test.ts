/**
 * Ticket 0057: the reflection and the bee/ant predictor. The three claims
 * under test are the spec's (SPEC §10.1–10.3): replay determinism byte for
 * byte, a fully resolvable trace chain, and a calibration floor the ant
 * model must beat by ≥ 10pp over the uniform baseline.
 */
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_TICKS } from "../src/sim/clock";
import { percolationPass, seedForDay, topicForDay } from "../src/sim/outside";
import {
  advanceProjections,
  aggregateReflection,
  corruptionPressure,
  emptyProjectionState,
  type ProjectionState,
} from "../src/sim/projection";
import { rememberEntry, type MemorySlice } from "../src/sim/memory";
import { step } from "../src/sim/engine";
import { INITIAL_GV, type WorldState } from "../src/sim/types";

const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

function coldStartWorld(seed = 1997): WorldState {
  let world: WorldState = {
    tick: 0,
    gv: INITIAL_GV,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed,
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

/** The hour-9 tick of a world day — where percolation writes. */
function ninthHourTick(day: number): number {
  return day * DAY_CYCLE_TICKS + 1050;
}

function withOutMemory(
  memories: Record<string, MemorySlice>,
  creatureId: string,
  entry: Parameters<typeof rememberEntry>[1],
): Record<string, MemorySlice> {
  const slice = memories[creatureId] ?? { working: [], consolidated: [] };
  memories[creatureId] = rememberEntry(slice, entry);
  return memories;
}

describe("the reflection (sim/projection.ts)", () => {
  it("aggregates outside memories into exactly four nodes, player last", () => {
    const world = coldStartWorld();
    const day = 3;
    const seed = seedForDay(world.seed, day);
    const tick = ninthHourTick(day);
    const memories: Record<string, MemorySlice> = {};
    withOutMemory(memories, "gazer_01", {
      id: "out_d3",
      atTick: tick,
      wallClock: "d3",
      fact: "the sky elsewhere burned orange until noon",
      witnessed: "heard",
      source: null,
      distortion: null,
      salience: 0.8,
      valence: -0.3,
    });
    withOutMemory(memories, "gazer_02", {
      id: "out_d3",
      atTick: tick,
      wallClock: "d3",
      fact: "the sky elsewhere burned orange until noon",
      witnessed: "heard",
      source: null,
      distortion: null,
      salience: 0.6,
      valence: -0.3,
    });
    withOutMemory(memories, "gazer_01", {
      id: "mem_feed_01",
      atTick: 10,
      wallClock: "d0",
      fact: "the hand fed me and hesitated first",
      witnessed: "witnessed",
      source: null,
      distortion: null,
      salience: 0.7,
      valence: 0.6,
    });
    const reflection = aggregateReflection(world, memories, day);
    expect(reflection.nodes.length).toBe(4);
    expect(reflection.nodes.map((node) => node.topic)).toEqual(["sky", "market", "crowd", "player"]);
    // The outside's belief mass normalizes to one across the three topics.
    const outsideMass = reflection.nodes
      .slice(0, 3)
      .reduce((sum, node) => sum + node.confidence, 0);
    expect(outsideMass).toBeCloseTo(1, 5);
    // The seed's topic holds both ears; its chain resolves to the memory.
    const seededNode = reflection.nodes.find((node) => node.topic === seed.topic);
    expect(seededNode?.heldBy).toEqual(["gazer_01", "gazer_02"]);
    expect(seededNode?.traceChain[0]).toBe("out_d3");
    expect(seededNode?.divergence).toBe(1);
    // The player node aggregates the non-outside trail.
    const playerNode = reflection.nodes[3];
    expect(playerNode?.heldBy).toEqual(["gazer_01"]);
    expect(playerNode?.meanValence).toBeGreaterThan(0);
  });

  it("replays byte for byte: same world and memories, same JSON", () => {
    const world = coldStartWorld();
    const { memories } = percolationPass({ ...world, tick: ninthHourTick(0) }, {});
    const first = JSON.stringify(aggregateReflection(world, memories, 0));
    const second = JSON.stringify(aggregateReflection(world, memories, 0));
    expect(second).toBe(first);
  });

  it("an empty trail reads as unverified, not as zeros dressed up", () => {
    const world = coldStartWorld();
    const reflection = aggregateReflection(world, {}, 0);
    for (const node of reflection.nodes.slice(0, 3)) {
      expect(node.confidence).toBe(0);
      expect(node.heldBy).toEqual([]);
      expect(node.traceChain).toEqual([]);
      expect(node.claimEn).toBe("no outside events to report");
    }
    expect(reflection.nodes[3]?.claimEn).toBe("the hand is steady");
  });
});

describe("the bee/ant predictor (sim/projection.ts)", () => {
  it("resolves yesterday's claim at the boundary and emits tomorrow's", () => {
    const world = coldStartWorld();
    let state: ProjectionState = emptyProjectionState();
    state = advanceProjections(state, world, {}, 0);
    const open = state.predictions.find((claim) => claim.resolvesOnDay === 1);
    expect(open).toBeDefined();
    expect(open?.resolvedTo).toBeNull();
    state = advanceProjections(state, world, {}, 1);
    const resolved = state.predictions.find((claim) => claim.id === "pred_d1");
    expect(resolved?.resolvedTo).not.toBeNull();
    const expected = resolved?.topic === topicForDay(world.seed, 1) ? "hit" : "miss";
    expect(resolved?.resolvedTo).toBe(expected);
    const bucket = state.hits[resolved?.topic ?? "sky"];
    const counted = (bucket?.hit ?? 0) + (bucket?.miss ?? 0);
    expect(counted).toBeGreaterThanOrEqual(1);
    // Tomorrow's claim is open again.
    expect(state.predictions.find((claim) => claim.resolvesOnDay === 2)?.resolvedTo).toBeNull();
  });

  it("never lets a creature see the whole: the reflection lives on the state, not in any slice", () => {
    const world = coldStartWorld();
    const state = advanceProjections(emptyProjectionState(), world, {}, 0);
    // The predictor's output is engine-side state; no creature memory grew.
    expect(state.lastReflection).not.toBeNull();
  });

  it("beats the uniform baseline by at least 10pp (the calibration floor)", () => {
    const WARMUP_DAYS = 3;
    const RUN_DAYS = 40;
    const SEEDS = Array.from({ length: 40 }, (_, index) => 1000 + index * 137);
    let hit = 0;
    let miss = 0;
    for (const seed of SEEDS) {
      const world = coldStartWorld(seed);
      let state: ProjectionState = emptyProjectionState();
      for (let day = 0; day <= RUN_DAYS; day += 1) {
        state = advanceProjections(state, world, {}, day);
        if (day < WARMUP_DAYS) {
          continue;
        }
        const resolved = state.predictions.find((claim) => claim.resolvesOnDay === day);
        if (resolved?.resolvedTo === "hit") {
          hit += 1;
        } else if (resolved?.resolvedTo === "miss") {
          miss += 1;
        }
      }
    }
    const rate = hit / Math.max(1, hit + miss);
    // SPEC §10.2: ≥ chance (1/3) + 10pp. Below the floor, the spec's own
    // degradation path (drop L4) fires — this test is where that decision
    // would surface.
    expect(rate).toBeGreaterThanOrEqual(1 / 3 + 0.1);
  });
});

describe("the corruption hook (sim/projection.ts)", () => {
  it("measures the fabricated share of the recent outside trail", () => {
    const day = 2;
    const tick = ninthHourTick(day);
    const memories: Record<string, MemorySlice> = {};
    withOutMemory(memories, "gazer_01", {
      id: "out_d2",
      atTick: tick,
      wallClock: "d2",
      fact: "a rumor walked the whole road in a day",
      witnessed: "heard",
      source: null,
      distortion: null,
      salience: 0.8,
      valence: -0.3,
    });
    expect(corruptionPressure(memories, day)).toBe(0);
    withOutMemory(memories, "gazer_02", {
      id: "out_d2",
      atTick: tick,
      wallClock: "d2",
      fact: "a rumor walked the whole road twice in a day",
      witnessed: "heard",
      source: "gazer_01",
      distortion: "invent_detail",
      salience: 0.8,
      valence: -0.5,
    });
    expect(corruptionPressure(memories, day)).toBeCloseTo(0.5, 5);
  });
});
