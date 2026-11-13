import { describe, expect, it } from "vitest";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { WorldState } from "../src/sim/types";
import {
  darkEyePairs,
  planStructure,
  scenePlan,
  tileCorruption,
  towerHeight,
  vignetteAlpha,
} from "../src/render/scene";

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 10,
    gv: 0,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: false,
    ...overrides,
  };
}

describe("scene: the stage accumulates (A3)", () => {
  it("stands the tower taller every act", () => {
    expect(towerHeight(0)).toBe(32);
    expect(towerHeight(4)).toBe(64);
    expect(towerHeight(4) - towerHeight(0)).toBe(32);
    expect(Number.isInteger(towerHeight(3))).toBe(true);
  });

  it("plans a structure with its act baked in", () => {
    const structure = { kind: "black_tower", at: { x: 5, y: 5 }, createdBy: "director" } as const;
    expect(planStructure(structure, 0).height).toBe(32);
    expect(planStructure(structure, 3).height).toBe(56);
    expect(planStructure(structure, 3).stage).toBe(3);
  });

  it("grows one more pair of dark eyes per act from stage 2", () => {
    expect(darkEyePairs(0)).toHaveLength(0);
    expect(darkEyePairs(1)).toHaveLength(0);
    expect(darkEyePairs(2)).toHaveLength(1);
    expect(darkEyePairs(3)).toHaveLength(2);
    expect(darkEyePairs(4)).toHaveLength(3);
    for (const pair of darkEyePairs(4)) {
      expect(pair.b.x).toBeGreaterThan(pair.a.x);
    }
  });

  it("breathes darker at the edges as the acts rise", () => {
    expect(vignetteAlpha(0)).toBeGreaterThan(0);
    expect(vignetteAlpha(4)).toBeGreaterThan(vignetteAlpha(0));
  });

  it("rots tiles deterministically, more with stage and decay", () => {
    expect(tileCorruption({ x: 3, y: 4 }, 1997, 0, 0.5)).toBe(0);
    const once = tileCorruption({ x: 3, y: 4 }, 1997, 2, 0.3);
    expect(tileCorruption({ x: 3, y: 4 }, 1997, 2, 0.3)).toBe(once);
    expect(tileCorruption({ x: 3, y: 4 }, 1997, 4, 0.9)).toBeGreaterThanOrEqual(once);
    expect(tileCorruption({ x: 3, y: 4 }, 1997, 4, 0.9)).toBeLessThanOrEqual(1);
    // A stage-1 world with no decay keeps most of the ground untouched.
    const clean = Array.from({ length: 16 }, (_, x) =>
      Array.from({ length: 16 }, (_, y) => tileCorruption({ x, y }, 1997, 1, 0)),
    ).flat().filter((level) => level === 0).length;
    expect(clean).toBeGreaterThan(200);
  });

  it("ships a full plan with corruption, eyes, vignette and a season", () => {
    const plan = scenePlan(
      world({
        stage: 3,
        paletteDecay: 0.4,
        structures: [{ kind: "black_tower", at: { x: 8, y: 8 }, createdBy: "director" }],
        creatures: {
          gazer_01: {
            id: "gazer_01",
            species: "gazerling",
            stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
            behavior: "idle",
            trait: null,
            position: { x: 4, y: 5 },
            palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
            mask: DEFAULT_MASK,
            hatchedAtTick: 0,
            name: null,
            willingness: 40,
            courtshipTicks: 0,
          },
        },
      }),
    );
    expect(plan.season).toBe("winter");
    expect(plan.eyePairs).toHaveLength(2);
    expect(plan.vignette).toBe(vignetteAlpha(3));
    expect(plan.tiles.every((tile) => tile.corrupt >= 0 && tile.corrupt <= 1)).toBe(true);
    expect(plan.tiles.some((tile) => tile.corrupt > 0)).toBe(true);
    const tower = plan.objects.find((object) => object.kind === "structure");
    if (tower?.kind !== "structure") {
      throw new Error("scene lost the black tower");
    }
    expect(tower.height).toBe(56);
    // The creature still stands on its tile centre.
    const creature = plan.objects.find((object) => object.kind === "creature");
    if (creature?.kind !== "creature") {
      throw new Error("scene lost the creature");
    }
    expect(creature.center).toEqual({ x: 152, y: 70 });
  });
});
