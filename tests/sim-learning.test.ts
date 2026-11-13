import { describe, expect, it } from "vitest";
import { DEFAULT_MASK, step } from "../src/sim/engine";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { PromptGenome } from "../src/sim/genome";
import { PREDICTION_DRIFT, predictedTile } from "../src/sim/genome";
import { emptySlice, type MemoryEntry, type MemorySlice } from "../src/sim/memory";

function genome(id: string, overrides: Partial<PromptGenome> = {}): PromptGenome {
  return {
    id,
    generation: 1,
    lineage: ["seed_alpha"],
    base: `soul of ${id}`,
    traits: { curiosity: 0.9, loyalty: 0.2, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
    drift: [],
    secrets: [],
    manualPool: [],
    temperatureBias: 0,
    distortionBias: 0.15,
    ...overrides,
  };
}

function creature(id: string, withGenome = true): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 2, y: 2 },
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 90,
    courtshipTicks: 0,
    ...(withGenome ? { genome: genome(id) } : {}),
  };
}

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    ...overrides,
  };
}

function pairWorld(): WorldState {
  return world({
    creatures: {
      a: creature("a"),
      b: { ...creature("b"), position: { x: 3, y: 2 } },
    },
  });
}

function memory(id: string, atTick: number): MemoryEntry {
  return {
    id,
    atTick,
    wallClock: "10:00:00",
    fact: `the keeper acted at tick ${atTick}`,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence: 0.8,
  };
}

