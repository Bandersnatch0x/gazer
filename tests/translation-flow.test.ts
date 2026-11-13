import { describe, expect, it } from "vitest";
import {
  FRAGMENT_KEYS,
  glyphRowsFor,
  nextReadableFragment,
  stepTowardBuffer,
  visibleFragmentKeys,
} from "../src/game";
import { ATAVISTIC_MUTATION_P, isAtavisticRoll } from "../src/sim/genome";
import { gvDeltaFor } from "../src/sim/ledger";
import { CANON_PRINT_MS_PER_CHAR, canonPrintDurationMs } from "../src/ui/terminal";
import { F8_LAST_READ_CONSTRAINT, canonGlyphs, canonLine } from "../src/canon";

const F1 = "fragment.f1";
const F2 = "fragment.f2";
const F3 = "fragment.f3";
const F4 = "fragment.f4";
const F5 = "fragment.f5";
const F6 = "fragment.f6";
const F7 = "fragment.f7";
const F8 = "fragment.f8";

// ---------------------------------------------------------------------------
// Gating(N1,票 0029):GV 75 → F1–F3,90 → F1–F5,100 → F1–F8。
// ---------------------------------------------------------------------------

describe("translation flow: gating (N1)", () => {
  it("shows nothing below GV75", () => {
    expect(visibleFragmentKeys(0)).toEqual([]);
    expect(visibleFragmentKeys(74)).toEqual([]);
  });

  it("shows F1–F3 at GV75 and F1–F5 at GV90", () => {
    expect(visibleFragmentKeys(75)).toEqual([F1, F2, F3]);
    expect(visibleFragmentKeys(89)).toEqual([F1, F2, F3]);
    expect(visibleFragmentKeys(90)).toEqual([F1, F2, F3, F4, F5]);
  });

  it("shows all eight only at GV100", () => {
    expect(visibleFragmentKeys(99)).toEqual([F1, F2, F3, F4, F5]);
    expect(visibleFragmentKeys(100)).toEqual(FRAGMENT_KEYS);
    expect(F8_LAST_READ_CONSTRAINT.gv).toBe(100);
  });

  it("hands out the first unread visible fragment in canon order", () => {
    expect(nextReadableFragment(75, [])).toBe(F1);
    expect(nextReadableFragment(75, [F1])).toBe(F2);
    expect(nextReadableFragment(90, [F1, F2, F3])).toBe(F4);
    // Exhausted at GV90: F6–F8 stay behind the GV100 gate.
    expect(nextReadableFragment(90, [F1, F2, F3, F4, F5])).toBeNull();
  });

  it("keeps F8 last-readable: it opens only once the other seven are read", () => {
    // Six read at GV100: the next read is F7, never F8.
    expect(nextReadableFragment(100, [F1, F2, F3, F4, F5, F6])).toBe(F7);
    expect(nextReadableFragment(100, [F1, F2, F3, F4, F5, F6, F7])).toBe(F8);
    // Seven read but GV99: F8 stays gated.
    expect(nextReadableFragment(99, [F1, F2, F3, F4, F5, F6, F7])).toBeNull();
    // All eight read: nothing left.
    expect(nextReadableFragment(100, FRAGMENT_KEYS)).toBeNull();
  });

  it("is deterministic: the same gv and read set always answer the same", () => {
    const read = [F1, F3];
    expect(nextReadableFragment(90, read)).toBe(nextReadableFragment(90, read));
    expect(visibleFragmentKeys(75)).toEqual(visibleFragmentKeys(75));
  });
});

// ---------------------------------------------------------------------------
// 行进:1-tile 缓冲区停步,永不入 footprint(ART-CORE-03 §6.4)。
// ---------------------------------------------------------------------------

