import { describe, expect, it } from "vitest";
import { familyTreeNodes } from "../src/game";
import type { CreatureState, WorldState } from "../src/sim/types";

/**
 * Integration tests for the family-tree assembly (ticket 0004 §A): the frozen
 * E-stream shape (`creature.parentLinks`) becomes panel nodes, dead creatures
 * stay listed, and the inherited-trait mark follows descendants' genomes.
 */

function creature(overrides: Partial<CreatureState> & { id: string }): CreatureState {
  return {
    species: "gazer",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 5, y: 5 },
    palette: ["#000000"],
    mask: ["#000000"],
    hatchedAtTick: 0,
    name: null,
    willingness: 100,
    courtshipTicks: 0,
    ...overrides,
  } as CreatureState;
}

function worldOf(creatures: CreatureState[]): WorldState {
  return {
    creatures: Object.fromEntries(creatures.map((c) => [c.id, c])),
  } as unknown as WorldState;
}

describe("familyTreeNodes (ticket 0004 §A)", () => {
  it("lists seed creatures without parent links and marks them alive", () => {
    const world = worldOf([creature({ id: "gazer_01" }), creature({ id: "gazer_02" })]);
    const nodes = familyTreeNodes(world);
    const first = nodes[0]!;
    expect(nodes).toHaveLength(2);
    expect(first).toEqual({ id: "gazer_01", name: null, alive: true });
    expect("parentLinks" in first).toBe(false);
  });

  it("keeps dead creatures and passes the player-given name through", () => {
    const world = worldOf([
      creature({ id: "gazer_01", name: "moss", behavior: "dead" }),
      creature({ id: "gazer_02", name: "ash" }),
    ]);
    const nodes = familyTreeNodes(world);
    const first = nodes[0]!;
    expect(first).toEqual({ id: "gazer_01", name: "moss", alive: false });
  });

  it("threads parent links through so the panel can draw depth", () => {
    const world = worldOf([
      creature({ id: "gazer_01" }),
      creature({ id: "gazer_02" }),
      creature({
        id: "gazer_03",
        parentLinks: { parentA: "gazer_01", parentB: "gazer_02" },
      }),
      creature({ id: "gazer_04", parentLinks: { parentA: "gazer_03" } }),
    ]);
    const nodes = familyTreeNodes(world);
    expect(nodes[2]!.parentLinks).toEqual({ parentA: "gazer_01", parentB: "gazer_02" });
    expect(nodes[3]!.parentLinks).toEqual({ parentA: "gazer_03" });
  });

  it("marks a dead ancestor whose descendants still carry genomes", () => {
    const world = worldOf([
      creature({ id: "gazer_01", behavior: "dead" }),
      creature({
        id: "gazer_02",
        parentLinks: { parentA: "gazer_01" },
        genome: {
          id: "genome_2",
          generation: 2,
          lineage: ["seed_alpha"],
          base: "child",
          traits: { curiosity: 0.6, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
          drift: [],
          secrets: [],
          manualPool: [],
          temperatureBias: 0,
          distortionBias: 0,
        },
      }),
    ]);
    const nodes = familyTreeNodes(world);
    expect(nodes[0]!).toEqual({
      id: "gazer_01",
      name: null,
      alive: false,
      traitsInherited: true,
    });
  });

  it("leaves a childless dead creature unmarked", () => {
    const world = worldOf([creature({ id: "gazer_01", behavior: "dead" })]);
    const nodes = familyTreeNodes(world);
    const first = nodes[0]!;
    expect("traitsInherited" in first).toBe(false);
  });

  it("marks through deep chains and never cycles", () => {
    const world = worldOf([
      creature({ id: "a", behavior: "dead" }),
      creature({ id: "b", parentLinks: { parentA: "a" } }),
      creature({ id: "c", parentLinks: { parentA: "b" } }),
      creature({
        id: "d",
        parentLinks: { parentA: "c" },
        genome: {
          id: "genome_d",
          generation: 4,
          lineage: ["seed_alpha"],
          base: "deep child",
          traits: { curiosity: 0.6, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
          drift: [],
          secrets: [],
          manualPool: [],
          temperatureBias: 0,
          distortionBias: 0,
        },
      }),
    ]);
    const nodes = familyTreeNodes(world);
    expect(nodes[0]!.traitsInherited).toBe(true);
  });

  it("is deterministic: the same world yields the same nodes", () => {
    const world = worldOf([
      creature({ id: "gazer_01", name: "moss" }),
      creature({ id: "gazer_02", parentLinks: { parentA: "gazer_01" } }),
    ]);
    expect(familyTreeNodes(world)).toEqual(familyTreeNodes(world));
  });
});
