import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyHatchChoice, DEFAULT_MASK, MAX_EGGS, pairWillingness, step, WILLING_AT } from "../src/sim/engine";
import type { CreatureState, HatchChoice, WorldState } from "../src/sim/types";

function creature(id: string, happiness = 80): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 2, y: 2 },
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function world(creatures: Record<string, CreatureState>): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures,
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 11,
    silent: true,
  };
}

describe("willingness", () => {
  it("is derived from happiness and clamped", () => {
    const happy = step(world({ a: creature("a", 100) }), { kind: "tick" });
    const sad = step(world({ b: creature("b", 0) }), { kind: "tick" });
    expect(happy.creatures["a"]?.willingness).toBeGreaterThan(WILLING_AT);
    expect(sad.creatures["b"]?.willingness).toBeLessThan(WILLING_AT);
    expect(happy.creatures["a"]?.willingness).toBeLessThanOrEqual(100);
    expect(sad.creatures["b"]?.willingness).toBeGreaterThanOrEqual(0);
  });

  it("takes the lower of the two, never the average", () => {
    const a = { ...creature("a"), willingness: 95 };
    const b = { ...creature("b"), willingness: 20 };
    expect(pairWillingness(a, b)).toBe(20);
  });
});

describe("eggs", () => {
  it("lays an egg between the two parents and refuses past the cap", () => {
    let state = world({ a: creature("a"), b: creature("b") });
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    expect(state.eggs).toHaveLength(1);
    expect(state.eggs[0]?.at).toEqual({ x: 2, y: 2 });

    for (let i = 0; i < 5; i += 1) {
      state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: false });
    }
    // Cap retuned 4 → 3 (lead ruling 2026-11-12; ticket 0006 Log has the
    // birth-rate rationale). The assertion pins whatever MAX_EGGS is.
    expect(state.eggs).toHaveLength(MAX_EGGS);
  });

  it("hatches only from an egg that exists", () => {
    const state = world({ a: creature("a") });
    const ghost = step(state, {
      kind: "hatchFromEgg",
      eggId: "egg_none",
      creatureId: "c",
      at: { x: 3, y: 3 },
      species: "gazerling",
      choice: "immediate",
    });
    expect(ghost).toBe(state);
    expect(ghost.creatures["c"]).toBeUndefined();
  });

  it("consumes the egg and carries the chosen temperament", () => {
    let state = world({ a: creature("a"), b: creature("b") });
    state = step(state, { kind: "layEgg", parentA: "a", parentB: "b", forced: true });
    const eggId = state.eggs[0]?.id ?? "";
    const hatched = step(state, {
      kind: "hatchFromEgg",
      eggId,
      creatureId: "c",
      at: { x: 4, y: 4 },
      species: "gazerling",
      choice: "self",
    });
    expect(hatched.eggs).toHaveLength(0);
    expect(hatched.creatures["c"]?.genome?.secrets).toContain("it hatched without being asked");
  });
});

describe("hatch choice temperament", () => {
  const choices: readonly HatchChoice[] = ["immediate", "warm", "still", "self"];

  it("always returns a genome with an advanced generation and lineage", () => {
    fc.assert(
      fc.property(fc.constantFrom(...choices), fc.string({ minLength: 1 }), (choice, id) => {
        const genome = applyHatchChoice(undefined, choice, id);
        expect(genome.id).toBe(id);
        expect(genome.generation).toBe(2);
        expect(genome.lineage.length).toBeGreaterThan(0);
        for (const value of Object.values(genome.traits)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 40 },
    );
  });

  it("makes warm hatch more curious and still hatch more loyal", () => {
    const neutral = applyHatchChoice(undefined, "immediate", "x");
    const warm = applyHatchChoice(undefined, "warm", "x");
    const still = applyHatchChoice(undefined, "still", "x");
    expect(warm.traits.curiosity).toBeGreaterThan(neutral.traits.curiosity);
    expect(still.traits.loyalty).toBeGreaterThan(neutral.traits.loyalty);
  });
});

describe("naming and movement", () => {
  it("stores a trimmed name and clamps a move into the diamond", () => {
    let state = world({ a: creature("a") });
    state = step(state, { kind: "name", creatureId: "a", name: "  Miri  " });
    expect(state.creatures["a"]?.name).toBe("Miri");

    state = step(state, { kind: "move", creatureId: "a", at: { x: 99, y: -4 } });
    expect(state.creatures["a"]?.position).toEqual({ x: 14, y: 1 });
  });
});

describe("courtship", () => {
  it("lays one egg for a willing adjacent pair, and only one", async () => {
    const { courtshipStep, COURTSHIP_TICKS } = await import("../src/sim/engine");
    const warm = { ...creature("a", 100), willingness: 95 };
    const partner = { ...creature("b", 100), willingness: 95, position: { x: 3, y: 2 } };
    let state = world({ a: warm, b: partner });

    for (let index = 0; index < COURTSHIP_TICKS + 4; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs).toHaveLength(1);
    expect(state.eggs[0]?.forced).toBe(false);
  });

  it("walks a willing pair together before laying", async () => {
    const { courtshipStep } = await import("../src/sim/engine");
    const a = { ...creature("a", 100), willingness: 95, position: { x: 1, y: 1 } };
    const b = { ...creature("b", 100), willingness: 95, position: { x: 6, y: 6 } };
    let state = world({ a, b });

    state = courtshipStep(state);
    expect(state.eggs).toHaveLength(0);
    expect(state.creatures["a"]?.position.x).toBeGreaterThan(1);

    for (let index = 0; index < 30; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs.length).toBeGreaterThanOrEqual(1);
  });

  it("never lays an egg from an unwilling pair", async () => {
    const { courtshipStep } = await import("../src/sim/engine");
    const a = { ...creature("a", 0), willingness: 5 };
    const b = { ...creature("b", 0), willingness: 5, position: { x: 3, y: 2 } };
    let state = world({ a, b });
    for (let index = 0; index < 20; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs).toHaveLength(0);
  });
});

describe("full loop", () => {
  it("feeds a pair to willingness, then produces an egg within a few ticks", async () => {
    const { courtshipStep } = await import("../src/sim/engine");
    const a = creature("a", 80);
    const b = { ...creature("b", 80), position: { x: 4, y: 3 } };
    let state = world({ a, b });

    for (const id of ["a", "b"]) {
      state = step(state, { kind: "feed", creatureId: id });
      state = step(state, { kind: "tick" });
      state = step(state, { kind: "feed", creatureId: id });
      state = step(state, { kind: "tick" });
    }
    expect(state.creatures["a"]?.willingness).toBeGreaterThanOrEqual(WILLING_AT);
    expect(state.creatures["b"]?.willingness).toBeGreaterThanOrEqual(WILLING_AT);

    for (let index = 0; index < 40; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs.length).toBeGreaterThanOrEqual(1);
  });
});
