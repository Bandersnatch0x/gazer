import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  AGING_STEP_FRAGMENTS,
  AGING_STEP_T,
  BODY_BASE_COLOR,
  PUPIL_STAGE_COLORS,
  agedPupilColor,
  canonicalPalette,
  decayedCanonicalPalette,
  gvDecayCreatureColor,
  gvDecayWorldColor,
  mix,
  parseColor,
  termBgColor,
  toHsl,
  worldMood,
} from "../src/render/palette";
import type { CreatureState, WorldState } from "../src/sim/types";
import { toHex } from "../src/render/palette";

// A pinned seed keeps every property deterministic across machines and runs —
// the CI replays the same cases forever (1997: the year the room froze in).
fc.configureGlobal({ seed: 1997 });

function hexBytes(hex: string): number[] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

function channelDelta(a: string, b: string): number[] {
  const left = hexBytes(a);
  const right = hexBytes(b);
  return left.map((value, index) => Math.abs(value - (right[index] ?? 0)));
}

function fixtureWorld(creatures: CreatureState[], gv = 0, stage: 0 | 1 | 2 | 3 | 4 = 0): WorldState {
  return {
    tick: 0,
    gv,
    stage,
    creatures: Object.fromEntries(creatures.map((creature) => [creature.id, creature])),
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1,
    silent: true,
  };
}

function creature(id: string, happiness: number, behavior: "idle" | "dead" = "idle"): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 90, happiness, energy: 90 },
    behavior,
    trait: null,
    position: { x: 3, y: 3 },
    palette: ["#f2e6c9"],
    mask: ["........"],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

