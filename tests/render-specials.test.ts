import { describe, expect, it } from "vitest";
import { DEFAULT_MASK } from "../src/sim/engine";
import { GRIEF_P, TWIN_SOULS_P, isGriefRoll, isTwinRoll } from "../src/sim/genome";
import type { CreatureState, WorldState } from "../src/sim/types";
import { canonicalMask } from "../src/render/sprite";
import { creatureDraws } from "../src/render/scene";
import {
  ATAVISTIC_BODY_COLOR,
  ATAVISTIC_PUPIL_COLOR,
  atavisticPalette,
  decayCreatureColor,
  decayedCanonicalPalette,
  paletteAt,
  pupilStageForGv,
} from "../src/render/palette";
import { renderGazerMask } from "../src/render/masks";

function pixelAt(frame: Uint8Array, x: number, y: number): number[] {
  return Array.from(frame.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
}

function hexBytes(hex: string): number[] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

const fixtureCreature = (id: string, extra: Partial<CreatureState> = {}): CreatureState => ({
  id,
  species: "gazerling",
  stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
  behavior: "idle",
  trait: null,
  position: { x: 3, y: 3 },
  palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
  mask: [...DEFAULT_MASK],
  hatchedAtTick: 0,
  name: null,
  willingness: 40,
  courtshipTicks: 0,
  ...extra,
});

const fixtureWorld = (creatures: Record<string, CreatureState>, gv = 0): WorldState => ({
  tick: 0,
  gv,
  stage: 0,
  creatures,
  structures: [],
  eggs: [],
  uiLabels: {},
  paletteDecay: 0,
  seed: 1,
  silent: true,
});

describe("§7 返祖体: forced phosphor palette, exempt from decay (ticket 0037)", () => {
  it("forces P/I #33FF66 and body #2ECC5E, seven canonical slots", () => {
    const palette = atavisticPalette();
    expect(palette).toHaveLength(7);
    expect(palette[0]).toBe("#2ECC5E"); // J: body, forced
    expect(palette[4]).toBe("#33FF66"); // P: pupil, forced
    expect(palette[6]).toBe("#33FF66"); // I: iris, forced
    expect(palette[3]).toBe("#101018"); // E: the void stays canon
    expect(palette[5]).toBe("#FFFFFF"); // G: the glint stays white
  });

  it("is constant at any GV: the decay path bypasses the marker", () => {
    const palette = atavisticPalette();
    for (const gv of [0, 19, 20, 40, 60, 80, 100]) {
      expect(atavisticPalette()).toEqual(palette);
      for (const color of palette) {
        // The exemption is the point: any decay amount, still the same colour.
        expect(decayCreatureColor(color, Math.min(1, gv / 100), true)).toBe(color);
      }
    }
    // Sanity: without the marker the decay does bite.
    expect(decayCreatureColor(ATAVISTIC_BODY_COLOR, 1, false)).not.toBe(ATAVISTIC_BODY_COLOR);
  });

  it("renders the forced colours through the canonical pipeline", () => {
    const pixels = renderGazerMask(canonicalMask("idle"), atavisticPalette());
    expect(pixelAt(pixels, 1, 2)).toEqual(hexBytes("#2ECC5E")); // body (row0 is the H rim)
    expect(pixelAt(pixels, 3, 0)).toEqual(hexBytes("#8CF2A6")); // the highlight rim
    expect(pixelAt(pixels, 3, 2)).toEqual(hexBytes(ATAVISTIC_PUPIL_COLOR)); // pupil
    expect(pixelAt(pixels, 2, 1)).toEqual(hexBytes("#FFFFFF")); // glint, white
  });

  it("reaches the scene through the canon palette seam", () => {
    const world = fixtureWorld(
      {
        a: fixtureCreature("a", { atavistic: true, mask: canonicalMask("idle") }),
        b: fixtureCreature("b", { mask: canonicalMask("idle") }),
      },
      60,
    );
    const draws = creatureDraws(world, paletteAt(0));
    const atavistic = draws.find((draw) => draw.id === "a");
    const normal = draws.find((draw) => draw.id === "b");
    expect(atavistic?.canonPalette).toEqual(atavisticPalette());
    // The others wear their stage palette with the §5.2 body decay (GV 60 →
    // S3); these fixtures carry no genome, so no §4 aging applies.
    expect(normal?.canonPalette).toEqual(decayedCanonicalPalette(pupilStageForGv(60), 60, 0));
  });
});

describe("§7 哀悼体: SLEEP's line, standing (ticket 0037)", () => {
  it("reaches the scene as the grief frame with the lower-right tilt", () => {
    const world = fixtureWorld({
      a: fixtureCreature("a", { grief: true, mask: canonicalMask("idle") }),
    });
    const draw = creatureDraws(world, paletteAt(0))[0];
    expect(draw?.frame).toBe("grief");
    expect(draw?.mask).toEqual(canonicalMask("grief"));
    const sRow = (row: string | undefined): number[] =>
      (row ?? "")
        .split("")
        .map((ch, x) => (ch === "S" && x >= 2 && x <= 5 ? x : -1))
        .filter((x) => x >= 0);
    expect(sRow(draw?.mask[2])).toEqual([3, 4]);
    expect(sRow(draw?.mask[3])).toEqual([4, 5]);
  });
});

describe("§7 双生魂: 0ms shared phase, mirrored pupil (ticket 0037)", () => {
  it("renders both twins identically in the same frame", () => {
    const world = fixtureWorld({
      a: fixtureCreature("a", { twinOf: "b", mask: canonicalMask("idle") }),
      b: fixtureCreature("b", { twinOf: "a", mask: canonicalMask("idle"), position: { x: 6, y: 6 } }),
    });
    const draws = creatureDraws(world, paletteAt(0));
    const a = draws.find((draw) => draw.id === "a");
    const b = draws.find((draw) => draw.id === "b");
    expect(a?.frame).toBe("idle");
    expect(b?.frame).toBe("idle");
    // Same clock, same phase, same anchor: one eye in two bodies.
    expect(a?.mask).toEqual(b?.mask);
  });

  it("derives the markers from seeded rolls, atavistic-style thresholds", () => {
    expect(TWIN_SOULS_P).toBe(0.05);
    expect(GRIEF_P).toBe(0.05);
    expect(isTwinRoll(0.049)).toBe(true);
    expect(isTwinRoll(0.05)).toBe(false);
    expect(isGriefRoll(0.049)).toBe(true);
    expect(isGriefRoll(0.05)).toBe(false);
    expect(isTwinRoll(Number.NaN)).toBe(false);
    expect(isGriefRoll(-1)).toBe(false);
  });
});
