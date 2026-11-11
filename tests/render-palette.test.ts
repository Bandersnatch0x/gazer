import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  COZY_PALETTE,
  applyDecay,
  clamp01,
  colorBytes,
  luma,
  paletteAt,
  parseColor,
  toHex,
} from "../src/render/palette";

const hex = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map(([r, g, b]) => toHex({ r, g, b }));

describe("palette", () => {
  it("parses long and short hex, rejects the rest", () => {
    expect(parseColor("#7ef0a6")).toEqual({ r: 0x7e, g: 0xf0, b: 0xa6 });
    expect(parseColor("7ef0a6")).toEqual({ r: 0x7e, g: 0xf0, b: 0xa6 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("not-a-colour")).toBeNull();
    expect(parseColor("#12345")).toBeNull();
    expect(colorBytes("rgb(1,2,3)")).toBeNull();
  });

  it("leaves a colour untouched at decay 0 and greys it at decay 1", () => {
    fc.assert(
      fc.property(hex, (color) => {
        expect(applyDecay(color, 0)).toBe(color);
        const grey = parseColor(applyDecay(color, 1));
        expect(grey).not.toBeNull();
        expect(grey?.r).toBe(grey?.g);
        expect(grey?.g).toBe(grey?.b);
      }),
      { numRuns: 80 },
    );
  });

  it("stays inside the sRGB range for any decay amount", () => {
    fc.assert(
      fc.property(hex, fc.double({ min: -2, max: 2, noNaN: true }), (color, amount) => {
        const rgb = parseColor(applyDecay(color, amount));
        expect(rgb).not.toBeNull();
        if (rgb !== null) {
          for (const channel of [rgb.r, rgb.g, rgb.b]) {
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
            expect(Number.isInteger(channel)).toBe(true);
          }
        }
      }),
      { numRuns: 120 },
    );
  });

  it("moves monotonically toward luma as decay grows", () => {
    fc.assert(
      fc.property(hex, (color) => {
        const base = parseColor(color);
        if (base === null) {
          return;
        }
        const target = luma(base);
        let previous = Number.POSITIVE_INFINITY;
        for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
          const rgb = parseColor(applyDecay(color, amount));
          if (rgb === null) {
            return;
          }
          const distance = Math.abs(luma(rgb) - target);
          // Channel rounding allows at most half a luma unit of drift.
          expect(distance).toBeLessThanOrEqual(previous + 1);
          previous = distance;
        }
      }),
      { numRuns: 60 },
    );
  });

  it("returns unparseable input unchanged instead of throwing", () => {
    expect(applyDecay("mauve-ish", 0.5)).toBe("mauve-ish");
    expect(applyDecay("", 1)).toBe("");
  });

  it("clamps decay and picks the cozy palette at 0", () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(paletteAt(0)).toEqual(COZY_PALETTE);
    expect(paletteAt(0).creature).toEqual(COZY_PALETTE.creature);
  });
});
