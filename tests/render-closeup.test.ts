import { describe, expect, it } from "vitest";
import {
  CLOSEUP_ARROW,
  CLOSEUP_ARROW_X,
  CLOSEUP_ARROW_Y,
  CLOSEUP_BLINK_FRAME_MS,
  CLOSEUP_BLINK_PERIOD,
  CLOSEUP_CLOSE_MS,
  CLOSEUP_FONT,
  CLOSEUP_NAME_OFFSET,
  CLOSEUP_OPEN_MS,
  CLOSEUP_OPEN_STEPS,
  CLOSEUP_PULSE_MS,
  CLOSEUP_PULSE_PERIOD_MS,
  CLOSEUP_SIZE,
  GAZER_CLOSEUP_V1,
  GLYPH_PUPIL_HEIGHT,
  GLYPH_PUPIL_SCALE,
  GLYPH_PUPIL_WIDTH,
  borrowPupilFrame,
  closeupArrowVisible,
  closeupLidRows,
  closeupNameBlock,
  closeupOpenSize,
  closeupPulseSize,
  closeupV4InnerMask,
  renderCloseup,
  renderCloseupFrame,
} from "../src/render/masks";
import { CLOSEUP_PALETTE, PUPIL_STAGE_COLORS } from "../src/render/palette";
import { canonicalMask } from "../src/render/sprite";
import { canonGlyphs } from "../src/canon";

const DARK = [0x10, 0x10, 0x18, 255];
const SKY = [0xa8, 0xd8, 0xe8, 255];
const GRASS = [0x6f, 0xbf, 0x5e, 255];
const FLOWER = [0xf2, 0xf2, 0xf2, 255];
const BRIGHT = [255, 255, 255, 255];
const TEXT = [0xdd, 0xe3, 0xea, 255];

function pixelAt(frame: Uint8Array, x: number, y: number): number[] {
  const at = (y * CLOSEUP_SIZE + x) * 4;
  return Array.from(frame.slice(at, at + 4));
}