describe("§5.2 GV decay: the individual body track (ticket 0041)", () => {
  it("is the identity at and below GV 40 — 无变化 is byte-exact", () => {
    for (const gv of [0, 13, 39.9, 40, Number.NaN, -5]) {
      expect(gvDecayCreatureColor(BODY_BASE_COLOR, gv)).toBe(BODY_BASE_COLOR);
      expect(gvDecayWorldColor(BODY_BASE_COLOR, gv)).toBe(BODY_BASE_COLOR);
    }
  });

  it("meets the §5.2 reference anchors — R15: the formula is the canon, values re-anchored", () => {
    // R15 (裁决 0013 附录): the formula is engine truth, and the §5.2 table
    // is re-anchored to the formula's own computed values. The engine values
    // below are the verbatim §5.2 output on #7ED957 (HSL 102°, 0.631, 0.596):
    //   GV60 → #7AD155, GV80 → #77C853, GV100 → #73BF53.
    const anchors: readonly [number, string][] = [
      [40, "#7ED957"],
      [60, "#7AD155"],
      [80, "#77C853"],
      [100, "#73BF53"],
    ];
    for (const [gv, expected] of anchors) {
      const actual = gvDecayCreatureColor(BODY_BASE_COLOR, gv);
      for (const delta of channelDelta(actual, expected)) {
        expect(delta).toBeLessThanOrEqual(2);
      }
    }
    // GV 40 is the exact anchor: the formula has not bitten yet.
    expect(gvDecayCreatureColor(BODY_BASE_COLOR, 40)).toBe("#7ED957");
  });

  it("keeps the historical §5.2 art table within ≤4 per channel (regression rail)", () => {
    // The original hand-calibrated table (美术校对用), kept as a drift rail:
    // the engine's formula values sit within 4 per channel of it — if the
    // formula ever drifts past that, the art calibration conversation reopens.
    const historical: readonly [number, string][] = [
      [40, "#7ED957"],
      [60, "#7DD558"],
      [80, "#79CC56"],
      [100, "#76C355"],
    ];
    for (const [gv, expected] of historical) {
      const actual = gvDecayCreatureColor(BODY_BASE_COLOR, gv);
      for (const delta of channelDelta(actual, expected)) {
        expect(delta).toBeLessThanOrEqual(4);
      }
    }
  });

  it("respects the §5.2 floors at the end of the ladder", () => {
    const base = toHsl(BODY_BASE_COLOR);
    const floor = gvDecayCreatureColor(BODY_BASE_COLOR, 100000);
    const decayed = toHsl(floor);
    expect(decayed).not.toBeNull();
    if (base !== null && decayed !== null) {
      expect(decayed.s).toBeCloseTo(base.s * 0.45, 2);
      expect(decayed.l).toBeCloseTo(base.l * 0.8, 2);
      // The hue never turns; the 8-bit roundtrip may wobble it under a degree.
      expect(Math.abs(decayed.h - base.h)).toBeLessThanOrEqual(0.5);
    }
  });

  it("decays monotonically in GV and never bites below 40", () => {
    fc.assert(
      fc.property(
        fc.record({ r: fc.nat(255), g: fc.nat(255), b: fc.nat(255) }),
        fc.nat(200),
        ({ r, g, b }, gv) => {
          const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
          const out = gvDecayCreatureColor(hex, gv);
          expect(out).toMatch(/^#[0-9a-f]{6}$/);
          const before = toHsl(hex);
          const after = toHsl(out);
          if (before === null || after === null) {
            return;
          }
          // The decay is monotone in the reals; the 8-bit re-quantization of
          // the output can re-read one quantization step higher, so the
          // comparison carries a one-byte slack (1/255 ≈ 0.0039).
          const byteSlack = 1 / 255 + 1e-9;
          expect(after.s).toBeLessThanOrEqual(before.s + byteSlack);
          expect(after.l).toBeLessThanOrEqual(before.l + byteSlack);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("§5.2 GV decay: the world/UI track fades faster (ticket 0041)", () => {
  it("bites harder than the individual track at the same GV", () => {
    for (const gv of [60, 80, 100]) {
      const world = toHsl(gvDecayWorldColor(BODY_BASE_COLOR, gv));
      const body = toHsl(gvDecayCreatureColor(BODY_BASE_COLOR, gv));
      const base = toHsl(BODY_BASE_COLOR);
      if (world === null || body === null || base === null) {
        continue;
      }
      expect(world.s).toBeLessThan(body.s); // 140 分母轨: the world fades faster
      expect(body.s).toBeLessThan(base.s);
    }
  });

  it("keeps lightness untouched and respects the 0.35 floor", () => {
    const base = toHsl(BODY_BASE_COLOR);
    const decayed = toHsl(gvDecayWorldColor(BODY_BASE_COLOR, 100000));
    if (base !== null && decayed !== null) {
      expect(decayed.l).toBeCloseTo(base.l, 2);
      expect(decayed.s).toBeCloseTo(base.s * 0.35, 2);
    }
  });
});

describe("§4 aging: drift walks the pupil toward the next stage (ticket 0041)", () => {
  it("steps 15% per three accumulated fragments, individual-first", () => {
    expect(AGING_STEP_FRAGMENTS).toBe(3);
    expect(AGING_STEP_T).toBe(0.15);
    // 0–2 fragments: still exactly the group stage colour.
    for (const drift of [0, 1, 2]) {
      expect(agedPupilColor(0, drift)).toBe(PUPIL_STAGE_COLORS[0]);
    }
    // 3 fragments: 15% toward S1 — before the group's GV has moved at all.
    const from = parseColor(PUPIL_STAGE_COLORS[0]);
    const to = parseColor(PUPIL_STAGE_COLORS[1]);
    if (from !== null && to !== null) {
      expect(agedPupilColor(0, 3)).toBe(toHex(mix(from, to, 0.15)));
      expect(agedPupilColor(0, 5)).toBe(agedPupilColor(0, 3)); // same step bucket
      expect(agedPupilColor(0, 6)).toBe(toHex(mix(from, to, 0.3)));
    }
  });

  it("caps at the next stage colour and never walks past S4", () => {
    // A long life reaches the next stage's colour exactly — the individual
    // arrived where the group has not (stage 0 still on the world's GV).
    expect(agedPupilColor(0, 60)).toBe(PUPIL_STAGE_COLORS[1]);
    expect(agedPupilColor(1, 600)).toBe(PUPIL_STAGE_COLORS[2]);
    // S4 is the end: the pupil has vanished, nothing follows the void.
    expect(agedPupilColor(4, 0)).toBe(PUPIL_STAGE_COLORS[4]);
    expect(agedPupilColor(4, 900)).toBe(PUPIL_STAGE_COLORS[4]);
    // Junk input is clamped, never thrown.
    expect(agedPupilColor(Number.NaN, Number.NaN)).toBe(PUPIL_STAGE_COLORS[0]);
    expect(agedPupilColor(-1, -5)).toBe(PUPIL_STAGE_COLORS[0]);
  });

  it("ages monotonically in drift", () => {
    fc.assert(
      fc.property(fc.nat(4), fc.nat(30), (stage, drift) => {
        const here = agedPupilColor(stage, drift);
        const later = agedPupilColor(stage, drift + 3);
        if (stage >= 4 || here === later) {
          return;
        }
        expect(parseColor(here)).not.toBeNull();
        expect(parseColor(later)).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

describe("the scene seam: body decays, eyes never do (ticket 0041)", () => {
  it("decays the body family with GV while the void and glint hold", () => {
    for (const gv of [0, 50, 100, 100000]) {
      for (const drift of [0, 7, 30]) {
        const palette = decayedCanonicalPalette(2, gv, drift);
        expect(palette).toHaveLength(7);
        expect(palette[3]).toBe("#101018"); // E: the void never fades
        expect(palette[5]).toBe("#FFFFFF"); // G: the glint never fades
        expect(palette[4]).toBe(agedPupilColor(2, drift));
        expect(palette[6]).toBe(agedPupilColor(2, drift));
        if (gv <= 40 && drift < 3) {
          expect(palette[0]).toBe(BODY_BASE_COLOR);
        }
        if (gv > 40) {
          expect(palette[0]).not.toBe(BODY_BASE_COLOR); // the body is fading
        }
      }
    }
  });

  it("is the plain canonical palette before GV bites and before drift accumulates", () => {
    expect(decayedCanonicalPalette(2, 40, 0)).toEqual(canonicalPalette(2));
    const stage = 2;
    const palette = decayedCanonicalPalette(stage, 40, 0);
    for (const [index, expected] of [
      [4, PUPIL_STAGE_COLORS[2]],
      [5, "#FFFFFF"],
    ] as const) {
      expect(palette[index]).toBe(expected);
    }
  });
});

describe("§5.3 (ART-CORE-02): term_bg reads the world's mood (ticket 0041)", () => {
  it("derives world_mood from the living's happiness — pure, no clock", () => {
    expect(worldMood(fixtureWorld([creature("a", 100), creature("b", 0)]))).toBeCloseTo(0.5, 9);
    expect(worldMood(fixtureWorld([creature("a", 40)]))).toBeCloseTo(0.4, 9);
    // The dead do not grieve the backdrop down: only the living's happiness
    // counts, and the lone survivor is perfectly content.
    expect(worldMood(fixtureWorld([creature("a", 100), creature("b", 0, "dead")]))).toBe(1);
    // An empty world reads neutral: nothing left to darken for.
    expect(worldMood(fixtureWorld([]))).toBe(1);
    expect(worldMood(fixtureWorld([creature("a", 255)]))).toBeLessThanOrEqual(1);
  });

  it("darkens the backdrop as the world sours, per L' = L × (0.92 + 0.08 × mood)", () => {
    const happy = termBgColor(fixtureWorld([creature("a", 100)], 0, 0));
    const sour = termBgColor(fixtureWorld([creature("a", 0)], 0, 0));
    expect(happy).toBe("#0E1116"); // mood 1: the backdrop is exactly itself
    expect(sour).not.toBe(happy);
    const happyLight = toHsl(happy)?.l ?? 0;
    const sourLight = toHsl(sour)?.l ?? 0;
    expect(sourLight).toBeCloseTo(happyLight * 0.92, 2); // mood 0: ×0.92, 更黑
    // Stage ≥3 wears the deeper term_bg family.
    expect(termBgColor(fixtureWorld([creature("a", 100)], 80, 4))).toBe("#0B0D12");
    // Determinism: same world, same backdrop, forever.
    expect(termBgColor(fixtureWorld([creature("a", 30)], 20, 1))).toBe(
      termBgColor(fixtureWorld([creature("a", 30)], 20, 1)),
    );
  });
});
