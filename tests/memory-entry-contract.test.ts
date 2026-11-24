import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DAY_CYCLE_TICKS } from "../src/sim/clock";
import { applyConsolidation } from "../src/sim/consolidate";
import { resolveWhisper } from "../src/sim/gossip";
import {
  emptySlice,
  rememberEntry,
  sampleInherited,
  type ConsolidatedEntry,
  type MemoryEntry,
  type MemorySlice,
} from "../src/sim/memory";
import { percolationPass } from "../src/sim/outside";
import { createRng } from "../src/sim/rng";
import type { CreatureState, WorldState } from "../src/sim/types";
import { memoryFor } from "../src/game";

function inRange(entry: MemoryEntry): boolean {
  return (
    Number.isFinite(entry.salience) &&
    entry.salience >= 0 &&
    entry.salience <= 1 &&
    Number.isFinite(entry.valence) &&
    entry.valence >= -1 &&
    entry.valence <= 1
  );
}

function creature(id: string): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 0, y: 0 },
    palette: [],
    mask: [],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function world(tick: number): WorldState {
  return {
    tick,
    gv: 0,
    stage: 0,
    creatures: { a: creature("a"), b: creature("b") },
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 42,
    silent: false,
  };
}

function consolidated(id: string): ConsolidatedEntry {
  return {
    id,
    content: `content ${id}`,
    derivedFrom: [`evt_${id}`],
    consolidatedAt: "tick_1",
    perspectiveNote: null,
  };
}

describe("R5.8 · every working memory entry carries salience 0..1 and valence -1..1", () => {
  it("memoryFor keeps the caller's valence inside the unit range", () => {
    for (const valence of [-1, -0.5, 0, 0.5, 1]) {
      expect(inRange(memoryFor("gazer_01", "fact", 1, valence))).toBe(true);
    }
  });

  it("rememberEntry appends an in-range entry unchanged", () => {
    const slice = rememberEntry(emptySlice(), memoryFor("gazer_01", "fact", 1, 0.9));
    expect(slice.working).toHaveLength(1);
    expect(slice.working.every(inRange)).toBe(true);
  });

  it("an inherited memory stays in range", () => {
    const parent: MemorySlice = { working: [memoryFor("p", "fact", 1, 0.4)], consolidated: [] };
    const child = sampleInherited("p", parent, createRng(1, "inherit"));
    expect(child).not.toBeNull();
    if (child !== null) {
      expect(inRange(child)).toBe(true);
    }
  });

  it("a whispered memory keeps the range it was born with", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (worldSeed, valence, salience) => {
          const entry: MemoryEntry = {
            id: "mem_1",
            atTick: 1,
            wallClock: "tick_1",
            fact: "the player fed me",
            witnessed: "witnessed",
            source: null,
            distortion: null,
            salience,
            valence,
          };
          const result = resolveWhisper({
            sender: creature("s"),
            receiver: creature("r"),
            entry,
            worldSeed,
          });
          expect(result).not.toBeNull();
          if (result !== null) {
            expect(inRange(result)).toBe(true);
          }
        },
      ),
    );
  });

  it("a demoted consolidated entry returns as an in-range working entry", () => {
    const permanent = Array.from({ length: 13 }, (_, index) => consolidated(`cons_${index}`));
    const next = applyConsolidation({ working: [], consolidated: permanent }, [], []);
    expect(next.working.length).toBe(1);
    expect(next.working.every(inRange)).toBe(true);
  });

  it("percolated outside memories stay in range across days", () => {
    let memories: Readonly<Record<string, MemorySlice>> = {};
    for (let day = 0; day < 30; day += 1) {
      const result = percolationPass(world(day * DAY_CYCLE_TICKS), memories);
      memories = result.memories;
    }
    const entries = Object.values(memories).flatMap((slice) => slice.working);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(inRange)).toBe(true);
  });
});