import { describe, expect, it } from "vitest";
import { DEFAULT_MASK } from "../src/sim/engine";
import { canonGlyphs } from "../src/canon";
import {
  COZY_PALETTE,
  SEASONS,
  TOWER_BODY_COLOR,
  TOWER_GLINT_COLOR,
  TOWER_VOID_COLOR,
  colorBytes,
  paletteAt,
} from "../src/render/palette";
import {
  MASK_CHANNELS,
  frameMask,
  renderGridMask,
  renderMask,
} from "../src/render/sprite";
import { GRID_ROWS, tileCenter } from "../src/render/scene";
import {
  TOWER_BODY_WIDTH,
  TOWER_CANON_TILE,
  TOWER_DOOR_HEIGHT,
  TOWER_DOOR_WIDTH,
  TOWER_DOOR_X,
  TOWER_EDGE_WIDTH,
  TOWER_GLINT_POS,
  TOWER_GLYPH_COUNT,
  TOWER_GLYPH_HEIGHT,
  TOWER_GLYPH_X,
  TOWER_BUTTRESS_ROWS,
  TOWER_DOOR_HEIGHT_TALL,
  TOWER_GLYPH_COUNT_T5,
  TOWER_GLYPH_X_T5,
  TOWER_GLYPH_X_WIDE,
  TOWER_STATES,
  lightVectorAt,
  renderTower,
  renderTowerDissolve,
  renderTowerForEnding,
  towerAnchor,
  towerShadowOffset,
  towerShadowVector,
  towerSilhouette,
  towerSpriteSize,
  towerReadKey,
  towerStateForGv,
} from "../src/render/tower";
import {
  DISSOLVE_TICKS,
  dissolveProgress,
  forgettingGlyphCount,
  isGazeTower,
} from "../src/sim/endings";

describe("sprite: readable eyes (A2)", () => {
  it("widens alert sockets into a three-wide eye run", () => {
    const idle = frameMask(DEFAULT_MASK, "idle");
    const alert = frameMask(DEFAULT_MASK, "alert");
    const count = (s: string): number => s.split("o").length - 1;
    // The idle frame has no bright eyes; the alert frame has more than the
    // bare sockets — each socket is widened into body on both sides.
    expect(count(idle.join(""))).toBe(0);
    expect(count(alert.join(""))).toBeGreaterThan(
      count(frameMask(DEFAULT_MASK, "hungry").join("")),
    );
    // Silhouette unchanged: widening only paints interior pixels.
    const silhouette = (mask: readonly string[]): string =>
      mask.map((row) => row.replace(/[o+]/g, "#").replace(/[^#.]/g, ".")).join("/");
    expect(silhouette(alert)).toBe(silhouette(idle));
  });

  it("stamps a centre eye into a socket-less mask on alert, never on idle", () => {
    const solid = [
      "########",
      "########",
      "########",
      "########",
      "########",
      "########",
      "########",
      "########",
    ];
    const idle = frameMask(solid, "idle");
    const alert = frameMask(solid, "alert");
    expect(idle.join("")).not.toContain("o");
    expect(alert.join("")).toContain("o");
    // The eye lives in the body's interior, not on the silhouette edge.
    const eyes: { x: number; y: number }[] = [];
    alert.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === "o") {
          eyes.push({ x, y });
        }
      }
    });
    for (const eye of eyes) {
      expect(eye.x).toBeGreaterThan(0);
      expect(eye.x).toBeLessThan(7);
      expect(eye.y).toBeGreaterThan(0);
    }
  });

  it("renders RGBA for a grid of any size", () => {
    const pixels = renderGridMask(
      ["#o", "+."],
      ["#ffffff", "#00ff00", "#0000ff"],
      { width: 2, height: 2 },
    );
    expect(pixels).toEqual(
      new Uint8Array([255, 255, 255, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]),
    );
    // The 8x8 renderer is the same maths at a fixed size.
    expect(renderMask(["#"], ["#123456"]).length).toBe(64 * MASK_CHANNELS);
  });
});

