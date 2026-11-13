/**
 * Ticket 0010: the calendar face, the template-pool pseudo-news, and the
 * offline cold-start smoke. Everything here runs with zero network and zero
 * LLM: the calendar derives from the tick, the news is seeded template copy
 * landing through the relabel_ui channel, and the smoke replays a full two
 * game days of the offline loop.
 */
import { describe, expect, it } from "vitest";
import {
  DAY_CYCLE_TICKS,
  worldCalendarAt,
  worldDay,
  worldDaySeconds,
  worldHour,
} from "../src/sim/clock";
import {
  NEWS_INTERVAL_TICKS,
  NEWS_TICKER_LABEL,
  newsDue,
  newsEffectFor,
  newsIndexAt,
  newsLineFor,
  newsValuesFor,
} from "../src/sim/news";
import { step } from "../src/sim/engine";
import { shellPerformanceAt } from "../src/sim/shell";
import { INITIAL_GV, type WorldState } from "../src/sim/types";

const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

/** An offline cold-start world: silent run, no endpoint, default seed. */
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

describe("the calendar face (sim/clock.ts)", () => {
  it("boots at 12:00 on day 0 — sky noon and calendar noon agree", () => {
    expect(worldCalendarAt(0)).toEqual({ day: 0, hour: 12, minute: 0 });
    expect(worldDaySeconds(0)).toBe(43200);
  });

  it("midnight is 00:00, exactly where skyAt is darkest", () => {
    expect(worldCalendarAt(600)).toEqual({ day: 0, hour: 0, minute: 0 });
    expect(worldCalendarAt(649)).toEqual({ day: 0, hour: 0, minute: 58 });
    expect(worldCalendarAt(650)).toEqual({ day: 0, hour: 1, minute: 0 });
    expect(worldHour(600)).toBe(0);
  });

  it("one cycle later it is day 1, same face", () => {
    expect(worldCalendarAt(DAY_CYCLE_TICKS)).toEqual({ day: 1, hour: 12, minute: 0 });
    expect(worldCalendarAt(DAY_CYCLE_TICKS + 600)).toEqual({ day: 1, hour: 0, minute: 0 });
    expect(worldDay(DAY_CYCLE_TICKS * 3)).toBe(3);
  });

  it("the face never disagrees with itself and wraps only at the midnight line", () => {
    // The display day runs midnight → midnight: it opens at tick 600 (s=0),
    // climbs strictly through the whole cycle, and wraps exactly once at the
    // next midnight (tick 600 + 1200).
    const start = 600;
    expect(worldDaySeconds(start)).toBe(0);
    let previous = 0;
    let wraps = 0;
    for (let offset = 1; offset < DAY_CYCLE_TICKS; offset += 1) {
      const seconds = worldDaySeconds(start + offset);
      if (seconds < previous) {
        wraps += 1;
      } else {
        expect(seconds).toBeGreaterThan(previous);
      }
      previous = seconds;
      const calendar = worldCalendarAt(start + offset);
      // hour and minute read the same phase: recomputing the hour from the
      // day seconds must land on the same value.
      expect(Math.floor(seconds / 3600) % 24).toBe(worldHour(start + offset));
      expect(calendar.minute).toBeGreaterThanOrEqual(0);
      expect(calendar.minute).toBeLessThanOrEqual(59);
    }
    expect(wraps).toBe(0);
    expect(worldDaySeconds(start + DAY_CYCLE_TICKS)).toBe(0);
  });
});

