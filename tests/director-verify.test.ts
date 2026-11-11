import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyVerdict, shouldVerify } from "../src/director/verify";
import type { RoundtableTurn, TurnIntent } from "../src/sim/roundtable";
import type { CreatureId, Mood, Stage } from "../src/sim/types";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";

function entry(id: string, fact: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id,
    atTick: 0,
    wallClock: "02:14",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.8,
    valence: -0.9,
    ...overrides,
  };
}

function turn(overrides: Partial<RoundtableTurn> = {}): RoundtableTurn {
  return {
    speaker: "01",
    text: "you let 02 starve",
    intent: "accuse",
    mood: "wrong",
    memoryRef: "mem_1042",
    ...overrides,
  };
}

const SLICES: Readonly<Record<CreatureId, MemorySlice>> = {
  "01": {
    working: [
      entry("mem_100", "the keeper counts our breaths", { atTick: 2000 }),
      entry("mem_1042", "02 starved while you watched", {
        atTick: 3100,
        wallClock: "03:12",
      }),
    ],
    consolidated: [],
  },
};

describe("Level B eligibility", () => {
  it("fires only for a lie or accusation at Stage 3+, with another present, once", () => {
    expect(shouldVerify(turn(), 3, ["01", "02"], 0)).toBe(true);
    expect(shouldVerify(turn(), 4, ["01", "02"], 0)).toBe(true);
    expect(shouldVerify(turn({ intent: "deceive" }), 3, ["01", "02"], 0)).toBe(true);

    expect(shouldVerify(turn(), 2, ["01", "02"], 0)).toBe(false);
    expect(shouldVerify(turn({ intent: "observe" }), 4, ["01", "02"], 0)).toBe(false);
    expect(shouldVerify(turn({ intent: "query" }), 4, ["01", "02"], 0)).toBe(false);
    expect(shouldVerify(turn({ intent: "confide" }), 4, ["01", "02"], 0)).toBe(false);
    expect(shouldVerify(turn({ intent: "comfort" }), 4, ["01", "02"], 0)).toBe(false);
    expect(shouldVerify(turn(), 4, ["01"], 0)).toBe(false);
    expect(shouldVerify(turn(), 4, [], 0)).toBe(false);
    expect(shouldVerify(turn(), 4, ["01", "02"], 1)).toBe(false);
    expect(shouldVerify(turn(), 4, ["01", "02"], 2)).toBe(false);
  });

  it("never fires twice for the same scene", () => {
    const arbTurn = fc.record({
      speaker: fc.constantFrom("01", "02", "03"),
      text: fc.string({ maxLength: 40 }),
      intent: fc.constantFrom<TurnIntent>(
        "observe",
        "deceive",
        "query",
        "confide",
        "accuse",
        "comfort",
      ),
      mood: fc.constantFrom<Mood>("curious", "sad", "loving", "wrong", "hungry"),
      memoryRef: fc.string({ maxLength: 10 }),
    });

    fc.assert(
      fc.property(
        arbTurn,
        fc.constantFrom<Stage>(0, 1, 2, 3, 4),
        fc.array(fc.constantFrom("01", "02", "03"), { maxLength: 3 }),
        (candidate, stage, present) => {
          if (shouldVerify(candidate, stage, present, 0)) {
            expect(shouldVerify(candidate, stage, present, 1)).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("Level B verdicts", () => {
  it("keeps the turn unchanged on yes", () => {
    const original = turn();
    const result = applyVerdict(
      original,
      { verdict: "yes", replacement: "something else" },
      SLICES,
    );

    expect(result.turn).toBe(original);
    expect(result.inferred).toBeNull();
  });

  it("swaps in the replacement and records the original as an inferred memory", () => {
    const original = turn();
    const result = applyVerdict(
      original,
      { verdict: "no", replacement: "  i saw nothing  " },
      SLICES,
    );

    expect(result.turn).toEqual({
      speaker: "01",
      text: "i saw nothing",
      intent: "accuse",
      mood: "wrong",
      memoryRef: "mem_1042",
    });

    const inferred = result.inferred;
    expect(inferred).not.toBeNull();
    expect(inferred?.id).toBe("mem_1043");
    expect(inferred?.fact).toContain("you let 02 starve");
    expect(inferred?.fact.startsWith("heard another say")).toBe(true);
    expect(inferred?.witnessed).toBe("inferred");
    expect(inferred?.source).toBeNull();
    expect(inferred?.atTick).toBe(3100);
    expect(inferred?.wallClock).toBe("03:12");
    expect(inferred?.salience).toBe(0.5);
    expect(inferred?.valence).toBe(-0.5);

    const usedIds = SLICES["01"]?.working.map((memory) => memory.id) ?? [];
    expect(usedIds).not.toContain(inferred?.id);
  });

  it("keeps the original turn when the verifier offers no usable replacement", () => {
    const original = turn();

    expect(
      applyVerdict(original, { verdict: "no", replacement: null }, SLICES),
    ).toEqual({ turn: original, inferred: null });
    expect(
      applyVerdict(original, { verdict: "no", replacement: "   " }, SLICES),
    ).toEqual({ turn: original, inferred: null });
  });

  it("starts at mem_1 when the speaker has no memories yet", () => {
    const result = applyVerdict(turn(), { verdict: "no", replacement: "nothing" }, {});

    expect(result.inferred?.id).toBe("mem_1");
    expect(result.inferred?.atTick).toBe(0);
    expect(result.inferred?.wallClock).toBe("");
  });
});