describe("translation flow: the walk to the tower", () => {
  const tower = { x: 12, y: 2 };

  it("steps one tile at a time toward the tower", () => {
    expect(stepTowardBuffer({ x: 6, y: 5 }, tower)).toEqual({ x: 7, y: 4 });
    expect(stepTowardBuffer({ x: 7, y: 4 }, tower)).toEqual({ x: 8, y: 3 });
  });

  it("stops inside the 1-tile buffer and never enters the footprint", () => {
    for (const from of [
      { x: 11, y: 3 },
      { x: 12, y: 3 },
      { x: 13, y: 2 },
      { x: 12, y: 1 },
      { x: 13, y: 3 },
    ]) {
      expect(stepTowardBuffer(from, tower)).toEqual(from);
    }
  });

  it("clamps to the engine's grid like every other move", () => {
    expect(stepTowardBuffer({ x: 0, y: 0 }, tower)).toEqual({ x: 1, y: 1 });
  });

  it("reaches the buffer in finitely many steps from across the map", () => {
    let position = { x: 1, y: 14 };
    for (let steps = 0; steps < 100; steps += 1) {
      const next = stepTowardBuffer(position, tower);
      if (next.x === position.x && next.y === position.y) {
        const chebyshev = Math.max(Math.abs(position.x - tower.x), Math.abs(position.y - tower.y));
        expect(chebyshev).toBeLessThanOrEqual(1);
        return;
      }
      position = next;
    }
    throw new Error("the walk never reached the buffer");
  });
});

// ---------------------------------------------------------------------------
// 借瞳的刻符行与打印节拍([N2] 正典通道)。
// ---------------------------------------------------------------------------

describe("translation flow: glyph rows and the print beat", () => {
  it("takes glyph rows verbatim from the canon layer, never retranscribed", () => {
    expect(glyphRowsFor(F1)).toEqual(canonGlyphs()[0]?.rows ?? null);
    expect(glyphRowsFor(F8)).toEqual(canonGlyphs()[7]?.rows ?? null);
    expect(glyphRowsFor("fragment.f9")).toBeNull();
    expect(glyphRowsFor("terminal.last_one")).toBeNull();
  });

  it("prints at exactly 70ms per character ([N2] canon channel exemption)", () => {
    expect(CANON_PRINT_MS_PER_CHAR).toBe(70);
    const text = canonLine(F1) ?? "";
    expect(text).toContain("day 12.");
    expect(canonPrintDurationMs(text)).toBe(text.length * 70);
    expect(canonPrintDurationMs("")).toBe(0);
  });

  it("the F8 preamble line is frozen canon, byte for byte", () => {
    expect(canonLine("terminal.last_one")).toBe("> last one. it is dated.");
  });
});

// ---------------------------------------------------------------------------
// 账目与变异:glyph_read 权重 0,返祖掷点 p≈0.05。
// ---------------------------------------------------------------------------

describe("translation flow: ledger and the atavistic mutation", () => {
  it("reading a glyph never moves GV, day or night, at any stage", () => {
    for (const hour of [0, 6, 12, 18, 23]) {
      for (const stage of [0, 2, 4]) {
        const delta = gvDeltaFor(
          { kind: "glyph_read", creatureId: "gazer_01", fragment: F1, count: 1 },
          hour,
          stage,
        );
        expect(delta).toBe(0);
      }
    }
  });

  it("the atavistic mutation fires below p≈0.05 and never above", () => {
    expect(ATAVISTIC_MUTATION_P).toBe(0.05);
    expect(isAtavisticRoll(0)).toBe(true);
    expect(isAtavisticRoll(0.02)).toBe(true);
    expect(isAtavisticRoll(0.0499)).toBe(true);
    expect(isAtavisticRoll(0.05)).toBe(false);
    expect(isAtavisticRoll(0.5)).toBe(false);
    expect(isAtavisticRoll(1)).toBe(false);
    expect(isAtavisticRoll(-0.01)).toBe(false);
    expect(isAtavisticRoll(Number.NaN)).toBe(false);
  });
});