describe("the pseudo-news schedule (sim/news.ts)", () => {
  it("releases one item every quarter day, never at boot", () => {
    expect(newsDue(0)).toBe(false);
    expect(newsDue(1)).toBe(false);
    expect(newsDue(NEWS_INTERVAL_TICKS - 1)).toBe(false);
    expect(newsDue(NEWS_INTERVAL_TICKS)).toBe(true);
    expect(newsDue(2 * NEWS_INTERVAL_TICKS)).toBe(true);
    expect(newsIndexAt(0)).toBe(0);
    expect(newsIndexAt(NEWS_INTERVAL_TICKS - 1)).toBe(0);
    expect(newsIndexAt(NEWS_INTERVAL_TICKS)).toBe(1);
    expect(NEWS_INTERVAL_TICKS).toBe(300);
  });

  it("is deterministic: same seed, same tick, same copy", () => {
    const world = coldStartWorld();
    expect(newsLineFor({ ...world, tick: 300 }, "en")).toBe(
      newsLineFor({ ...world, tick: 300 }, "en"),
    );
    expect(newsLineFor({ ...world, tick: 300 }, "zh")).toBe(
      newsLineFor({ ...world, tick: 300 }, "zh"),
    );
  });

  it("varies its picks over a run — it is a pool, not a recording", () => {
    const world = coldStartWorld();
    const picks = new Set<string>();
    for (let index = 1; index <= 24; index += 1) {
      picks.add(newsLineFor({ ...world, tick: index * NEWS_INTERVAL_TICKS }, "en"));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it("never leaks a bare placeholder, NaN, or undefined (D-stream discipline)", () => {
    for (const seed of [1997, 42, 0, 2147483647, 7]) {
      for (let index = 1; index <= 40; index += 1) {
        const world = { ...coldStartWorld(), seed, tick: index * NEWS_INTERVAL_TICKS };
        for (const locale of ["en", "zh"] as const) {
          const line = newsLineFor(world, locale);
          expect(line).not.toContain("{");
          expect(line).not.toContain("}");
          expect(line).not.toContain("NaN");
          expect(line).not.toContain("undefined");
          expect(line.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("fills slots with honest world values", () => {
    const world = { ...coldStartWorld(), tick: 300 };
    const values = newsValuesFor(world);
    expect(values.alive).toBe(3);
    expect(values.eggs).toBe(0);
    expect(values.gv).toBe(0);
    expect(values.day).toBe(1);
    // Tick 300 is the dusk quarter: the honest world face reads 18:00.
    expect(values.clock).toBe("18:00");
    // Slot-bearing templates render the real values: scan the pool via the
    // seed key until a census line comes up, and it must carry the truth.
    const censusLines: string[] = [];
    for (let seed = 1997; seed < 2100; seed += 1) {
      const line = newsLineFor({ ...world, seed }, "en");
      if (line.includes("DAY 1")) {
        censusLines.push(line);
      }
    }
    expect(censusLines.length).toBeGreaterThan(0);
    for (const line of censusLines) {
      expect(line).toContain("3 awake");
      expect(line).toContain("0 in storage");
    }
  });

  it("lands through the relabel_ui channel, null on other ticks", () => {
    const world = { ...coldStartWorld(), tick: 300 };
    const effect = newsEffectFor(world, "en");
    expect(effect).not.toBeNull();
    if (effect === null || effect.kind !== "relabel_ui") {
      expect.unreachable("news at a due tick must be a relabel_ui effect");
      return;
    }
    expect(effect.target).toBe(NEWS_TICKER_LABEL);
    expect(effect.text).toBe(newsLineFor(world, "en"));
    expect(newsEffectFor({ ...world, tick: 299 }, "en")).toBeNull();
    expect(newsEffectFor({ ...world, tick: 1 }, "en")).toBeNull();
  });
});

describe("offline cold-start smoke (M8)", () => {
  it("plays two full game days offline: calendar, news, and shell all broadcast", () => {
    let world = coldStartWorld();
    let newsReleases = 0;
    const tickersSeen = new Set<string>();
    for (let tick = 1; tick <= DAY_CYCLE_TICKS * 2; tick += 1) {
      for (const effect of shellPerformanceAt(world.tick)) {
        world = step(world, { kind: "apply_effect", effect });
      }
      const news = newsEffectFor(world, "en");
      if (news !== null) {
        newsReleases += 1;
        world = step(world, { kind: "apply_effect", effect: news });
      }
      world = step(world, { kind: "tick" });
      const ticker = world.uiLabels[NEWS_TICKER_LABEL];
      if (ticker !== undefined) {
        tickersSeen.add(ticker);
        expect(ticker).not.toContain("{");
        expect(ticker).not.toContain("NaN");
      }
    }
    // Broadcasts land at ticks 300..2100 inside the loop window (tick 2400's
    // item belongs to the boundary after the final step): 7 releases, fed
    // and varied.
    expect(newsReleases).toBe(7);
    expect(tickersSeen.size).toBeGreaterThan(1);
    expect(world.uiLabels[NEWS_TICKER_LABEL]).toBeDefined();
    // The calendar advanced honestly through the whole run.
    expect(worldCalendarAt(world.tick)).toEqual({ day: 2, hour: 12, minute: 0 });
    // The world stayed playable: finite GV, creatures still accounted for.
    expect(Number.isFinite(world.gv)).toBe(true);
    expect(Object.keys(world.creatures).length).toBe(3);
  });

  it("the broadcast runs straight through the midnight hour", () => {
    // Tick 600 is both the midnight entry and a news boundary: the creatures
    // fall silent (W3) but the shell keeps broadcasting — it is uiLabels,
    // not speech, so R6.1's silent run stays intact.
    const world = { ...coldStartWorld(), tick: 600 };
    expect(shellPerformanceAt(600).length).toBe(2);
    expect(newsEffectFor(world, "en")).not.toBeNull();
  });
});