describe("pupil close-up V1: ART-CORE-01 §6 (ticket 0019)", () => {
  it("is a 16×16 table with a one-pixel dark rim all the way around", () => {
    expect(GAZER_CLOSEUP_V1).toHaveLength(CLOSEUP_SIZE);
    for (const row of GAZER_CLOSEUP_V1) {
      expect(row).toHaveLength(CLOSEUP_SIZE);
    }
    GAZER_CLOSEUP_V1.forEach((row) => {
      expect(row[0]).toBe("D");
      expect(row[CLOSEUP_SIZE - 1]).toBe("D");
    });
    for (const row of GAZER_CLOSEUP_V1) {
      for (const ch of row) {
        expect("DTgfB").toContain(ch);
      }
    }
  });

  it("draws the grass reflection canon: sky window, bright pair, two flowers", () => {
    // Rows 2–3: the 2×2 bright window in the sky.
    expect(GAZER_CLOSEUP_V1[2]?.slice(2, 5)).toBe("TBB");
    expect(GAZER_CLOSEUP_V1[3]?.slice(2, 5)).toBe("TBB");
    // Row 6: flowers at the canon columns.
    expect(GAZER_CLOSEUP_V1[6]?.[3]).toBe("f");
    expect(GAZER_CLOSEUP_V1[6]?.[10]).toBe("f");
    // Rows 12–15 are the dark eye-edge band.
    for (const y of [11, 12, 13, 14, 15]) {
      expect(GAZER_CLOSEUP_V1[y]).toBe("D".repeat(CLOSEUP_SIZE));
    }
  });

  it("palette lock: the close-up palette matches §6 exactly", () => {
    expect(CLOSEUP_PALETTE.sky).toBe("#A8D8E8");
    expect(CLOSEUP_PALETTE.grass).toBe("#6FBF5E");
    expect(CLOSEUP_PALETTE.flower).toBe("#F2F2F2");
    expect(CLOSEUP_PALETTE.dark).toBe("#101018");
    expect(CLOSEUP_PALETTE.bright).toBe("#FFFFFF");
    expect(CLOSEUP_PALETTE.text).toBe("#DDE3EA");
    expect(CLOSEUP_OPEN_MS).toBe(400);
    expect(CLOSEUP_CLOSE_MS).toBe(200);
    expect(CLOSEUP_OPEN_STEPS).toEqual([2, 4, 8, 12, 16]);
  });

  it("opens on the 2→4→8→12→16 nearest-neighbour ladder over 400ms", () => {
    expect(closeupOpenSize(0)).toBe(2);
    expect(closeupOpenSize(79)).toBe(2);
    expect(closeupOpenSize(80)).toBe(4);
    expect(closeupOpenSize(160)).toBe(8);
    expect(closeupOpenSize(240)).toBe(12);
    expect(closeupOpenSize(320)).toBe(16);
    expect(closeupOpenSize(400)).toBe(16);
    expect(closeupOpenSize(10_000)).toBe(16);
    expect(closeupOpenSize(Number.NaN)).toBe(2);
    expect(closeupOpenSize(-1)).toBe(2);
  });

  it("centers every rung on an integer offset — no subpixel, ever", () => {
    for (const size of CLOSEUP_OPEN_STEPS) {
      expect((CLOSEUP_SIZE - size) % 2).toBe(0);
    }
    // Rung 1 (2×2): only the centre four pixels may differ from dark.
    const first = renderCloseupFrame(0, null);
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      for (let x = 0; x < CLOSEUP_SIZE; x += 1) {
        const inside = (x === 7 || x === 8) && (y === 7 || y === 8);
        if (!inside) {
          expect(pixelAt(first, x, y)).toEqual(DARK);
        }
      }
    }
    // The sample lands on the source's grass band (nearest-neighbour, 1:1
    // mapping of rung pixels to source pixels — no blending anywhere).
    expect(pixelAt(first, 8, 8)).toEqual(GRASS);
  });

  it("shows the full reflection once open, with the exact §6 colours", () => {
    const open = renderCloseupFrame(CLOSEUP_OPEN_MS, null);
    expect(pixelAt(open, 0, 0)).toEqual(DARK); // eye edge
    expect(pixelAt(open, 8, 1)).toEqual(SKY); // sky
    expect(pixelAt(open, 3, 2)).toEqual(BRIGHT); // the bright pair
    expect(pixelAt(open, 8, 6)).toEqual(GRASS); // grass band
    expect(pixelAt(open, 3, 6)).toEqual(FLOWER); // flower
    expect(pixelAt(open, 8, 15)).toEqual(DARK); // rim band
  });

  it("closes with eyelids: 200ms, two dark rectangles meeting in the middle", () => {
    expect(closeupLidRows(0)).toBe(0);
    expect(closeupLidRows(25)).toBe(1);
    expect(closeupLidRows(100)).toBe(4);
    expect(closeupLidRows(200)).toBe(8);
    expect(closeupLidRows(500)).toBe(8);
    expect(closeupLidRows(Number.NaN)).toBe(0);

    const mid = renderCloseupFrame(CLOSEUP_OPEN_MS, 100);
    expect(pixelAt(mid, 8, 3)).toEqual(DARK); // top lid covers rows 0–3
    expect(pixelAt(mid, 8, 4)).toEqual(SKY); // the slit still shows the sky
    expect(pixelAt(mid, 8, 8)).toEqual(GRASS); // …and the grass band
    expect(pixelAt(mid, 8, 12)).toEqual(DARK); // bottom lid covers rows 12–15
    const closed = renderCloseupFrame(CLOSEUP_OPEN_MS, CLOSEUP_CLOSE_MS);
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      for (let x = 0; x < CLOSEUP_SIZE; x += 1) {
        expect(pixelAt(closed, x, y)).toEqual(DARK);
      }
    }
  });

  it("is pure: the same elapsed times always render the same bytes", () => {
    for (const open of [0, 80, 200, 400]) {
      for (const close of [null, 0, 100, 200]) {
        expect(renderCloseupFrame(open, close)).toEqual(renderCloseupFrame(open, close));
      }
    }
    // And every pixel is fully opaque — the overlay carries its own backdrop.
    const frame = renderCloseupFrame(CLOSEUP_OPEN_MS, null);
    for (let i = 3; i < frame.length; i += 4) {
      expect(frame[i]).toBe(255);
    }
  });
});

