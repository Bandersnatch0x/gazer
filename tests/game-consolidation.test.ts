import { describe, expect, it } from "vitest";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { MemorySlice } from "../src/sim/memory";
import { MAX_DRIFT } from "../src/sim/genome";
import { CONSOLIDATION_INTERVAL_TICKS, consolidationPass, detectDeaths, ontologyShiftFor } from "../src/game";

function creature(id: string, overrides: Partial<CreatureState> = {}): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
    behavior: "idle",
    trait: null,
    position: { x: 5, y: 5 },
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: ["########"],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 1,
      lineage: ["seed_alpha"],
      base: "you are a small one-eyed creature",
      traits: { curiosity: 0.5, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias: 0.15,
    },
    ...overrides,
  };
}

function worldWith(tick: number, ...creatures: CreatureState[]): WorldState {
  return {
    tick,
    gv: 0,
    stage: 0,
    creatures: Object.fromEntries(creatures.map((entry) => [entry.id, entry])),
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
}

function entry(id: string, salience: number, valence: number): import("../src/sim/memory").MemoryEntry {
  return {
    id,
    atTick: 10,
    wallClock: "00:00:10",
    fact: `fact ${id}`,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience,
    valence,
  };
}

describe("consolidation pass", () => {
  it("turns the top working memories into permanent self-knowledge", () => {
    const world = worldWith(60, creature("gazer_01"));
    const memories: Record<string, MemorySlice> = {
      gazer_01: {
        working: [entry("mem_a", 0.3, 0.2), entry("mem_b", 0.9, -1), entry("mem_c", 0.5, 0.8)],
        consolidated: [],
      },
      gazer_02: { working: [], consolidated: [] },
      gazer_03: { working: [], consolidated: [] },
    };
    const result = consolidationPass(world, memories);
    expect(result.consolidatedCount).toBe(2);
    const permanent = result.memories["gazer_01"]?.consolidated ?? [];
    expect(permanent.length).toBe(2);
    // The two strongest pulls (salience * (1 + |valence|)) win: mem_b then mem_c.
    expect(permanent.map((item) => item.derivedFrom[0])).toEqual(["mem_b", "mem_c"]);
    expect(permanent.every((item) => item.id.startsWith("cons_"))).toBe(true);
    // Nothing is deleted: the working layer keeps its entries.
    expect(result.memories["gazer_01"]?.working.length).toBe(3);
  });

  it("grows the genome drift by one fragment per pass, capped at MAX_DRIFT", () => {
    const world = worldWith(60, creature("gazer_01"));
    const memories: Record<string, MemorySlice> = {
      gazer_01: { working: [entry("mem_a", 0.5, 0.5)], consolidated: [] },
      gazer_02: { working: [], consolidated: [] },
      gazer_03: { working: [], consolidated: [] },
    };
    const result = consolidationPass(world, memories);
    const drift = result.world.creatures["gazer_01"]?.genome?.drift ?? [];
    expect(drift.length).toBe(1);
    expect(drift[0]).toContain("tick 60");

    const full = creature("gazer_01", {
      genome: {
        ...creature("gazer_01").genome!,
        drift: Array.from({ length: MAX_DRIFT }, (_, index) => `old ${index}`),
      },
    });
    const again = consolidationPass(worldWith(120, full), memories);
    const capped = again.world.creatures["gazer_01"]?.genome?.drift ?? [];
    expect(capped.length).toBe(MAX_DRIFT);
    expect(capped[MAX_DRIFT - 1]).toContain("tick 120");
    expect(capped[0]).toBe("old 1");
  });

  it("leaves creatures without working memories or genomes untouched", () => {
    const { genome: _omitted, ...noGenome } = creature("gazer_01");
    const world = worldWith(60, noGenome, creature("gazer_02"));
    const memories: Record<string, MemorySlice> = {
      gazer_01: { working: [entry("mem_a", 0.5, 0.5)], consolidated: [] },
      gazer_02: { working: [], consolidated: [] },
      gazer_03: { working: [], consolidated: [] },
    };
    const result = consolidationPass(world, memories);
    expect(result.consolidatedCount).toBe(1);
    expect(result.memories["gazer_01"]?.consolidated.length).toBe(1);
    // No genome means no drift to grow, but the consolidation still happened.
    expect(result.world.creatures["gazer_01"]?.genome).toBeUndefined();
    expect(result.world).toBe(world);
  });

  it("runs on the minute boundary, not every tick", () => {
    expect(CONSOLIDATION_INTERVAL_TICKS % 60).toBe(0);
    expect(120 % CONSOLIDATION_INTERVAL_TICKS).toBe(0);
    expect(61 % CONSOLIDATION_INTERVAL_TICKS).not.toBe(0);
  });
});

describe("death detection", () => {
  it("reports a new death with its cause and never reports an old one", () => {
    const before = worldWith(10, creature("gazer_01"), creature("gazer_02"));
    const after = worldWith(11,
      creature("gazer_01", {
        behavior: "dead",
        stats: { hunger: 0, hygiene: 10, happiness: 10, energy: 10 },
      }),
      creature("gazer_02"),
    );
    expect(detectDeaths(before.creatures, after.creatures)).toEqual([
      { creatureId: "gazer_01", cause: "starvation" },
    ]);
    expect(detectDeaths(after.creatures, after.creatures)).toEqual([]);
    expect(detectDeaths(before.creatures, before.creatures)).toEqual([]);
  });

  it("calls a death without starvation neglect", () => {
    const before = worldWith(10, creature("gazer_01"));
    const after = worldWith(11,
      creature("gazer_01", { behavior: "dead", stats: { hunger: 5, hygiene: 0, happiness: 0, energy: 0 } }),
    );
    expect(detectDeaths(before.creatures, after.creatures)).toEqual([
      { creatureId: "gazer_01", cause: "neglect" },
    ]);
  });
});

describe("ontology shift table", () => {
  it("maps the stage ladder onto entity kinds, append-only and forward", () => {
    const shift = ontologyShiftFor(1, 2, 42);
    expect(shift).toEqual({
      atStage: 2,
      entity: "creature",
      from: "pet",
      to: "organism",
      evidence: "gv 42 crossed the stage 1 boundary",
    });
    expect(ontologyShiftFor(2, 3, 61).to).toBe("observer");
    expect(ontologyShiftFor(3, 4, 81).to).toBe("record");
    expect(ontologyShiftFor(0, 1, 20).from).toBe("pet");
  });
});