/**
 * The black tower, ART-CORE-03 with [R9][R10] in force (ticket 0021).
 * CI items §9.1/§9.2/§9.4/§9.5 are asserted here; §9.3 (light immunity) is
 * asserted at the palette level — the tower colours are constants that never
 * enter the decay curve or the seasonal lean.
 */
describe("tower: the black tower (ART-CORE-03)", () => {
  it("follows the GV timeline §3.2: T0@50 … T3@75, T4@80, T5@90, T6@100", () => {
    expect(towerStateForGv(0)).toBe("T0");
    expect(towerStateForGv(49)).toBe("T0");
    expect(towerStateForGv(50)).toBe("T0");
    expect(towerStateForGv(59)).toBe("T0");
    expect(towerStateForGv(60)).toBe("T1");
    expect(towerStateForGv(69)).toBe("T1");
    expect(towerStateForGv(70)).toBe("T2");
    expect(towerStateForGv(74)).toBe("T2");
    expect(towerStateForGv(75)).toBe("T3");
    expect(towerStateForGv(79)).toBe("T3");
    expect(towerStateForGv(80)).toBe("T4");
    expect(towerStateForGv(89)).toBe("T4");
    expect(towerStateForGv(90)).toBe("T5");
    expect(towerStateForGv(99)).toBe("T5");
    expect(towerStateForGv(100)).toBe("T6");
    // Junk input is deterministic too: T0 is the floor, never NaN-driven.
    expect(towerStateForGv(Number.NaN)).toBe("T0");
    expect(towerStateForGv(-5)).toBe("T0");
  });

  it("has exactly one frame per state (CI §9.2): seven states, one frame each", () => {
    expect(TOWER_STATES).toEqual(["T0", "T1", "T2", "T3", "T4", "T5", "T6"]);
    for (const state of TOWER_STATES) {
      // R9: no animation — the same state renders the same frame forever.
      expect(renderTower(state)).toEqual(renderTower(state));
      expect(towerSilhouette(state)).toEqual(towerSilhouette(state));
    }
    // Sizes per §3.2: 12×12 → 12×14 → 16×18 (base + buttresses) → 16×24.
    expect(towerSpriteSize("T0")).toEqual({ width: 14, height: 12 });
    expect(towerSpriteSize("T1")).toEqual({ width: 14, height: 12 });
    expect(towerSpriteSize("T2")).toEqual({ width: 14, height: 14 });
    expect(towerSpriteSize("T3")).toEqual({ width: 14, height: 14 });
    expect(towerSpriteSize("T4")).toEqual({ width: 18, height: 18 });
    expect(towerSpriteSize("T5")).toEqual({ width: 18, height: 18 });
    expect(towerSpriteSize("T6")).toEqual({ width: 18, height: 24 });
  });

  it("locks the tower layer to exactly the three canonical colours (CI §9.1)", () => {
    const allowed = [TOWER_BODY_COLOR, TOWER_VOID_COLOR, TOWER_GLINT_COLOR].map(
      (color) => colorBytes(color)?.join(",") ?? "",
    );
    const seen = new Set<string>();
    for (const state of TOWER_STATES) {
      const pixels = renderTower(state);
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
          continue; // transparent
        }
        expect(pixels[i + 3]).toBe(255); // no partial alpha anywhere
        seen.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},255`);
      }
    }
    // The union across every state is exactly the three colours — one more
    // colour anywhere in the tower layer is a FAIL (§9.1).
    expect([...seen].sort()).toEqual([...new Set(allowed)].sort());
  });

  it("is a pure straight-line silhouette with no interior detail at T0", () => {
    const rows = towerSilhouette("T0");
    const edge = "V".repeat(TOWER_EDGE_WIDTH);
    const body = "B".repeat(TOWER_BODY_WIDTH);
    // Every row identical: a straight column, no taper, no texture.
    for (const row of rows) {
      expect(row).toBe(edge + body + edge);
    }
    expect(rows[0]).not.toContain("G");
  });

  it("carves a 2×3 tower_void door slit at the base centre from T1", () => {
    const plain = towerSilhouette("T0");
    const doored = towerSilhouette("T1");
    const height = 12;
    for (let y = height - TOWER_DOOR_HEIGHT; y < height; y += 1) {
      for (let x = TOWER_DOOR_X; x < TOWER_DOOR_X + TOWER_DOOR_WIDTH; x += 1) {
        expect(doored[y]?.[x]).toBe("V");
        expect(plain[y]?.[x]).toBe("B"); // T0 has no door
      }
    }
    // The door is the only interior detail T1 adds: T0 and T1 agree
    // everywhere outside the door rectangle.
    const width = 12 + TOWER_EDGE_WIDTH * 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const insideDoor =
          y >= height - TOWER_DOOR_HEIGHT && x >= TOWER_DOOR_X && x < TOWER_DOOR_X + TOWER_DOOR_WIDTH;
        if (!insideDoor) {
          expect(doored[y]?.[x]).toBe(plain[y]?.[x]);
        }
      }
    }
  });

  it("pins the vertex glint: top-row shaft centre, constant T2–T5, +1px at T6 (CI §9.5)", () => {
    expect(TOWER_GLINT_POS).toEqual({ x: 6, y: 0 });
    const glintsOf = (state: (typeof TOWER_STATES)[number]): { x: number; y: number }[] => {
      const found: { x: number; y: number }[] = [];
      towerSilhouette(state).forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          if (row[x] === "G") {
            found.push({ x, y });
          }
        }
      });
      return found;
    };
    // T2–T3: the 14-wide sheet, glint at the shaft's centre-left, frozen.
    expect(glintsOf("T2")).toEqual([{ x: 6, y: 0 }]);
    expect(glintsOf("T3")).toEqual([{ x: 6, y: 0 }]);
    // T4–T5: the shaft is unchanged (12 wide, cols 3..14 on the widened
    // sheet) — the same top-row-centre rule lands at (8,0).
    expect(glintsOf("T4")).toEqual([{ x: 8, y: 0 }]);
    expect(glintsOf("T5")).toEqual([{ x: 8, y: 0 }]);
    // T6: the game's only movement — exactly +1px right, never more.
    expect(glintsOf("T6")).toEqual([{ x: 9, y: 0 }]);
    // T0/T1 have no glint at all.
    expect(glintsOf("T0")).toEqual([]);
    expect(glintsOf("T1")).toEqual([]);
  });

  it("flares the base into 2px buttresses from T4 (§3.2), shaft untouched above", () => {
    const t4 = towerSilhouette("T4");
    const height = 18;
    const buttressRows = TOWER_BUTTRESS_ROWS;
    // Base band: full 16-wide silhouette with 1px void flanks; interior
    // details (door, glyph band) live in it, so assert the envelope.
    for (let y = height - buttressRows; y < height; y += 1) {
      expect(t4[y]?.[0]).toBe("V");
      expect(t4[y]?.[17]).toBe("V");
      for (let x = 1; x < 17; x += 1) {
        expect("BV".includes(t4[y]?.[x] ?? ".")).toBe(true);
      }
    }
    // Shaft rows: the 12-wide shaft (cols 3..14, edge columns inclusive)
    // sits on the widened sheet; the outer columns stay transparent — no
    // floating black pixels. Interior detail (glint/glyph band) lives inside
    // the shaft, so assert the envelope: flanks are void, nothing leaks.
    for (let y = 0; y < height - buttressRows; y += 1) {
      expect(t4[y]?.slice(0, 3)).toBe("...");
      expect(t4[y]?.[3]).toBe("V");
      expect(t4[y]?.[14]).toBe("V");
      expect(t4[y]?.slice(15, 18)).toBe("...");
      expect(t4[y]?.slice(4, 14)).toMatch(/^[BVG]+$/);
    }
    // T5/T6 keep the buttresses.
    for (const state of ["T5", "T6"] as const) {
      const rows = towerSilhouette(state);
      expect(rows[rows.length - 1]?.[0]).toBe("V");
      expect(rows[rows.length - 1]?.[17]).toBe("V");
      expect(rows[0]?.slice(0, 2)).toBe("..");
    }
    // T3 has no buttresses: its sheet is the plain 14-wide column; the top
    // row already carries the vertex glint at its centre.
    expect(towerSilhouette("T3")[0]).toBe("V" + "B".repeat(5) + "G" + "B".repeat(6) + "V");
    expect(towerSilhouette("T3")[1]).toBe("V" + "B".repeat(12) + "V");
  });

  it("raises the door to 4px and grows the glyphs to five at T5 (§3.2)", () => {
    // T4 still carries the 3px door and three glyphs.
    const t4 = towerSilhouette("T4");
    const height4 = 18;
    for (let y = height4 - TOWER_DOOR_HEIGHT; y < height4; y += 1) {
      expect(t4[y]?.slice(8, 10)).toBe("VV");
    }
    const top4 = height4 - TOWER_DOOR_HEIGHT - TOWER_GLYPH_HEIGHT;
    const f1row0 = (canonGlyphs()[0]?.rows[0] ?? "")
      .split("")
      .map((c) => (c === "▓" ? "V" : "B"))
      .join("");
    expect(t4[top4]?.slice(TOWER_GLYPH_X_WIDE, TOWER_GLYPH_X_WIDE + 3)).toBe(f1row0);
    // T5: 4px door at the base centre, five glyphs above it.
    const t5 = towerSilhouette("T5");
    const height5 = 18;
    for (let y = height5 - TOWER_DOOR_HEIGHT_TALL; y < height5; y += 1) {
      expect(t5[y]?.slice(8, 10)).toBe("VV");
      expect(t5[y]?.[7]).toBe("B");
      expect(t5[y]?.[10]).toBe("B");
    }
    const top5 = height5 - TOWER_DOOR_HEIGHT_TALL - TOWER_GLYPH_HEIGHT;
    const glyphs = canonGlyphs().slice(0, TOWER_GLYPH_COUNT_T5);
    glyphs.forEach((glyph, index) => {
      const x0 = TOWER_GLYPH_X_T5 + index * 3;
      glyph.rows.forEach((line, gy) => {
        for (let gx = 0; gx < 3; gx += 1) {
          const expected = line[gx] === "▓" ? "V" : "B";
          expect(t5[top5 + gy]?.[x0 + gx]).toBe(expected);
        }
      });
    });
    // T6 keeps the five-glyph row and the 4px door.
    const t6 = towerSilhouette("T6");
    const top6 = 24 - TOWER_DOOR_HEIGHT_TALL - TOWER_GLYPH_HEIGHT;
    glyphs.forEach((glyph, index) => {
      const x0 = TOWER_GLYPH_X_T5 + index * 3;
      glyph.rows.forEach((line, gy) => {
        for (let gx = 0; gx < 3; gx += 1) {
          const expected = line[gx] === "▓" ? "V" : "B";
          expect(t6[top6 + gy]?.[x0 + gx]).toBe(expected);
        }
      });
    });
  });

  it("moves the glint once and only once: T6 is exactly T5 +1px, nothing else moves", () => {
    const t5 = towerSilhouette("T5");
    const t6 = towerSilhouette("T6");
    // Same sheet width, so the shift is directly comparable.
    expect(t5.length + 6).toBe(t6.length);
    const glintAt = (rows: readonly string[]): { x: number; y: number } => {
      for (let y = 0; y < rows.length; y += 1) {
        const x = rows[y]?.indexOf("G") ?? -1;
        if (x >= 0) {
          return { x, y };
        }
      }
      throw new Error("no glint");
    };
    expect(glintAt(t6).x).toBe(glintAt(t5).x + 1);
    expect(glintAt(t6).y).toBe(glintAt(t5).y);
    // Determinism: the same state never drifts.
    expect(towerSilhouette("T6")).toEqual(t6);
  });

  it("stamps three 3×4 canon glyphs above the door slit at T3, ▓ as tower_void", () => {
    const rows = towerSilhouette("T3");
    const height = 14;
    const glyphs = canonGlyphs().slice(0, TOWER_GLYPH_COUNT);
    expect(glyphs).toHaveLength(TOWER_GLYPH_COUNT);
    const top = height - TOWER_DOOR_HEIGHT - TOWER_GLYPH_HEIGHT;
    glyphs.forEach((glyph, index) => {
      const x0 = TOWER_GLYPH_X + index * 3;
      glyph.rows.forEach((line, gy) => {
        for (let gx = 0; gx < 3; gx += 1) {
          const expected = line[gx] === "▓" ? "V" : "B";
          expect(rows[top + gy]?.[x0 + gx]).toBe(expected);
        }
      });
    });
    // T2 carries no glyphs yet: the band is solid body there.
    const t2 = towerSilhouette("T2");
    for (let y = top; y < top + TOWER_GLYPH_HEIGHT; y += 1) {
      expect(t2[y]?.slice(TOWER_GLYPH_X, TOWER_GLYPH_X + 9)).toBe("B".repeat(9));
    }
  });

  it("paints a read glyph in tower_body: the word has been read away (§6.3)", () => {
    const top = 14 - TOWER_DOOR_HEIGHT - TOWER_GLYPH_HEIGHT;
    // Unread and empty read set agree, byte for byte.
    expect(towerSilhouette("T3", [])).toEqual(towerSilhouette("T3"));
    // F1 read: its void cells become body; the other glyphs keep theirs.
    const afterF1 = towerSilhouette("T3", ["fragment.f1"]);
    const glyphs = canonGlyphs().slice(0, TOWER_GLYPH_COUNT);
    glyphs.forEach((glyph, index) => {
      const expectedVoid = index === 0 ? "B" : "V";
      const x0 = TOWER_GLYPH_X + index * 3;
      glyph.rows.forEach((line, gy) => {
        for (let gx = 0; gx < 3; gx += 1) {
          if (line[gx] === "▓") {
            expect(afterF1[top + gy]?.[x0 + gx]).toBe(expectedVoid);
          }
        }
      });
    });
    // All three read: the whole glyph band is solid body.
    const allRead = towerSilhouette("T3", ["fragment.f1", "fragment.f2", "fragment.f3"]);
    for (let y = top; y < top + TOWER_GLYPH_HEIGHT; y += 1) {
      expect(allRead[y]?.slice(TOWER_GLYPH_X, TOWER_GLYPH_X + 9)).toBe("B".repeat(9));
    }
    // Unknown keys are ignored: junk can never paint the tower.
    expect(towerSilhouette("T3", ["fragment.f9", "terminal.last_one"])).toEqual(
      towerSilhouette("T3"),
    );
    // Determinism per read set.
    expect(towerSilhouette("T3", ["fragment.f2"])).toEqual(towerSilhouette("T3", ["fragment.f2"]));
  });

  it("keeps the palette lock with a read set: recolour stays inside the three (CI §9.1)", () => {
    const allowed = [TOWER_BODY_COLOR, TOWER_VOID_COLOR, TOWER_GLINT_COLOR].map(
      (color) => colorBytes(color)?.join(",") ?? "",
    );
    for (const readSet of [undefined, [], ["fragment.f1"], ["fragment.f1", "fragment.f2", "fragment.f3"]]) {
      const pixels = renderTower("T3", readSet);
      const seen = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) {
          continue;
        }
        expect(pixels[i + 3]).toBe(255);
        seen.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},255`);
      }
      expect([...seen].every((color) => allowed.includes(color))).toBe(true);
    }
  });

  it("derives a stable texture-cache key from the read set", () => {
    expect(towerReadKey(undefined)).toBe("");
    expect(towerReadKey([])).toBe("");
    expect(towerReadKey(["fragment.f1", "fragment.f3"])).toBe("fragment.f1,fragment.f3");
    expect(towerReadKey(["fragment.f9", "fragment.f2"])).toBe("fragment.f2");
  });

  it("points the tower shadow at the light: dot(shadow, light) > 0 (CI §9.4)", () => {
    const lights = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -3, y: 5 },
      { x: 0.2, y: -0.9 },
      { x: -0.6, y: -0.6 },
    ];
    for (const light of lights) {
      const shadow = towerShadowVector(light);
      expect(shadow.x * light.x + shadow.y * light.y).toBeGreaterThan(0);
    }
    // And across a whole day of ticks: the light source itself is
    // deterministic and never the zero vector.
    for (let tick = 0; tick <= 1200; tick += 7) {
      const light = lightVectorAt(tick);
      const shadow = towerShadowVector(light);
      expect(shadow.x * light.x + shadow.y * light.y).toBeGreaterThan(0);
      expect(lightVectorAt(tick)).toEqual(light);
    }
    // The ground offset is whole-pixel and deterministic.
    expect(towerShadowOffset(1997, 8)).toEqual(towerShadowOffset(1997, 8));
    const offset = towerShadowOffset(1997, 8);
    expect(Number.isInteger(offset.x)).toBe(true);
    expect(Number.isInteger(offset.y)).toBe(true);
  });

  it("anchors at the world's west edge on the north–south midline, forever (§2)", () => {
    expect(GRID_ROWS).toBe(16);
    expect(TOWER_CANON_TILE).toEqual({ x: 0, y: Math.floor((GRID_ROWS - 1) / 2) });
    const anchor = towerAnchor();
    expect(anchor).toEqual(tileCenter(TOWER_CANON_TILE));
    // Screen-left: west of the isometric diamond's centre column.
    expect(anchor.x).toBeLessThan(160);
  });

  it("is immune to the day cycle: tower colours never decay or lean (§4, CI §9.3)", () => {
    expect(COZY_PALETTE.tower).toBe(TOWER_BODY_COLOR);
    expect(COZY_PALETTE.towerEdge).toBe(TOWER_VOID_COLOR);
    for (const decay of [0, 0.25, 0.5, 0.75, 1]) {
      for (const season of SEASONS) {
        const palette = paletteAt(decay, season);
        expect(palette.tower).toBe(TOWER_BODY_COLOR);
        expect(palette.towerEdge).toBe(TOWER_VOID_COLOR);
      }
    }
    // [R10] the retired colours are gone from the palette entirely.
    expect(JSON.stringify(COZY_PALETTE)).not.toContain("#141821");
    expect(JSON.stringify(COZY_PALETTE)).not.toContain("#3a4256");
  });

  // --- 四结局塔行为(§7,票 0035) ------------------------------------------

  const READ_ALL = [
    "fragment.f1",
    "fragment.f2",
    "fragment.f3",
    "fragment.f4",
    "fragment.f5",
    "fragment.f6",
    "fragment.f7",
    "fragment.f8",
  ];

  it("真·凝视: 8/8 read turns the tower pure tower_void with the glint kept", () => {
    // The signal needs no ending event: 8/8 read is the tower's own reaction.
    expect(isGazeTower(READ_ALL)).toBe(true);
    expect(isGazeTower(READ_ALL.slice(0, 7))).toBe(false);
    expect(isGazeTower(undefined)).toBe(false);
    const gaze = renderTowerForEnding("T3", READ_ALL, null, 0, 0);
    const rows = towerSilhouette("T3", { readSet: READ_ALL, gaze: true });
    // Every pixel that is not the glint is tower_void; the glint stays white.
    for (let y = 0; y < 14; y += 1) {
      for (let x = 0; x < 14; x += 1) {
        const cell = rows[y]?.[x] ?? ".";
        if (cell === ".") {
          continue;
        }
        expect(cell === "V" || cell === "G").toBe(true);
      }
    }
    expect(rows[0]?.[TOWER_GLINT_POS.x]).toBe("G");
    // And the rendered bytes agree with the mask: only void + glint colours.
    const seen = new Set<string>();
    for (let i = 0; i < gaze.length; i += 4) {
      if (gaze[i + 3] === 0) {
        continue;
      }
      seen.add(`${gaze[i]},${gaze[i + 1]},${gaze[i + 2]},${gaze[i + 3]}`);
    }
    expect(seen.size).toBe(2);
    expect(seen.has("11,13,18,255")).toBe(true);
    expect(seen.has("255,255,255,255")).toBe(true);
  });

  it("B 审判: the tower does not change — byte-identical to the normal face", () => {
    for (const readSet of [undefined, READ_ALL.slice(0, 3)] as const) {
      const judged = renderTowerForEnding("T5", readSet, "judgment", 0, 100);
      expect(judged).toEqual(renderTower("T5", readSet));
    }
  });

  it("A 融合: the tower dissolves into tower_void particles, first of all things", () => {
    expect(DISSOLVE_TICKS).toBe(3);
    expect(dissolveProgress(10, 10)).toBe(0);
    expect(dissolveProgress(10, 13)).toBe(1);
    expect(dissolveProgress(10, 100)).toBe(1);
    // Progress 0: intact — byte-identical to the normal face.
    expect(renderTowerDissolve("T5", undefined, 0, 10)).toEqual(renderTower("T5"));
    // Progress 1: everything is gone — it left before everything else.
    const gone = renderTowerForEnding("T5", undefined, "fusion", 10, 13);
    for (let i = 3; i < gone.length; i += 4) {
      expect(gone[i]).toBe(0);
    }
    // Mid-dissolve: deterministic, only void/body/transparent — no new colour.
    const mid = renderTowerDissolve("T5", undefined, 0.5, 10);
    expect(mid).toEqual(renderTowerDissolve("T5", undefined, 0.5, 10));
    const allowed = [
      [0x12, 0x15, 0x1c, 255],
      [0x0b, 0x0d, 0x12, 255],
      [0xff, 0xff, 0xff, 255],
      [0, 0, 0, 0],
    ];
    for (let i = 0; i < mid.length; i += 4) {
      const pixel = [mid[i], mid[i + 1], mid[i + 2], mid[i + 3]];
      expect(allowed.some((entry) => entry.every((v, j) => v === pixel[j]))).toBe(true);
    }
  });

  it("C 遗忘: glyphs grow by the game day, capped by the state's slots", () => {
    const DAY = 1200; // sim/clock's DAY_CYCLE_TICKS
    expect(forgettingGlyphCount(5, 0, 0)).toBe(5);
    expect(forgettingGlyphCount(5, 0, DAY)).toBe(6);
    expect(forgettingGlyphCount(5, 0, 3 * DAY)).toBe(8);
    // Eight is the canon ceiling; "永远读不完" is the story, not a layout.
    expect(forgettingGlyphCount(5, 0, 100 * DAY)).toBe(8);
    // T3/T4 slots cap at three; T0–T2 have no glyph row at all.
    expect(forgettingGlyphCount(3, 0, 10 * DAY)).toBe(8);
    // The render caps at the state's slots: five on T5's 16-wide base.
    const grown = renderTowerForEnding("T5", undefined, "forgetting", 0, 3 * DAY);
    expect(grown).toEqual(renderTower("T5", { glyphCount: 5 }));
    // Deterministic per (endTick, nowTick).
    expect(renderTowerForEnding("T5", undefined, "forgetting", 0, DAY)).toEqual(
      renderTowerForEnding("T5", undefined, "forgetting", 0, DAY),
    );
  });
});
