/**
 * Ticket 0009 (W3 midnight silence + W4 clock drift): the shell performs on
 * pure tick predicates and lands through the existing Effect channel. Pins
 * the determinism contract — same tick, same performance, bit for bit, no
 * wall clock, no LLM, no network.
 */
import { describe, expect, it } from "vitest";
import {
  DAWN_TRACK,
  DRIFT_AMPLITUDE_SECONDS,
  DRIFT_PERIOD_TICKS,
  DRIFT_REVEAL_SECONDS,
  MIDNIGHT_FREEZE_MS,
  MIDNIGHT_TRACK,
  SHELL_CLOCK_LABEL,
  driftRateAt,
  driftRevealAt,
  driftSecondsAt,
  midnightSilenceAt,
  midnightSilenceEntryAt,
  midnightSilenceExitAt,
  shellClockAt,
  shellClockText,
  shellPerformanceAt,
  shellSecondsAt,
} from "../src/sim/shell";
import { DAY_CYCLE_TICKS, worldHour } from "../src/sim/clock";
import { TICK_MS } from "../src/sim/rhythm";
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

describe("W3 midnight silence", () => {
  it("covers exactly the midnight hour: ticks 600..649 of each cycle", () => {
    expect(midnightSilenceAt(0)).toBe(false);
    expect(midnightSilenceAt(599)).toBe(false);
    expect(midnightSilenceAt(600)).toBe(true);
    expect(midnightSilenceAt(649)).toBe(true);
    expect(midnightSilenceAt(650)).toBe(false);
    // Periodic with the day cycle.
    expect(midnightSilenceAt(DAY_CYCLE_TICKS + 600)).toBe(true);
    expect(midnightSilenceAt(DAY_CYCLE_TICKS + 650)).toBe(false);
    // The window is the midnight hour: 50 ticks ≈ 2.5 real minutes a day.
    let count = 0;
    for (let tick = 0; tick < DAY_CYCLE_TICKS; tick += 1) {
      if (midnightSilenceAt(tick)) {
        count += 1;
      }
    }
    expect(count).toBe(50);
  });

  it("announces entry and exit on the exact boundary ticks", () => {
    expect(midnightSilenceEntryAt(600)).toBe(true);
    expect(midnightSilenceEntryAt(601)).toBe(false);
    expect(midnightSilenceEntryAt(0)).toBe(false);
    expect(midnightSilenceExitAt(650)).toBe(true);
    expect(midnightSilenceExitAt(649)).toBe(false);
    expect(midnightSilenceExitAt(651)).toBe(false);
    expect(midnightSilenceEntryAt(DAY_CYCLE_TICKS + 600)).toBe(true);
    expect(midnightSilenceExitAt(DAY_CYCLE_TICKS + 650)).toBe(true);
  });

  it("aligns with the derived world hour, not the wall clock", () => {
    expect(worldHour(600)).toBe(0);
    for (let tick = 0; tick < DAY_CYCLE_TICKS * 2; tick += 1) {
      expect(midnightSilenceAt(tick)).toBe(worldHour(tick) === 0);
    }
  });
});