// ---------------------------------------------------------------------------
// 借瞳(票 0029,NARRATIVE-CORE-01 §6):打印期间瞳孔临时渲染刻符位图,
// 3×4 放大 4 倍成 12×16,▓ 落眼底色 E,· 落身体底色 J。
// ---------------------------------------------------------------------------

describe("借瞳帧(borrowPupilFrame,票 0029)", () => {
  const GLYPH = ["▓▓·", "··▓", "·▓·", "▓··"];
  const VOID = [0x10, 0x10, 0x18, 255]; // EYE_VOID_COLOR
  const BODY = [0x7e, 0xd9, 0x57, 255]; // BODY_BASE_COLOR

  function pupilAt(frame: Uint8Array, x: number, y: number): number[] {
    const at = (y * GLYPH_PUPIL_WIDTH + x) * 4;
    return Array.from(frame.slice(at, at + 4));
  }

  it("is a 12×16 fully opaque sheet, each glyph cell a 4×4 block", () => {
    expect(GLYPH_PUPIL_SCALE).toBe(4);
    expect(GLYPH_PUPIL_WIDTH).toBe(12);
    expect(GLYPH_PUPIL_HEIGHT).toBe(16);
    const frame = borrowPupilFrame(GLYPH);
    expect(frame).toHaveLength(12 * 16 * 4);
    for (let i = 3; i < frame.length; i += 4) {
      expect(frame[i]).toBe(255);
    }
    // First cell ▓ → four by four void pixels.
    expect(pupilAt(frame, 0, 0)).toEqual(VOID);
    expect(pupilAt(frame, 3, 3)).toEqual(VOID);
    // Third cell of the first row · → body pixels.
    expect(pupilAt(frame, 8, 0)).toEqual(BODY);
    expect(pupilAt(frame, 11, 3)).toEqual(BODY);
    // Row 2 is "··▓": only cell 2 is ▓ → void at (8..11, 4..7).
    expect(pupilAt(frame, 9, 5)).toEqual(VOID);
    expect(pupilAt(frame, 0, 5)).toEqual(BODY);
    expect(pupilAt(frame, 6, 5)).toEqual(BODY);
  });

  it("renders every canon glyph: ▓ is the eye void, · is the body", () => {
    for (const glyph of canonGlyphs()) {
      const frame = borrowPupilFrame(glyph.rows);
      for (let cellY = 0; cellY < 4; cellY += 1) {
        for (let cellX = 0; cellX < 3; cellX += 1) {
          const expected = glyph.rows[cellY]?.[cellX] === "▓" ? VOID : BODY;
          expect(pupilAt(frame, cellX * 4, cellY * 4)).toEqual(expected);
          expect(pupilAt(frame, cellX * 4 + 3, cellY * 4 + 3)).toEqual(expected);
        }
      }
    }
  });

  it("is pure and hard against junk input: unknown rows fall back to body", () => {
    expect(borrowPupilFrame(GLYPH)).toEqual(borrowPupilFrame(GLYPH));
    const junk = borrowPupilFrame(["x", "", undefined as unknown as string]);
    for (let i = 3; i < junk.length; i += 4) {
      expect(junk[i]).toBe(255);
      expect(junk[i - 1]).toBe(0x57); // body blue channel everywhere
    }
  });
});

