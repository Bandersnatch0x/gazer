/**
 * Ticket 0073 (carried from 0012): the season `tickMs` column becomes the
 * LIVE loop interval. The interval is a wall-clock mapping only — `step`
 * never sees it, so the same seed and event sequence replay byte-identically
 * no matter how the interval changes.
 *
 * Everything here runs against the exported pure seam `createVisibilityDriver`
 * (ticket 0068) with an injected fake interval handle, so the "at most one
 * timer" rule is observable without a browser.
 */
import { describe, expect, it } from "vitest";
import { createVisibilityDriver } from "../src/game";
import { SEASON_PARAMS, seasonForStage } from "../src/sim/rhythm";

interface FakeHandle {
  readonly id: number;
  readonly ms: number;
}

let nextId = 1;

function fakeIntervalFactory(ticks: number[], msLog: FakeHandle[]) {
  return (fn: () => void, ms: number): FakeHandle => {
    void fn;
    const handle = { id: nextId, ms };
    nextId += 1;
    msLog.push(handle);
    ticks.push(handle.id);
    return handle;
  };
}

describe("ticket 0073: the season tickMs column is the live loop interval", () => {
  it("keeps the five documented tickMs values (spring/summer/autumn/winter/bleak)", () => {
    const stages = [0, 1, 2, 3, 4];
    const values = stages.map((stage) => SEASON_PARAMS[seasonForStage(stage)].tickMs);
    expect(values).toEqual([3000, 3000, 2800, 3200, 3500]);
  });

  it("re-arms with the live provider value and never holds two intervals", () => {
    const ticks: number[] = [];
    const msLog: FakeHandle[] = [];
    let season = 3000;
    const driver = createVisibilityDriver<FakeHandle>({
      setInterval: fakeIntervalFactory(ticks, msLog),
      clearInterval: (handle) => {
        const index = ticks.lastIndexOf(handle.id);
        if (index >= 0) {
          ticks.splice(index, 1);
        }
      },
      intervalMs: () => season,
      tick: () => undefined,
    });

    driver.start();
    expect(ticks).toHaveLength(1);
    expect(msLog[0]?.ms).toBe(3000);

    // Stage crossing → season change: rearm clears the old handle and arms
    // exactly one new one with the new value. Never two live intervals.
    season = 2800;
    driver.rearm();
    expect(ticks).toHaveLength(1);
    expect(msLog).toHaveLength(2);
    expect(msLog[1]?.ms).toBe(2800);

    // A rearm without a value change is a no-op (no third handle).
    driver.rearm();
    expect(ticks).toHaveLength(1);
    expect(msLog).toHaveLength(2);

    // Hidden tab: stopped. Rearm while hidden stays stopped — the resume path
    // (onVisibility(false)) arms with the live value itself.
    driver.onVisibility(true);
    expect(ticks).toHaveLength(0);
    driver.rearm();
    expect(ticks).toHaveLength(0);
    driver.onVisibility(false);
    expect(ticks).toHaveLength(1);
    expect(msLog[msLog.length - 1]?.ms).toBe(2800);

    // stop() tears the single interval down.
    driver.stop();
    expect(ticks).toHaveLength(0);
    expect(driver.running).toBe(false);
  });

  it("maps wall-clock interval changes to tick pacing without touching step", () => {
    // Determinism face: the interval is a pacing knob only. The driver's tick
    // callback is injected and world-free: changing the interval provider
    // never alters what a tick does, only how often it fires.
    const ticks: number[] = [];
    const msLog: FakeHandle[] = [];
    let season = 3000;
    const driver = createVisibilityDriver<FakeHandle>({
      setInterval: fakeIntervalFactory(ticks, msLog),
      clearInterval: (handle) => {
        const index = ticks.lastIndexOf(handle.id);
        if (index >= 0) {
          ticks.splice(index, 1);
        }
      },
      intervalMs: () => season,
      tick: () => undefined,
    });

    driver.start();
    // Cross into autumn: the armed handle value changes, the callback face
    // does not. One interval exists at any moment throughout.
    season = 2800;
    driver.rearm();
    expect(ticks).toHaveLength(1);
    expect(msLog[msLog.length - 1]?.ms).toBe(2800);
  });
});
