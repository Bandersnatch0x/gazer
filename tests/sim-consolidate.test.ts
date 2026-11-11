import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyConsolidation, fallbackConsolidate } from "../src/sim/consolidate";
import type { ConsolidatedEntry, MemoryEntry, MemorySlice } from "../src/sim/memory";
import { CONSOLIDATED_CAPACITY } from "../src/sim/memory";

function event(id: string, salience: number, valence: number): MemoryEntry {
  return {
    id,
    atTick: 1,
    wallClock: "tick_1",
    fact: `fact ${id}`,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience,
    valence,
  };
}

function consolidated(id: string): ConsolidatedEntry {
  return {
    id,
    content: `content ${id}`,
    derivedFrom: [`evt_${id}`],
    consolidatedAt: "tick_0",
    perspectiveNote: null,
  };
}

function sliceOf(working: readonly MemoryEntry[], permanent: readonly ConsolidatedEntry[]): MemorySlice {
  return { working, consolidated: permanent };
}

describe("fallbackConsolidate", () => {
  it("takes the two working entries that pull hardest", () => {
    const slice = sliceOf(
      [event("evt_1", 0.5, 0), event("evt_2", 0.4, -1), event("evt_3", 0.3, 0.9)],
      [],
    );
    const added = fallbackConsolidate(slice, 9);
    expect(added.map((entry) => entry.derivedFrom[0])).toEqual(["evt_2", "evt_3"]);
    expect(added.map((entry) => entry.id)).toEqual(["cons_001", "cons_002"]);
    expect(added.every((entry) => entry.perspectiveNote === null)).toBe(true);
  });

  it("continues ids from the existing consolidated count", () => {
    const slice = sliceOf([event("evt_1", 0.9, 0)], [consolidated("cons_001"), consolidated("cons_002")]);
    const added = fallbackConsolidate(slice, 4);
    expect(added.map((entry) => entry.id)).toEqual(["cons_003"]);
  });

  it("returns nothing for an empty working layer", () => {
    expect(fallbackConsolidate(sliceOf([], []), 0)).toEqual([]);
  });
});

describe("applyConsolidation", () => {
  it("never exceeds consolidated capacity", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.nat({ max: 5 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (existingCount, addedCount, retireFlags) => {
          const permanent = Array.from({ length: existingCount }, (_, index) =>
            consolidated(`cons_${String(index + 1).padStart(3, "0")}`),
          );
          const added = Array.from({ length: addedCount }, (_, index) => consolidated(`cons_new_${index}`));
          const retire = permanent.filter((_, index) => retireFlags[index] === true).map((entry) => entry.id);
          const slice = sliceOf([event("evt_1", 0.5, 0)], permanent);

          const result = applyConsolidation(slice, added, retire);

          expect(result.consolidated.length).toBeLessThanOrEqual(CONSOLIDATED_CAPACITY);
          expect(result.working.slice(0, slice.working.length)).toEqual(slice.working);
        },
      ),
    );
  });

  it("never deletes: every entry ends in consolidated or in the working tail", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.nat({ max: 5 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (existingCount, addedCount, retireFlags) => {
          const permanent = Array.from({ length: existingCount }, (_, index) =>
            consolidated(`cons_${String(index + 1).padStart(3, "0")}`),
          );
          const added = Array.from({ length: addedCount }, (_, index) => consolidated(`cons_new_${index}`));
          const retire = permanent.filter((_, index) => retireFlags[index] === true).map((entry) => entry.id);

          const result = applyConsolidation(sliceOf([], permanent), added, retire);
          const kept = result.consolidated.length;
          const demoted = result.working.length;
          expect(kept + demoted).toBe(permanent.length + added.length);
        },
      ),
    );
  });

  it("retires a named entry into the working tail at low salience", () => {
    const permanent = Array.from({ length: CONSOLIDATED_CAPACITY }, (_, index) =>
      consolidated(`cons_${String(index + 1).padStart(3, "0")}`),
    );
    const result = applyConsolidation(sliceOf([], permanent), [consolidated("cons_013")], ["cons_001"]);

    expect(result.consolidated.length).toBe(CONSOLIDATED_CAPACITY);
    expect(result.consolidated.some((entry) => entry.id === "cons_001")).toBe(false);
    const demoted = result.working.at(-1);
    expect(demoted?.id).toBe("cons_001_demoted");
    expect(demoted?.fact).toBe("content cons_001");
    expect(demoted?.salience).toBeLessThan(0.3);
  });

  it("demotes the oldest rather than dropping it when retirement frees too little", () => {
    const permanent = Array.from({ length: CONSOLIDATED_CAPACITY }, (_, index) =>
      consolidated(`cons_${String(index + 1).padStart(3, "0")}`),
    );
    const result = applyConsolidation(
      sliceOf([], permanent),
      [consolidated("cons_013"), consolidated("cons_014")],
      [],
    );

    expect(result.consolidated.length).toBe(CONSOLIDATED_CAPACITY);
    expect(result.consolidated.map((entry) => entry.id)).toEqual(
      permanent.slice(2).map((entry) => entry.id).concat(["cons_013", "cons_014"]),
    );
    expect(result.working.map((entry) => entry.id)).toEqual(["cons_001_demoted", "cons_002_demoted"]);
  });
});