describe("pupil close-up V2: the cursor reflection (ART-CORE-01 §6, ticket 0037)", () => {
  it("is V1 plus a 3×5 white arrow with a black outline, pointing upper-left", () => {
    const open = renderCloseup("v2", { openElapsedMs: CLOSEUP_OPEN_MS, blinkFrame: 0 });
    // The arrow head leads upper-left; the shaft runs to the lower right.
    const whites: [number, number][] = [
      [CLOSEUP_ARROW_X, CLOSEUP_ARROW_Y],
      [CLOSEUP_ARROW_X + 1, CLOSEUP_ARROW_Y + 1],
      [CLOSEUP_ARROW_X + 2, CLOSEUP_ARROW_Y + 2],
      [CLOSEUP_ARROW_X + 2, CLOSEUP_ARROW_Y + 3],
      [CLOSEUP_ARROW_X + 2, CLOSEUP_ARROW_Y + 4],
    ];
    for (const [x, y] of whites) {
      expect(pixelAt(open, x, y)).toEqual(BRIGHT);
    }
    expect(CLOSEUP_ARROW).toHaveLength(5);
    for (const row of CLOSEUP_ARROW) {
      expect(row).toHaveLength(3);
    }
    // The outline is the eye void; the grass band still shows outside the block.
    expect(pixelAt(open, CLOSEUP_ARROW_X + 2, CLOSEUP_ARROW_Y)).toEqual(DARK);
    expect(pixelAt(open, 3, 6)).toEqual(FLOWER);
  });

  it("blinks off exactly one frame in twenty (about 4s apart)", () => {
    expect(CLOSEUP_BLINK_PERIOD).toBe(20);
    expect(CLOSEUP_BLINK_FRAME_MS).toBe(200);
    expect(closeupArrowVisible(0)).toBe(true);
    expect(closeupArrowVisible(18)).toBe(true);
    expect(closeupArrowVisible(19)).toBe(false);
    expect(closeupArrowVisible(20)).toBe(true);
    expect(closeupArrowVisible(39)).toBe(false);
    expect(closeupArrowVisible(Number.NaN)).toBe(true);
    // Hidden frame: the eye shows plain V1, byte for byte.
    const hidden = renderCloseup("v2", { openElapsedMs: CLOSEUP_OPEN_MS, blinkFrame: 19 });
    expect(hidden).toEqual(renderCloseup("v1", { openElapsedMs: CLOSEUP_OPEN_MS }));
    const shown = renderCloseup("v2", { openElapsedMs: CLOSEUP_OPEN_MS, blinkFrame: 0 });
    expect(shown).not.toEqual(hidden);
  });
});

describe("pupil close-up V3: the mirrored name (ART-CORE-01 §6, ticket 0037)", () => {
  it("renders the name as 2×3 glyphs of the 3×5 font, mirrored as one block", () => {
    const block = closeupNameBlock("AB");
    expect(block).toHaveLength(11);
    for (const row of block) {
      expect(row).toHaveLength(11);
    }
    // Row-level基准串: "A" occupies the top-left glyph; mirrored, its pixels
    // land in the top-RIGHT glyph.
    const fontA = CLOSEUP_FONT["A"] ?? [];
    for (let y = 0; y < 5; y += 1) {
      const row = fontA[y] ?? "000";
      for (let x = 0; x < 3; x += 1) {
        const lit = row[x] === "1";
        const mirroredCell = block[y]?.[10 - x];
        expect(mirroredCell === "N").toBe(lit);
      }
    }
  });

  it("darkens the whole reflection to the eye void; only the name stays", () => {
    const open = renderCloseup("v3", { openElapsedMs: CLOSEUP_OPEN_MS, name: "GAZER" });
    let textPixels = 0;
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      for (let x = 0; x < CLOSEUP_SIZE; x += 1) {
        const px = pixelAt(open, x, y);
        if (JSON.stringify(px) === JSON.stringify(TEXT)) {
          textPixels += 1;
        } else {
          // Neither the sky, the grass, nor the bright window may survive.
          expect(px).toEqual(DARK);
        }
      }
    }
    expect(textPixels).toBeGreaterThan(0);
    // Different names write different eyes.
    expect(renderCloseup("v3", { openElapsedMs: CLOSEUP_OPEN_MS, name: "GAZER" })).not.toEqual(
      renderCloseup("v3", { openElapsedMs: CLOSEUP_OPEN_MS, name: "GOLEM" }),
    );
  });

  it("pastes the mirrored block at the integer centre offset", () => {
    expect(CLOSEUP_NAME_OFFSET).toBe(2);
    const open = renderCloseup("v3", { openElapsedMs: CLOSEUP_OPEN_MS, name: "ZZZ" });
    const block = closeupNameBlock("ZZZ");
    for (let y = 0; y < block.length; y += 1) {
      const row = block[y] ?? "";
      for (let x = 0; x < row.length; x += 1) {
        const expected = row[x] === "N" ? TEXT : DARK;
        expect(pixelAt(open, CLOSEUP_NAME_OFFSET + x, CLOSEUP_NAME_OFFSET + y)).toEqual(expected);
      }
    }
  });
});