describe("W4 clock drift", () => {
  it("lies on a deterministic triangle wave with the pinned amplitude", () => {
    expect(driftSecondsAt(0)).toBe(0);
    expect(driftSecondsAt(300)).toBe(60);
    expect(driftSecondsAt(600)).toBe(DRIFT_AMPLITUDE_SECONDS);
    expect(driftSecondsAt(900)).toBe(60);
    expect(driftSecondsAt(1200)).toBe(0);
    expect(driftSecondsAt(1500)).toBe(-60);
    expect(driftSecondsAt(1800)).toBe(-DRIFT_AMPLITUDE_SECONDS);
    expect(driftSecondsAt(2400)).toBe(0);
    expect(driftSecondsAt(DRIFT_PERIOD_TICKS + 300)).toBe(60);
  });

  it("the shell clock is world time plus the lie, closed-form and monotone", () => {
    expect(shellSecondsAt(0)).toBe(0);
    expect(shellSecondsAt(600)).toBe(1800 + 120);
    expect(shellClockAt(0)).toEqual({ hour: 0, minute: 0 });
    expect(shellClockAt(600)).toEqual({ hour: 0, minute: 32 });
    expect(shellClockAt(1200)).toEqual({ hour: 1, minute: 0 });
    expect(shellClockText(600)).toBe("00:32");
    expect(shellClockText(1500)).toBe("01:14");
    let previous = shellSecondsAt(0);
    for (let tick = 1; tick <= DRIFT_PERIOD_TICKS; tick += 1) {
      const current = shellSecondsAt(tick);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it("the drift rate stays honest-adjacent and reads the triangle slope", () => {
    expect(driftRateAt(0)).toBeCloseTo((3 + 0.2) / 3, 10);
    expect(driftRateAt(700)).toBeCloseTo((3 - 0.2) / 3, 10);
    expect(driftRateAt(1850)).toBeCloseTo((3 + 0.2) / 3, 10);
    for (let tick = 0; tick < DRIFT_PERIOD_TICKS; tick += 7) {
      expect(driftRateAt(tick)).toBeGreaterThan(0);
    }
  });

  it("reveals the lie exactly at the threshold crossings: tick 300 and 1500", () => {
    const reveals: number[] = [];
    for (let tick = 0; tick < DRIFT_PERIOD_TICKS; tick += 1) {
      if (driftRevealAt(tick)) {
        reveals.push(tick);
      }
    }
    expect(reveals).toEqual([300, 1500]);
    // The falling crossings (900, 2100) are the shell forgetting, not telling.
    expect(driftRevealAt(900)).toBe(false);
    expect(driftRevealAt(2100)).toBe(false);
    expect(DRIFT_REVEAL_SECONDS).toBe(DRIFT_AMPLITUDE_SECONDS / 2);
  });
});

describe("the shell performance (Effect channel)", () => {
  it("is empty on almost every tick", () => {
    const beats: number[] = [];
    for (let tick = 0; tick < DRIFT_PERIOD_TICKS; tick += 1) {
      if (shellPerformanceAt(tick).length > 0) {
        beats.push(tick);
      }
    }
    // Two midnight cycles (entry + exit each) plus two drift reveals.
    expect(beats).toEqual([300, 600, 650, 1500, 1800, 1850]);
  });

  it("drops the ambience at midnight and restores it at dawn", () => {
    expect(shellPerformanceAt(600)).toEqual([
      { kind: "audio_drop_track", track: MIDNIGHT_TRACK },
      { kind: "freeze_all", ms: MIDNIGHT_FREEZE_MS },
    ]);
    expect(shellPerformanceAt(650)).toEqual([
      { kind: "audio_drop_track", track: DAWN_TRACK },
    ]);
    expect(MIDNIGHT_TRACK).toBe("midnight");
    expect(DAWN_TRACK).toBe("dawn");
  });

  it("confesses the drift through relabel_ui + corruption + shake", () => {
    expect(shellPerformanceAt(300)).toEqual([
      { kind: "relabel_ui", target: SHELL_CLOCK_LABEL, text: "00:16" },
      { kind: "glyph_corrupt", amount: 0.2 },
      { kind: "ui_shake", intensity: 0.25, ms: 400 },
    ]);
    expect(shellPerformanceAt(1500)).toEqual([
      { kind: "relabel_ui", target: SHELL_CLOCK_LABEL, text: "01:14" },
      { kind: "glyph_corrupt", amount: 0.2 },
      { kind: "ui_shake", intensity: 0.25, ms: 400 },
    ]);
  });

  it("replays the whole show bit for bit: same ticks, same world", () => {
    let runA = starterWorld(1997);
    let runB = starterWorld(1997);
    for (let tick = 1; tick <= 2400; tick += 1) {
      for (const effect of shellPerformanceAt(tick)) {
        runA = step(runA, { kind: "apply_effect", effect });
        runB = step(runB, { kind: "apply_effect", effect });
      }
      runA = step(runA, { kind: "tick" });
      runB = step(runB, { kind: "tick" });
      expect(runA).toEqual(runB);
    }
    // The shell's confession landed in world state through the channel.
    expect(runA.uiLabels[SHELL_CLOCK_LABEL]).toBe("01:14");
  });

  it("the wiring runs the loop at the tick tempo the drift is computed in", () => {
    // One game day is 1200 ticks × 3s; the drift period is two of those.
    expect(DRIFT_PERIOD_TICKS).toBe(DAY_CYCLE_TICKS * 2);
    expect(TICK_MS).toBe(3000);
  });
});
