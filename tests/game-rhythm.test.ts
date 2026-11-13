/**
 * Stream B, ticket 0002: the tempo table, the GV stage taper, the seasonal
 * parameter presets, and the interaction contracts. The pacing test is a
 * deterministic model of "normal play" — fixed input pattern, no randomness —
 * so the 30-60 minute playthrough claim stays pinned, not vibes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUNGER_PER_TICK, step } from "../src/sim/engine";
import { courtshipStep } from "../src/sim/engine";
import { gvDeltaFor } from "../src/sim/ledger";
import {
  GV_STAGE_DECAY,
  RHYTHM,
  SEASON_PARAMS,
  TICK_MS,
  seasonForStage,
  seasonParamsForStage,
  stageDecayFor,
} from "../src/sim/rhythm";
import { seasonForStage as renderSeasonForStage } from "../src/render/palette";
import { INITIAL_GV, type WorldState } from "../src/sim/types";
import { memoryFor } from "../src/game";

const NOON = 12;
const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

function starterWorld(): WorldState {
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

describe("tempo table (sim/rhythm.ts)", () => {
  it("ten minutes without feeding does not kill a full creature (§3)", () => {
    // A full creature starves after ceil(80 / HUNGER_PER_TICK) sim ticks; the
    // wiring stretches each tick to TICK_MS, so wall time must clear 10 min.
    const ticksToStarve = Math.ceil(80 / HUNGER_PER_TICK);
    const wallMinutes = (ticksToStarve * TICK_MS) / 60_000;
    expect(wallMinutes).toBeGreaterThanOrEqual(10);
    // …but not so slow that a creature withers past the point of drama.
    expect(wallMinutes).toBeLessThanOrEqual(20);
  });

  it("keeps the silent-run line at wall-clock minute 40 and consolidation on the minute", () => {
    expect(RHYTHM.silentRunMinutes).toBe(40);
    expect(RHYTHM.consolidationIntervalTicks).toBe(60);
  });
});

describe("GV stage taper (GAME_REVIEW §3, option a)", () => {
  it("decays strictly per stage and clamps out-of-range stages", () => {
    for (let stage = 1; stage < GV_STAGE_DECAY.length; stage += 1) {
      const previous = GV_STAGE_DECAY[stage - 1] ?? 1;
      const current = GV_STAGE_DECAY[stage] ?? 0;
      expect(previous).toBeGreaterThan(current);
      expect(stageDecayFor(stage)).toBe(current);
    }
    expect(stageDecayFor(0)).toBe(1);
    expect(stageDecayFor(-3)).toBe(1); // clamps to stage 0
    expect(stageDecayFor(9)).toBe(GV_STAGE_DECAY[4] ?? 0.1); // clamps to the finale
  });

  it("tapers runtime deltas only when the stage is passed; the two-arg contract stays exact", () => {
    const stare = { kind: "stare" as const, creatureId: "gazer_01", durationMs: 3000 };
    expect(gvDeltaFor(stare, NOON)).toBe(1.5);
    expect(gvDeltaFor(stare, NOON, 0)).toBe(1.5);
    expect(gvDeltaFor(stare, NOON, 4)).toBeCloseTo(0.15);
    expect(gvDeltaFor(stare, NOON, 9)).toBeCloseTo(0.15);
    // Night and taper compound.
    expect(gvDeltaFor(stare, 2, 4)).toBeCloseTo(0.225);
  });

  it("the finale is earned slowly: stage 4 buys a tenth of a stage-0 stare", () => {
    expect(stageDecayFor(4)).toBeLessThan(stageDecayFor(0) / 5);
  });
});

describe("seasonal parameter presets (§10.5-3, one act one season)", () => {
  it("derives the same season from the stage as the render palette (shared macro-clock)", () => {
    for (let stage = 0; stage <= 4; stage += 1) {
      expect(seasonForStage(stage)).toBe(renderSeasonForStage(stage));
    }
    // Out-of-range stages clamp the same way on both sides.
    expect(seasonForStage(-3)).toBe(renderSeasonForStage(-3));
    expect(seasonForStage(9)).toBe(renderSeasonForStage(9));
    expect(seasonForStage(4)).toBe("bleak");
  });

  it("spring is the book baseline and the year tightens toward the bleak finale", () => {
    const spring = SEASON_PARAMS.spring;
    expect(spring.hungerMultiplier).toBe(1);
    expect(spring.feedRestoreMultiplier).toBe(1);
    // Summer is abundance on purpose: hunger bites less, food feeds more.
    const summer = seasonParamsForStage(1);
    expect(summer.hungerMultiplier).toBeLessThan(spring.hungerMultiplier);
    expect(summer.feedRestoreMultiplier).toBeGreaterThan(spring.feedRestoreMultiplier);
    // From autumn through bleak the care loop only tightens.
    const tightening = [2, 3, 4] as const;
    for (let i = 1; i < tightening.length; i += 1) {
      const before = seasonParamsForStage(tightening[i - 1] ?? 2);
      const after = seasonParamsForStage(tightening[i] ?? 4);
      expect(after.hungerMultiplier).toBeGreaterThan(before.hungerMultiplier);
      expect(after.feedRestoreMultiplier).toBeLessThan(before.feedRestoreMultiplier);
    }
    // The bleak finale is the harshest and leanest season of all.
    const bleak = seasonParamsForStage(4);
    expect(bleak.hungerMultiplier).toBe(1.5);
    expect(bleak.feedRestoreMultiplier).toBe(0.7);
    expect(bleak.tickMs).toBeGreaterThan(spring.tickMs);
  });
});

describe("pacing model: a 30-60 minute playthrough (deterministic)", () => {
  /**
   * Normal play, fixed pattern: the cursor moves during one third of the stare
   * cadence (a stare every third tick), the player feeds a creature when its
   * hunger runs low, and nothing else generates GV. Runs the wiring's real
   * code path — engine step + ledger weights + stage taper — tick by tick.
   */
  function simulate(maxTicks: number) {
    let world = starterWorld();
    let stage4AtTick: number | null = null;
    let stage5AtTick: number | null = null;
    for (let tick = 1; tick <= maxTicks; tick += 1) {
      // Confirm-tap feeds: every creature below the hunger line gets fed.
      for (const creature of Object.values(world.creatures)) {
        if (creature.behavior !== "dead" && creature.stats.hunger < 40) {
          world = step(world, { kind: "feed", creatureId: creature.id });
          world = step(world, {
            kind: "gv",
            delta: gvDeltaFor({ kind: "feed", creatureId: creature.id, hesitationMs: 900 }, NOON, world.stage),
          });
        }
      }
      // Sustained cursor movement: one stare window per three ticks.
      if (tick % 3 === 0) {
        const first = Object.keys(world.creatures)[0] ?? "none";
        world = step(world, {
          kind: "gv",
          delta: gvDeltaFor({ kind: "stare", creatureId: first, durationMs: RHYTHM.stareMs }, NOON, world.stage),
        });
      }
      world = courtshipStep(step(world, { kind: "tick" }));
      if (stage4AtTick === null && world.gv >= 80) {
        stage4AtTick = tick;
      }
      if (stage5AtTick === null && world.gv >= 100) {
        stage5AtTick = tick;
      }
    }
    const wallMinutes = (tick2: number): number => (tick2 * TICK_MS) / 60_000;
    const dead = Object.values(world.creatures).filter((c) => c.behavior === "dead").length;
    return {
      world,
      stage4Minutes: stage4AtTick === null ? null : wallMinutes(stage4AtTick),
      stage5Minutes: stage5AtTick === null ? null : wallMinutes(stage5AtTick),
      dead,
    };
  }

  it("GV 0→80 lands on the 30-minute scale, and the full arc stays inside the hour", () => {
    const result = simulate(1300); // 65 wall minutes
    expect(result.stage4Minutes).not.toBeNull();
    expect(result.stage4Minutes).toBeGreaterThanOrEqual(18);
    expect(result.stage4Minutes).toBeLessThanOrEqual(35);
    expect(result.stage5Minutes).not.toBeNull();
    expect(result.stage5Minutes).toBeLessThanOrEqual(60);
    expect(result.world.stage).toBe(4);
  });

  it("the confirm-tap feeding cadence keeps every starter alive across the run", () => {
    const result = simulate(1300);
    expect(result.dead).toBe(0);
  });

  it("courtship still yields eggs under the slowed tick", () => {
    const result = simulate(400);
    expect(result.world.eggs.length).toBeGreaterThan(0);
    expect(result.world.eggs.length).toBeLessThanOrEqual(4);
  });
});

