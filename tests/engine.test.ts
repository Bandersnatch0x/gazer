import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DEFAULT_MASK, step } from "../src/sim/engine";
import type { SimEvent } from "../src/sim/engine";
import type { CreatureState, WorldState } from "../src/sim/types";
import { stageForGv } from "../src/sim/types";

function creature(id: string): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 1, y: 1 },
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function base(): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures: { "gazer_01": creature("gazer_01") },
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 7,
    silent: true,
  };
}

const simEvent: fc.Arbitrary<SimEvent> = fc.oneof(
  fc.constant({ kind: "tick" } as SimEvent),
  fc.constant({ kind: "feed", creatureId: "gazer_01" } as SimEvent),
  fc.constant({ kind: "clean", creatureId: "gazer_01" } as SimEvent),
  fc.constant({ kind: "play", creatureId: "gazer_01" } as SimEvent),
  fc.integer({ min: -20, max: 20 }).map((delta): SimEvent => ({ kind: "gv", delta })),
  fc.constant({ kind: "apply_effect", effect: { kind: "desaturate", amount: 0.1 } } as SimEvent),
  fc.constant({
    kind: "apply_effect",
    effect: { kind: "relabel_ui", target: "feed", text: "Feed me" },
  } as SimEvent),
);

describe("deterministic simulation core", () => {
  it("produces the same state for the same event sequence, twice", () => {
    fc.assert(
      fc.property(fc.array(simEvent, { maxLength: 40 }), (events) => {
        const run = (): WorldState => events.reduce(step, base());
        expect(run()).toEqual(run());
      }),
      { numRuns: 120 },
    );
  });

  it("never mutates the input state", () => {
    fc.assert(
      fc.property(simEvent, (event) => {
        const start = base();
        const frozen = JSON.stringify(start);
        step(start, event);
        expect(JSON.stringify(start)).toBe(frozen);
      }),
      { numRuns: 120 },
    );
  });

  it("keeps gv inside 0..100 and the stage consistent with it", () => {
    fc.assert(
      fc.property(fc.array(simEvent, { maxLength: 40 }), (events) => {
        const end = events.reduce(step, base());
        expect(end.gv).toBeGreaterThanOrEqual(0);
        expect(end.gv).toBeLessThanOrEqual(100);
        expect(end.stage).toBe(stageForGv(end.gv));
      }),
      { numRuns: 120 },
    );
  });

  it("never advances the tick on a non-tick event", () => {
    fc.assert(
      fc.property(
        simEvent.filter((event) => event.kind !== "tick"),
        (event) => {
          expect(step(base(), event).tick).toBe(0);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("refuses to hatch a creature id that already exists", () => {
    const start = base();
    const again = step(start, { kind: "hatch", creatureId: "gazer_01", at: { x: 9, y: 9 }, species: "x" });
    expect(again).toBe(start);
  });
});

describe("creature movement", () => {
  it("keeps every creature inside the visible diamond", () => {
    fc.assert(
      fc.property(fc.array(simEvent, { maxLength: 60 }), (events) => {
        const end = events.reduce(step, base());
        for (const creature of Object.values(end.creatures)) {
          expect(creature.position.x).toBeGreaterThanOrEqual(1);
          expect(creature.position.x).toBeLessThanOrEqual(14);
          expect(creature.position.y).toBeGreaterThanOrEqual(1);
          expect(creature.position.y).toBeLessThanOrEqual(14);
        }
      }),
      { numRuns: 80 },
    );
  });

  it("moves deterministically and actually moves over time", () => {
    const run = (): WorldState => {
      let world = base();
      for (let index = 0; index < 30; index += 1) {
        world = step(world, { kind: "tick" });
      }
      return world;
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);
    expect(first.creatures["gazer_01"]?.position).not.toEqual(
      base().creatures["gazer_01"]?.position,
    );
  });

  it("does not move a sleeping or dead creature", () => {
    const sleeping: WorldState = {
      ...base(),
      creatures: {
        "gazer_01": {
          ...creature("gazer_01"),
          behavior: "sleeping",
          stats: { hunger: 90, hygiene: 90, happiness: 90, energy: 5 },
        },
      },
    };
    const after = step(sleeping, { kind: "tick" });
    expect(after.creatures["gazer_01"]?.position).toEqual(
      sleeping.creatures["gazer_01"]?.position,
    );
  });
});

describe("stage thresholds", () => {
  it("maps gv to the documented stages", () => {
    expect(stageForGv(0)).toBe(0);
    expect(stageForGv(19)).toBe(0);
    expect(stageForGv(20)).toBe(1);
    expect(stageForGv(40)).toBe(2);
    expect(stageForGv(60)).toBe(3);
    expect(stageForGv(80)).toBe(4);
    expect(stageForGv(100)).toBe(4);
  });
});