describe("pupil close-up V4: recursion (ART-CORE-01 §6, ticket 0037)", () => {
  it("places the 8×8 ALERT creature dead centre, glint frozen at CENTER", () => {
    // The inner mask is the canonical ALERT pipeline (glint centred, [R1]).
    expect(closeupV4InnerMask()).toEqual(canonicalMask("alert"));
    const open = renderCloseup("v4", { openElapsedMs: CLOSEUP_OPEN_MS, pulseElapsedMs: 0, pupilStage: 0 });
    expect(pixelAt(open, 7, 6)).toEqual(BRIGHT); // 4 + (3,2): the glint, dead centre
    expect(pixelAt(open, 7, 1)).toEqual(DARK); // outside the creature: the void
    // The iris ring wears the current stage colour (S0 amber here).
    expect(pixelAt(open, 6, 5)).toEqual([
      0xe8,
      0xa9,
      0x3c,
      255,
    ]);
  });

  it("pulses 8→10→8 over 600ms every 8 seconds, nearest-neighbour only", () => {
    expect(CLOSEUP_PULSE_MS).toBe(600);
    expect(CLOSEUP_PULSE_PERIOD_MS).toBe(8000);
    expect(closeupPulseSize(0)).toBe(8);
    expect(closeupPulseSize(150)).toBe(10);
    expect(closeupPulseSize(300)).toBe(10);
    expect(closeupPulseSize(450)).toBe(10);
    expect(closeupPulseSize(550)).toBe(8);
    expect(closeupPulseSize(600)).toBe(8);
    expect(closeupPulseSize(5000)).toBe(8);
    expect(closeupPulseSize(8300)).toBe(10); // the next cycle's rise
    expect(closeupPulseSize(Number.NaN)).toBe(8);
    // The two phases render different sizes — and both keep the glint lit,
    // because the inner pupil is frozen at CENTER (§6 V4).
    const rest = renderCloseup("v4", { openElapsedMs: CLOSEUP_OPEN_MS, pulseElapsedMs: 0, pupilStage: 2 });
    const peak = renderCloseup("v4", { openElapsedMs: CLOSEUP_OPEN_MS, pulseElapsedMs: 300, pupilStage: 2 });
    expect(peak).not.toEqual(rest);
    const countBright = (frame: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < frame.length; i += 4) {
        if (frame[i] === 255 && frame[i + 1] === 255 && frame[i + 2] === 255) {
          count += 1;
        }
      }
      return count;
    };
    expect(countBright(peak)).toBeGreaterThan(0);
    expect(countBright(rest)).toBeGreaterThan(0);
  });

  it("keeps the stage colour on the ring and closes under the shared eyelids", () => {
    for (const stage of [0, 1, 2, 3, 4] as const) {
      const iris = PUPIL_STAGE_COLORS[stage] ?? "#000000";
      const bytes = [
        Number.parseInt(iris.slice(1, 3), 16),
        Number.parseInt(iris.slice(3, 5), 16),
        Number.parseInt(iris.slice(5, 7), 16),
        255,
      ];
      const open = renderCloseup("v4", { openElapsedMs: CLOSEUP_OPEN_MS, pulseElapsedMs: 0, pupilStage: stage });
      // The ring sits at the creature's (2,3)/(5,3) — iris pixels by canon.
      expect(pixelAt(open, 4 + 2, 4 + 3)).toEqual(bytes);
    }
    const closed = renderCloseup("v4", { openElapsedMs: CLOSEUP_OPEN_MS, closeElapsedMs: CLOSEUP_CLOSE_MS });
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      for (let x = 0; x < CLOSEUP_SIZE; x += 1) {
        expect(pixelAt(closed, x, y)).toEqual(DARK);
      }
    }
  });

  it("V1 stays byte-identical through the variant entry point", () => {
    expect(renderCloseup("v1", { openElapsedMs: 200, closeElapsedMs: null })).toEqual(
      renderCloseupFrame(200, null),
    );
  });
});