describe("P3: the egg carries both parents' genomes", () => {
  it("writes both genomes at lay time and hybridizes them at hatch", () => {
    let state = pairWorld();
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    const egg = state.eggs[0];
    expect(egg?.parentGenomes?.parentA?.id).toBe("a");
    expect(egg?.parentGenomes?.parentB?.id).toBe("b");

    state = step(state, {
      kind: "hatchFromEgg",
      eggId: egg?.id ?? "",
      creatureId: "child",
      at: egg?.at ?? { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    const child = state.creatures["child"];
    expect(child).toBeDefined();
    // Continuation, not a fresh seed_alpha: the lineage names both parents.
    expect(child?.genome?.lineage).toContain("a");
    expect(child?.genome?.lineage).toContain("b");
    // seed_alpha fallback would stop at generation 2; a hybrid hatched through
    // the choice lands one higher.
    expect(child?.genome?.generation).toBe(3);
    expect(child?.genome?.id).toBe("child");
  });

  it("is deterministic for the same world and seed", () => {
    const run = (): WorldState => {
      let state = pairWorld();
      state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
      const egg = state.eggs[0];
      return step(state, {
        kind: "hatchFromEgg",
        eggId: egg?.id ?? "",
        creatureId: "child",
        at: { x: 2, y: 2 },
        species: "gazerling",
        choice: "still",
      });
    };
    expect(run()).toEqual(run());
  });

  it("keeps the parents' drift and secrets through the hatch choice", () => {
    let state = world({
      creatures: {
        a: {
          ...creature("a"),
          genome: genome("a", { drift: ["fears the lid"], secrets: ["it counted us"] }),
        },
        b: { ...creature("b"), position: { x: 3, y: 2 } },
      },
    });
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    state = step(state, {
      kind: "hatchFromEgg",
      eggId: state.eggs[0]?.id ?? "",
      creatureId: "child",
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(state.creatures["child"]?.genome?.drift).toContain("fears the lid");
    expect(state.creatures["child"]?.genome?.secrets).toContain("it counted us");
  });

  it("falls back to the single parent genome when only one exists", () => {
    let state = world({
      creatures: { a: creature("a") },
    });
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "ghost", forced: false });
    state = step(state, {
      kind: "hatchFromEgg",
      eggId: state.eggs[0]?.id ?? "",
      creatureId: "child",
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(state.creatures["child"]?.genome?.lineage).toContain("a");
    expect(state.creatures["child"]?.genome?.generation).toBe(2);
  });
});

describe("parentLinks (frozen shape for the D-stream tree view)", () => {
  it("records both parent ids on the hatched creature", () => {
    let state = pairWorld();
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: true });
    state = step(state, {
      kind: "hatchFromEgg",
      eggId: state.eggs[0]?.id ?? "",
      creatureId: "child",
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "warm",
    });
    expect(state.creatures["child"]?.parentLinks).toEqual({ parentA: "a", parentB: "b" });
    expect(state.creatures["child"]?.genome?.lineage).toContain("a");
    expect(state.creatures["child"]?.genome?.lineage).toContain("b");
  });
});

describe("born holding memories it never saw", () => {
  it("draws one memory from each parent into the egg and hatches it", () => {
    const sliceA: MemorySlice = {
      ...emptySlice(),
      working: [memory("a1", 1), memory("a2", 2)],
    };
    const sliceB: MemorySlice = {
      ...emptySlice(),
      working: [memory("b1", 3)],
    };
    let state = pairWorld();
    state = { ...state, memories: { a: sliceA, b: sliceB } };
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    const egg = state.eggs[0];
    const inherited = egg?.inheritedMemories ?? [];
    expect(inherited).toHaveLength(2);
    const sources = new Set(inherited.map((entry) => entry.source));
    expect(sources).toEqual(new Set(["a", "b"]));
    for (const entry of inherited) {
      expect(entry.witnessed).toBe("heard");
    }

    state = step(state, {
      kind: "hatchFromEgg",
      eggId: egg?.id ?? "",
      creatureId: "child",
      at: { x: 2, y: 2 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(state.creatures["child"]?.genome?.inheritedMemories).toEqual(egg?.inheritedMemories);
  });

  it("is deterministic: the same world hands down the same memories", () => {
    const run = (): readonly MemoryEntry[] => {
      let state = pairWorld();
      state = {
        ...state,
        memories: {
          a: { ...emptySlice(), working: [memory("a1", 1), memory("a2", 2)] },
          b: { ...emptySlice(), working: [memory("b1", 3)] },
        },
      };
      state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
      return state.eggs[0]?.inheritedMemories ?? [];
    };
    expect(run()).toEqual(run());
  });

  it("lays an egg without memories when the parents hold none", () => {
    let state = pairWorld();
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    expect(state.eggs[0]?.inheritedMemories).toEqual([]);
  });

  it("accepts a keeper fact through the remember event", () => {
    let state = pairWorld();
    state = step(state, { kind: "remember", creatureId: "a", entry: memory("m1", 5) });
    expect(state.memories?.a?.working).toHaveLength(1);
    expect(state.memories?.a?.working[0]?.fact).toContain("tick 5");
  });
});

describe("convergence: it begins to predict you", () => {
  const feed = (state: WorldState): WorldState =>
    step(state, {
      kind: "observe",
      verb: "feed",
      targetId: "a",
      targetTile: { x: 2, y: 2 },
      hesitationTicks: 2,
    });

  it("stays unconverged while the keeper is noise", () => {
    let state = pairWorld();
    const verbs = ["feed", "clean", "pet", "name", "move", "stare", "feed", "clean"];
    for (const verb of verbs) {
      state = step(state, {
        kind: "observe",
        verb: verb as "feed",
        targetId: "a",
        targetTile: { x: 2, y: 2 },
        hesitationTicks: 1,
      });
    }
    expect(state.creatures["a"]?.trait).toBeNull();
    expect(state.creatures["a"]?.learning?.converged).toBe(false);
  });

  it("writes the learned trait back into the genome when it converges", () => {
    let state = pairWorld();
    for (let index = 0; index < 8; index += 1) {
      state = feed(state);
    }
    const a = state.creatures["a"];
    expect(a?.learning?.converged).toBe(true);
    expect(a?.trait).toBe("predictor");
    expect(a?.genome?.drift).toContain(PREDICTION_DRIFT);
    expect(a?.genome?.traits.watchfulness).toBeGreaterThan(0.5);
    expect(state.creatures["b"]?.learning?.converged).toBe(true);
  });

  it("convergence is irreversible and the drift line is written once", () => {
    let state = pairWorld();
    for (let index = 0; index < 8; index += 1) {
      state = feed(state);
    }
    const after = feed(feed(state));
    expect(after.creatures["a"]?.genome?.drift.filter((line) => line === PREDICTION_DRIFT)).toHaveLength(1);
    expect(after.creatures["a"]?.learning?.converged).toBe(true);
  });

  it("points a converged creature at the keeper's usual tile", () => {
    let state = pairWorld();
    for (let index = 0; index < 8; index += 1) {
      state = step(state, {
        kind: "observe",
        verb: "feed",
        targetId: "a",
        targetTile: { x: 3, y: 2 },
        hesitationTicks: 2,
      });
    }
    expect(state.creatures["a"]?.learning?.converged).toBe(true);
    expect(predictedTile(state.creatures["a"]?.learning ?? { observations: [], converged: false })).toEqual({
      x: 3,
      y: 2,
    });
  });

  it("keeps the observation window bounded", () => {
    let state = pairWorld();
    for (let index = 0; index < 30; index += 1) {
      state = step(state, {
        kind: "observe",
        verb: "feed",
        targetId: "a",
        targetTile: { x: 2, y: 2 },
        hesitationTicks: index,
      });
    }
    expect(state.creatures["a"]?.learning?.observations.length).toBeLessThanOrEqual(20);
  });

  it("never mutates the input state", () => {
    const start = pairWorld();
    const frozen = JSON.stringify(start);
    step(start, {
      kind: "observe",
      verb: "feed",
      targetId: "a",
      targetTile: { x: 2, y: 2 },
      hesitationTicks: 3,
    });
    expect(JSON.stringify(start)).toBe(frozen);
  });
});
