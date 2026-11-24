import { describe, expect, it } from "vitest";
import {
  LEDGER_CAPACITY,
  appendLedgerEntry,
  gvDeltaFor,
  lifetimeSummary,
  type LedgerEntry,
  type LedgerEvent,
} from "../src/sim/ledger";
import { hydrateWorld, serializeWorld } from "../src/sim/save";
import type { WorldState } from "../src/sim/types";

function entry(at: number, event: LedgerEvent): LedgerEntry {
  return { at, wallClock: `day1 00:${String(at % 60).padStart(2, "0")}`, event };
}

describe("behaviour ledger window (R3.1/R3.2)", () => {
  it("keeps the newest entry and its tick/wallClock/event", () => {
    const event: LedgerEvent = { kind: "feed", creatureId: "gazer_01", hesitationMs: 420 };
    const next = appendLedgerEntry([], entry(7, event));
    expect(next).toEqual([{ at: 7, wallClock: "day1 00:07", event }]);
  });

  it("evicts the oldest entry once the window is full", () => {
    let ledger: readonly LedgerEntry[] = [];
    for (let tick = 0; tick < LEDGER_CAPACITY + 3; tick += 1) {
      ledger = appendLedgerEntry(ledger, entry(tick, { kind: "clean", creatureId: "gazer_01" }));
    }
    expect(ledger).toHaveLength(LEDGER_CAPACITY);
    expect(ledger[0]?.at).toBe(3);
    expect(ledger[ledger.length - 1]?.at).toBe(LEDGER_CAPACITY + 2);
  });

  it("a reset is narrative: it never moves GV", () => {
    expect(gvDeltaFor({ kind: "reset" }, 12)).toBe(0);
    expect(gvDeltaFor({ kind: "reset" }, 3)).toBe(0);
  });

  it("rides the save, and a forged oversized archive is trimmed to the window", () => {
    const base: WorldState = {
      tick: 1,
      gv: 0,
      stage: 0,
      creatures: {},
      structures: [],
      eggs: [],
      uiLabels: {},
      paletteDecay: 0,
      seed: 1,
      silent: false,
    };
    const one = appendLedgerEntry([], entry(1, { kind: "feed", creatureId: "gazer_01", hesitationMs: 50 }));
    const restored = hydrateWorld(serializeWorld({ ...base, ledger: one }));
    expect(restored?.ledger).toEqual(one);

    const many = Array.from({ length: LEDGER_CAPACITY + 3 }, (_, index) =>
      entry(index, { kind: "clean", creatureId: "gazer_01" }),
    );
    const trimmed = hydrateWorld(serializeWorld({ ...base, ledger: many }));
    expect(trimmed?.ledger).toHaveLength(LEDGER_CAPACITY);
    expect(trimmed?.ledger?.[0]?.at).toBe(3);
  });

  it("rejects a forged entry instead of trusting it", () => {
    const base: WorldState = {
      tick: 1,
      gv: 0,
      stage: 0,
      creatures: {},
      structures: [],
      eggs: [],
      uiLabels: {},
      paletteDecay: 0,
      seed: 1,
      silent: false,
    };
    const badKind = {
      ...base,
      ledger: [{ at: 1, wallClock: "day1 12:00", event: { kind: "not_a_kind" } }],
    } as unknown as WorldState;
    expect(hydrateWorld(serializeWorld(badKind))).toBeNull();

    const badFeed = {
      ...base,
      ledger: [
        { at: 1, wallClock: "day1 12:00", event: { kind: "feed", creatureId: "g", hesitationMs: Number.NaN } },
      ],
    } as unknown as WorldState;
    expect(hydrateWorld(serializeWorld(badFeed))).toBeNull();
  });
});

describe("lifetime summary (R3.4)", () => {
  it("counts feeds, deaths, mean hesitation, sessions and resets", () => {
    const ledger: readonly LedgerEntry[] = [
      entry(1, { kind: "session_start", localHour: 21 }),
      entry(2, { kind: "feed", creatureId: "gazer_01", hesitationMs: 100 }),
      entry(3, { kind: "feed", creatureId: "gazer_02", hesitationMs: 300 }),
      entry(4, { kind: "feed", creatureId: "gazer_01", hesitationMs: 500 }),
      entry(5, { kind: "death", creatureId: "gazer_02", cause: "starvation" }),
      entry(6, { kind: "reset" }),
      entry(7, { kind: "session_start", localHour: 9 }),
      entry(8, { kind: "session_start", localHour: 21 }),
    ];

    expect(lifetimeSummary(ledger)).toEqual({
      feeds: 3,
      deaths: 1,
      meanHesitationMs: 300,
      favoriteCreatureId: "gazer_01",
      typicalHours: [9, 21],
      sessions: 3,
      resets: 1,
    });
  });

  it("keeps the earliest first-fed creature when counts tie", () => {
    const ledger: readonly LedgerEntry[] = [
      entry(1, { kind: "feed", creatureId: "gazer_02", hesitationMs: 0 }),
      entry(2, { kind: "feed", creatureId: "gazer_01", hesitationMs: 0 }),
    ];
    expect(lifetimeSummary(ledger).favoriteCreatureId).toBe("gazer_02");
  });

  it("returns zeroes and null for an empty ledger", () => {
    expect(lifetimeSummary([])).toEqual({
      feeds: 0,
      deaths: 0,
      meanHesitationMs: 0,
      favoriteCreatureId: null,
      typicalHours: [],
      sessions: 0,
      resets: 0,
    });
  });
});