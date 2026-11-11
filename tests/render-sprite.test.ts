import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DEFAULT_MASK } from "../src/sim/engine";
import {
  FRAMES,
  MASK_CHANNELS,
  MASK_PIXELS,
  MASK_SIZE,
  frameFor,
  frameMask,
  normalizeMask,
  renderMask,
  spriteKey,
  spriteMask,
} from "../src/render/sprite";
import { COZY_PALETTE } from "../src/render/palette";

const palette = COZY_PALETTE.creature;

function pixel(pixels: Uint8Array, x: number, y: number): number[] {
  const at = (y * MASK_SIZE + x) * MASK_CHANNELS;
  return Array.from(pixels.slice(at, at + MASK_CHANNELS));
}

describe("sprite", () => {
  it("renders 8x8 RGBA for any mask and any palette", () => {
    const arbitraryMask = fc.array(fc.string({ maxLength: 12 }), { maxLength: 12 });
    const arbitraryPalette = fc.array(fc.string({ maxLength: 12 }), { maxLength: 6 });
    fc.assert(
      fc.property(arbitraryMask, arbitraryPalette, (mask, colors) => {
        const pixels = renderMask(mask, colors);
        expect(pixels).toBeInstanceOf(Uint8Array);
        expect(pixels.length).toBe(MASK_PIXELS * MASK_CHANNELS);
        expect(pixels.length).toBe(64 * 4);
        for (let i = 3; i < pixels.length; i += 4) {
          expect(pixels[i] === 0 || pixels[i] === 255).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });

  it("maps mask characters to palette slots", () => {
    const mask = ["#o+*", "....", "....", "....", "....", "....", "....", "...."];
    const pixels = renderMask(mask, palette);
    expect(pixel(pixels, 0, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    expect(pixel(pixels, 1, 0)).toEqual([0x7e, 0xf0, 0xa6, 255]);
    expect(pixel(pixels, 2, 0)).toEqual([0x1a, 0x2b, 0x1f, 255]);
    expect(pixel(pixels, 3, 0)).toEqual([0xe8, 0xa8, 0x7c, 255]);
    expect(pixel(pixels, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it("pads short masks and drops trailing rows", () => {
    const pixels = renderMask(["##", "#"], palette);
    expect(pixel(pixels, 1, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    expect(pixel(pixels, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(pixels, 0, 0)).toEqual([0xf2, 0xe6, 0xc9, 255]);
    for (let y = 2; y < MASK_SIZE; y += 1) {
      expect(pixel(pixels, 0, y)).toEqual([0, 0, 0, 0]);
    }
  });

  it("treats unknown characters as transparent and missing palette slots as body", () => {
    const pixels = renderMask(["#?!o"], ["#ffffff"]);
    expect(pixel(pixels, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(pixels, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(pixels, 2, 0)).toEqual([0, 0, 0, 0]);
    // `o` has no slot 1, so it falls back to the body colour.
    expect(pixel(pixels, 3, 0)).toEqual([255, 255, 255, 255]);
  });

  it("has four distinct frames and none of them throws", () => {
    expect(FRAMES).toEqual(["idle", "alert", "hungry", "dead"]);
    const rendered = FRAMES.map((frame) => frameMask(DEFAULT_MASK, frame).join("/"));
    expect(new Set(rendered).size).toBe(4);
    for (const frame of FRAMES) {
      const mask = frameMask(DEFAULT_MASK, frame);
      expect(mask).toHaveLength(MASK_SIZE);
      for (const row of mask) {
        expect(row).toHaveLength(MASK_SIZE);
      }
    }
  });

  it("alert eyes glow and dead feet are gone", () => {
    const idle = frameMask(DEFAULT_MASK, "idle").join("");
    const alert = frameMask(DEFAULT_MASK, "alert").join("");
    const dead = frameMask(DEFAULT_MASK, "dead").join("");
    expect(alert.includes("o")).toBe(true);
    expect(idle.includes("o")).toBe(false);
    const count = (s: string, ch: string): number => s.split(ch).length - 1;
    expect(count(dead, ".")).toBeGreaterThan(count(idle, "."));
    // The eye sockets survive normalization as body, not as holes.
    expect(normalizeMask(DEFAULT_MASK)).toHaveLength(MASK_SIZE);
  });

  it("picks frames from behaviour, then the watcher trait", () => {
    const create = (behavior: "idle" | "hungry" | "eating" | "dead" | "sleeping", trait: "watcher" | "mimic" | null) => ({
      behavior,
      trait,
      mask: DEFAULT_MASK,
    });
    expect(frameFor(create("dead", "watcher"))).toBe("dead");
    expect(frameFor(create("hungry", null))).toBe("hungry");
    expect(frameFor(create("eating", null))).toBe("hungry");
    expect(frameFor(create("idle", "watcher"))).toBe("alert");
    expect(frameFor(create("idle", null))).toBe("idle");
    expect(frameFor(create("sleeping", "mimic"))).toBe("idle");
  });

  it("derives the sprite mask from the creature, not a global", () => {
    const custom = ["########", "########", "########", "########", "########", "########", "########", "########"];
    const mask = spriteMask({ behavior: "idle", trait: null, mask: custom });
    expect(mask.every((row) => row === "########")).toBe(true);
    expect(spriteKey(custom, palette)).not.toBe(spriteKey(DEFAULT_MASK, palette));
  });
});
