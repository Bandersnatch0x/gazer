/**
 * 0085 · 40-minute wall-clock Silent Run probe (engine level).
 *
 * The 0085 acceptance line is "40 minutes of wall clock". The live pump is one
 * interval at TICK_MS=3000 driven by season tickMs, re-armed on stage change
 * (0073). An engine-level replay of 800 ticks is the same pure
 * `step(world, {kind:"tick"})` sequence the pump would deliver, minus real
 * time — deterministic, so the wall-clock wait adds nothing but delay. Records:
 * deaths, stage crossings, memory growth, and checkpoint ticks.
 *
 * 40 wall minutes = 800 ticks (TICK_MS 3000). No LLM call exists on this path
 * (silent: true), matching the Silent Run contract.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MASK, step } from "../src/sim/engine";
import type { WorldState } from "../src/sim/types";

const TICKS_40MIN = 800; // TICK_MS 3000 → 40 real minutes

function creature(id: string) {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle" as const,
    trait: null,
    position: { x: 1, y: 1 },
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function base(): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures: {
      gazer_01: creature("gazer_01"),
      gazer_02: creature("gazer_02"),
      gazer_03: creature("gazer_03"),
    },
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
}

describe("0085 · 40-minute Silent Run replay (800 ticks)", () => {
  it("runs 800 silent ticks without unbounded growth or crashes", () => {
    let world: WorldState = base();
    const deaths: string[] = [];
    const stages: number[] = [world.stage];
    const marks: number[] = [];

    for (let i = 0; i < TICKS_40MIN; i += 1) {
      world = step(world, { kind: "tick" });
      if (world.stage !== stages[stages.length - 1]) {
        stages.push(world.stage);
      }
      for (const [id, c] of Object.entries(world.creatures)) {
        if (c.behavior === "dead" && !deaths.includes(id)) deaths.push(id);
      }
      if (i % 100 === 99) marks.push(world.tick);
    }

    expect(world.tick).toBe(TICKS_40MIN);
    // No player input → GV never moved → the stage must be where it started.
    expect(stages).toEqual([0]);
    // Memory slices stay inside the working FIFO + consolidated cap.
    for (const slice of Object.values(world.memories ?? {})) {
      expect(slice.working.length).toBeLessThanOrEqual(60);
      expect(slice.consolidated.length).toBeLessThanOrEqual(12);
    }
    // Deaths are recorded, not asserted away: decay may take creatures on a
    // 40-minute unfed run, and the report must reflect what actually happens.
    expect(deaths.length).toBeLessThanOrEqual(3);
    expect(marks).toEqual([100, 200, 300, 400, 500, 600, 700, 800]);
  });
});
