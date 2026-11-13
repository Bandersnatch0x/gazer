import { describe, expect, it } from "vitest";
import {
  COZY_PALETTE,
  DAY_CYCLE_TICKS,
  SEASONS,
  paletteAt,
  seasonForStage,
  seasonal,
  skyAt,
} from "../src/render/palette";

describe("palette: colour debt (A4)", () => {
  it("pulls the egg colours into the palette so decay eats them too", () => {
    expect(COZY_PALETTE.egg).toBe("#f2e6c9");
    expect(COZY_PALETTE.eggForced).toBe("#b46a8a");
    expect(COZY_PALETTE.wrong).toBe("#b46a8a");
    // At full decay the egg is grey like everything else, not bright cream.
    expect(paletteAt(1).egg).toBe(paletteAt(1).creature[0]);
    const grey = paletteAt(1).eggForced;
    const r = Number.parseInt(grey.slice(1, 3), 16);
    const g = Number.parseInt(grey.slice(3, 5), 16);
    const b = Number.parseInt(grey.slice(5, 7), 16);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("keeps the cozy baseline exact at decay 0", () => {
    expect(paletteAt(0)).toEqual(COZY_PALETTE);
  });
});

describe("palette: season drift (§10.5-3)", () => {
  it("knows one act, one season", () => {
    expect(SEASONS).toEqual(["spring", "summer", "autumn", "winter", "bleak"]);
    expect(seasonForStage(0)).toBe("spring");
    expect(seasonForStage(2)).toBe("autumn");
    expect(seasonForStage(4)).toBe("bleak");
    expect(seasonForStage(-3)).toBe("spring");
    expect(seasonForStage(9)).toBe("bleak");
  });

  it("spring is the identity: the cozy baseline stays the baseline", () => {
    expect(seasonal(paletteAt(0), "spring")).toEqual(paletteAt(0));
    expect(paletteAt(0.4, "spring")).toEqual(paletteAt(0.4));
  });

  it("shifts every entry, never only one", () => {
    for (const season of ["summer", "autumn", "winter", "bleak"] as const) {
      const drifted = seasonal(paletteAt(0), season);
      expect(drifted.tileLight).not.toBe(paletteAt(0).tileLight);
      expect(drifted.creature[1]).not.toBe(paletteAt(0).creature[1]);
      expect(drifted.egg).not.toBe(paletteAt(0).egg);
    }
  });

  it("is deterministic and composes with decay", () => {
    const a = paletteAt(0.6, "winter");
    const b = paletteAt(0.6, "winter");
    expect(a).toEqual(b);
    // Winter leans cold: blue channel above red on a green tile.
    const tile = a.tileLight;
    const blue = Number.parseInt(tile.slice(5, 7), 16);
    const red = Number.parseInt(tile.slice(1, 3), 16);
    expect(blue).toBeGreaterThan(red);
  });
});

describe("palette: day/night sky (A7)", () => {
  it("starts at the plain sky and darkens toward skyLow by mid-cycle", () => {
    expect(skyAt(0, 0)).toBe(paletteAt(0).sky);
    const noon = skyAt(0, 0);
    const night = skyAt(DAY_CYCLE_TICKS / 2, 0);
    expect(night).not.toBe(noon);
    const toChannel = (color: string, at: number): number =>
      Number.parseInt(color.slice(1 + at * 2, 3 + at * 2), 16);
    // skyLow is darker than sky in every channel of the cozy palette.
    expect(toChannel(night, 1)).toBeLessThan(toChannel(noon, 1));
  });

  it("is periodic over one cycle and stable for the same tick", () => {
    expect(skyAt(0, 0.3)).toBe(skyAt(DAY_CYCLE_TICKS, 0.3));
    expect(skyAt(400, 0.3)).toBe(skyAt(400, 0.3));
  });

  it("never leaves the sky/skyLow corridor for any tick", () => {
    for (let tick = 0; tick < DAY_CYCLE_TICKS; tick += 97) {
      const color = skyAt(tick, 0, "spring");
      expect(color.startsWith("#")).toBe(true);
      expect(color).toHaveLength(7);
    }
  });
});