describe("interaction contracts (GAME_REVIEW §4)", () => {
  it("memory ids never collide within one tick (stream A's fix, verified)", () => {
    const a = memoryFor("gazer_01", "the player fed me", 42, 0.8);
    const b = memoryFor("gazer_01", "the player cleaned me", 42, 0.3);
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith("mem_gazer_01_42_")).toBe(true);
    expect(b.id.startsWith("mem_gazer_01_42_")).toBe(true);
    // And across ticks the id still names its origin.
    const c = memoryFor("gazer_02", "01 died", 43, -1);
    expect(c.id.startsWith("mem_gazer_02_43_")).toBe(true);
  });

  it("game.ts keeps the confirm-style input mapping and no unsafe creature casts", () => {
    const source = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
    // Stream A's carry fix stays fixed.
    expect(source).not.toContain("as CreatureState");
    // Feeding is guarded, not pressed: the feed timer is cancellable and the
    // double-tap can withdraw it before it lands.
    expect(source).toContain("cancelPendingFeed");
    expect(source).toContain("RHYTHM.feedGuardMs");
    expect(source).toContain("doubleTap");
    // Hold verbs keep their cadence from the tempo table.
    expect(source).toContain("RHYTHM.petHoldMs");
    expect(source).toContain("RHYTHM.nameHoldMs");
    // Touch parity: the clean key exists, and its wording is pool-owned
    // (integration, ticket 0004 follow-up: FIXME interim pair replaced by
    // COPY.hud.clean).
    expect(source).toContain("COPY.hud.clean");
    expect(source).not.toContain("CLEAN_MODE_LABEL");
    // Every runtime delta passes the stage taper, and the hour feeding the
    // night multiplier is derived from the tick (ticket 0008), not the wall
    // clock — no `getHours` may reappear.
    expect(source).toContain("worldHour(world.tick), world.stage");
    expect(source).not.toContain("getHours");
    // The pressed-down handler no longer steps a feed event: feeding happens
    // only through the guard timer's performFeed.
    expect(source).not.toContain('kind: cleaning ? "clean" : "feed"');
  });
});
