/**
 * Ticket 0008 (W1 skeleton): the world clock. Pins the determinism contract —
 * time advances only through the engine's `tick` SimEvent, the in-world hour
 * is a pure function of the tick phase, the seed normalizes with a default
 * fallback, and the same seed replays to the same world tick by tick.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DAY_CYCLE_TICKS,
  DEFAULT_WORLD_SEED,
  GAME_DAY_SECONDS,
  isNightHour,
  normalizeWorldSeed,
  worldHour,
} from "../src/sim/clock";
import { DAY_CYCLE_TICKS as PALETTE_DAY_CYCLE_TICKS, skyAt } from "../src/render/palette";
import { TICK_MS, seasonForStage } from "../src/sim/rhythm";
import { gvDeltaFor } from "../src/sim/ledger";
import { step } from "../src/sim/engine";
import { INITIAL_GV, type WorldState } from "../src/sim/types";

const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

function starterWorld(seed: number): WorldState {
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

describe("world hour (sim/clock.ts)", () => {
  it("starts at noon where skyAt is brightest and hits midnight where skyAt is darkest", () => {
    expect(worldHour(0)).toBe(12);
    expect(worldHour(DAY_CYCLE_TICKS / 2)).toBe(0);
  });

  it("maps the phase onto 0..23 with dusk and dawn at the half-dark marks", () => {
    expect(worldHour(DAY_CYCLE_TICKS / 4)).toBe(18);
    expect(worldHour((DAY_CYCLE_TICKS * 3) / 4)).toBe(6);
    for (let tick = 0; tick < DAY_CYCLE_TICKS * 3; tick += 1) {
      const hour = worldHour(tick);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
      expect(Number.isInteger(hour)).toBe(true);
    }
  });

  it("is pure and periodic: the same tick phase always yields the same hour", () => {
    expect(worldHour(10)).toBe(worldHour(DAY_CYCLE_TICKS + 10));
    expect(worldHour(10)).toBe(worldHour(DAY_CYCLE_TICKS * 7 + 10));
    expect(worldHour(Number.NaN)).toBe(worldHour(0));
    expect(worldHour(-5)).toBe(worldHour(0));
  });

  it("shares one day-cycle constant with the render palette", () => {
    expect(PALETTE_DAY_CYCLE_TICKS).toBe(DAY_CYCLE_TICKS);
  });

  it("one in-game day is one wall-clock hour at the wiring's tick tempo", () => {
    expect(GAME_DAY_SECONDS).toBe((DAY_CYCLE_TICKS * TICK_MS) / 1000);
    expect(GAME_DAY_SECONDS).toBe(3600);
  });

  it("keeps the ledger's night window in one definition", () => {
    expect(isNightHour(0)).toBe(true);
    expect(isNightHour(4)).toBe(true);
    expect(isNightHour(5)).toBe(false);
    expect(isNightHour(12)).toBe(false);
    // The ledger keeps its night multiplier exactly as before (R3.3), now
    // fed by the derived world hour instead of `new Date().getHours()`.
    expect(gvDeltaFor({ kind: "feed", creatureId: "g", hesitationMs: 0 }, worldHour(600), 0)).toBe(
      gvDeltaFor({ kind: "feed", creatureId: "g", hesitationMs: 0 }, 0, 0),
    );
  });
});

describe("seasonal alignment (sim clock ↔ render palette)", () => {
  it("derives the same season table the render side reads", () => {
    // The W1 clock pins the shared macro-clock: stage → season stays in
    // lockstep between sim/rhythm.ts and render/palette.ts.
    expect(seasonForStage(0)).toBe("spring");
    expect(seasonForStage(4)).toBe("bleak");
  });

  it("world hour and sky phase never disagree about night", () => {
    // skyAt mixes toward the night colour by `night = 0.5 - 0.5cos(2πphase)`;
    // the derived hour must read midnight exactly at the darkest phase and
    // noon exactly at the brightest, for every tick of a full cycle.
    for (let tick = 0; tick < DAY_CYCLE_TICKS; tick += 1) {
      const phase = (tick % DAY_CYCLE_TICKS) / DAY_CYCLE_TICKS;
      const hour = worldHour(tick);
      const nightness = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
      if (hour === 0) {
        expect(nightness).toBeGreaterThan(0.9);
      }
      if (hour === 12) {
        expect(nightness).toBeLessThan(0.1);
      }
    }
    // And the sky colour is a pure function of the tick too.
    expect(skyAt(0, 0)).toBe(skyAt(DAY_CYCLE_TICKS, 0));
  });
});

describe("world seed (ticket 0008)", () => {
  it("falls back to the default when missing or malformed", () => {
    expect(normalizeWorldSeed(undefined)).toBe(DEFAULT_WORLD_SEED);
    expect(normalizeWorldSeed(null)).toBe(DEFAULT_WORLD_SEED);
    expect(normalizeWorldSeed("")).toBe(DEFAULT_WORLD_SEED);
    expect(normalizeWorldSeed("not-a-number")).toBe(DEFAULT_WORLD_SEED);
    expect(normalizeWorldSeed(Number.NaN)).toBe(DEFAULT_WORLD_SEED);
    expect(DEFAULT_WORLD_SEED).toBe(1997);
  });

  it("normalizes every usable input to a deterministic unsigned integer", () => {
    expect(normalizeWorldSeed(42)).toBe(42);
    expect(normalizeWorldSeed("12345")).toBe(12345);
    expect(normalizeWorldSeed(-7)).toBe(7);
    expect(normalizeWorldSeed(3.9)).toBe(3);
    expect(normalizeWorldSeed(-0.5)).toBe(0);
  });

  it("same seed replays the same world, tick by tick", () => {
    let runA = starterWorld(DEFAULT_WORLD_SEED);
    let runB = starterWorld(DEFAULT_WORLD_SEED);
    for (let i = 0; i < 120; i += 1) {
      runA = step(runA, { kind: "tick" });
      runB = step(runB, { kind: "tick" });
      expect(runA).toEqual(runB);
    }
  });

  it("same seed, different entry point, still the same world (phase independence)", () => {
    const a = step(starterWorld(7), { kind: "tick" });
    const b = step(starterWorld(7), { kind: "tick" });
    expect(b).toEqual(a);
  });

  it("different seeds diverge — the seed is load-bearing, not decorative", () => {
    let a = starterWorld(1997);
    let b = starterWorld(42);
    for (let i = 0; i < 60; i += 1) {
      a = step(a, { kind: "tick" });
      b = step(b, { kind: "tick" });
    }
    expect(JSON.stringify(a.creatures)).not.toBe(JSON.stringify(b.creatures));
  });
});

describe("no wall clock in the deterministic path", () => {
  it("the sim layer never reads the clock", () => {
    for (const name of ["clock", "engine", "ledger", "rhythm", "rng", "types", "breed", "gossip", "memory", "consolidate", "social", "shell"]) {
      const source = readFileSync(`src/sim/${name}.ts`, "utf8");
      expect(source, `src/sim/${name}.ts`).not.toMatch(/new Date\(|Date\.now\(|getHours\(/);
    }
  });

  it("game.ts no longer feeds the wall clock into the ledger", () => {
    const source = readFileSync("src/game.ts", "utf8");
    // The derived world hour replaced `new Date().getHours()` at every
    // gvDeltaFor call site (ticket 0008). UI-timer Date.now() use stays —
    // it never enters world state.
    expect(source).not.toContain("getHours");
    expect(source).toContain("worldHour(world.tick)");
  });
});
