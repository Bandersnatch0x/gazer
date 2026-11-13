/**
 * The black tower — ART-CORE-03 (revisions [R9][R10] in force, tickets
 * 0021/0029/0035).
 *
 * The tower is defined by what it does *not* do: it does not animate, does not
 * speak, does not take light. This module is the pure, GPU-free source of
 * truth for the tower's seven manifested states (§3.2 GV timeline):
 *
 *   T0  GV50   12×12 pure silhouette, no detail at all
 *   T1  GV60   + door slit: 2px × 3px tower_void at the base centre
 *   T2  GV70   12×14 + vertex glint: one tower_glint pixel, top-row centre
 *   T3  GV75   + glyph row: three 3×4 tower_void glyphs (canon F1–F3)
 *   T4  GV80   16×18: 2px buttresses both sides of the base
 *   T5  GV90   door slit raised to 4px; glyphs grow to five (canon F1–F5)
 *   T6  GV100  16×24: the glint shifts right one pixel — the game's ONLY move
 *
 * [R9] The tower never animates: each state is exactly one frame. State
 * changes are instant mask swaps at the GV thresholds — no easing, no tween,
 * no elapsed time anywhere in the growth path. The four ending behaviours
 * (§7) are the one deliberate exception: they render from world state, one
 * deterministic frame per tick.
 *
 * [R10] Three colours only (§3.1): tower_body / tower_void / tower_glint. The
 * retired `#141821` body and `#3a4256` edge are gone; the tower edge is a 1px
 * tower_void outline on each row's flanks (§3.3). Straight lines everywhere,
 * no interior texture; the door slit and the glyph row are the only interior
 * details.
 *
 * Light immunity (§4): the tower's colours are constants (palette.ts) and the
 * tower layer bypasses the day/night LUT entirely. The one rule the tower
 * breaks is shading: its shadow points AT the light (`towerShadowVector`),
 * the daily wrongness the spec asks for.
 */

import { canonGlyphs } from "../canon";
import { DAY_CYCLE_TICKS } from "../sim/clock";
import { dissolveProgress, forgettingGlyphCount, isGazeTower } from "../sim/endings";
import type { TowerEnding } from "../sim/endings";
import type { TilePos } from "../sim/types";
import { TOWER_BODY_COLOR, TOWER_GLINT_COLOR, TOWER_VOID_COLOR, colorBytes } from "./palette";
import { GRID_ROWS, tileCenter } from "./scene";
import type { ScreenPos } from "./scene";
import { hash01 } from "./sprite";

// --- State timeline (§3.2, GV ladder) -----------------------------------------

/** The manifested states, T0 through T6. */
export const TOWER_STATES = ["T0", "T1", "T2", "T3", "T4", "T5", "T6"] as const;

export type TowerState = (typeof TOWER_STATES)[number];

/** GV thresholds per §3.2: 50/60/70/75/80/90/100. */
export const TOWER_GV_THRESHOLDS: readonly {
  readonly state: TowerState;
  readonly minGv: number;
}[] = [
  { state: "T0", minGv: 50 },
  { state: "T1", minGv: 60 },
  { state: "T2", minGv: 70 },
  { state: "T3", minGv: 75 },
  { state: "T4", minGv: 80 },
  { state: "T5", minGv: 90 },
  { state: "T6", minGv: 100 },
];

/**
 * The state a GV moment shows. Below GV50 there is no manifested tower yet,
 * but a director-spawned structure must still stand somewhere: T0 (the pure
 * silhouette) is the floor. Pure and deterministic.
 */
export function towerStateForGv(gv: number): TowerState {
  const value = Number.isFinite(gv) ? gv : 0;
  let state: TowerState = "T0";
  for (const step of TOWER_GV_THRESHOLDS) {
    if (value >= step.minGv) {
      state = step.state;
    }
  }
  return state;
}

// --- Geometry (§3.2/§3.3) ------------------------------------------------------

/** The shaft's silhouette width per §3.2 (T0–T3 are all shaft). */
export const TOWER_BODY_WIDTH = 12;
/** The 1px tower_void edge outline on each row's flanks (§3.3, [R10]). */
export const TOWER_EDGE_WIDTH = 1;
/** Sheet width T0–T3: shaft body plus both edge columns. */
export const TOWER_SPRITE_WIDTH = TOWER_BODY_WIDTH + TOWER_EDGE_WIDTH * 2;
/** Sheet width T4–T6: the 16-wide silhouette (shaft + 2px buttresses) plus edges. */
export const TOWER_SPRITE_WIDTH_WIDE = 18;
/** Heights: T0–T1 12, T2–T3 14, T4–T5 18, T6 24 (§3.2). */
export const TOWER_SHORT_HEIGHT = 12;
export const TOWER_TALL_HEIGHT = 14;
export const TOWER_BUTTRESS_HEIGHT = 18;
export const TOWER_FINAL_HEIGHT = 24;

/** T4+: the buttresses flare the base for exactly these bottom rows. The
 * band is door (3–4px) + glyphs (4px) tall, so the base carries the tower's
 * whole lower face. */
export const TOWER_BUTTRESS_ROWS = 8;
/** Buttress thickness per side (§3.2 T4: 基座两侧 2px 扶壁). */
export const TOWER_BUTTRESS_WIDTH = 2;

export const TOWER_DOOR_WIDTH = 2;
/** Door slit height: 3px from T1, raised to 4px at T5 (§3.2). */
export const TOWER_DOOR_HEIGHT = 3;
export const TOWER_DOOR_HEIGHT_TALL = 4;
/** Door slit left column: the shaft body's centre pair. */
export const TOWER_DOOR_X = Math.floor(TOWER_SPRITE_WIDTH / 2) - 1;
export const TOWER_DOOR_X_WIDE = Math.floor(TOWER_SPRITE_WIDTH_WIDE / 2) - 1;

/**
 * §3.2/§9.5: the glint is one pixel on the top row, at the shaft's centre —
 * and it is constant while the shaft is constant. T2–T3 pin the 14-wide
 * sheet at (6,0) (the 0021 frozen constant); T4–T5 keep the same
 * top-row-centre rule on the widened sheet at (8,0); T6 shifts exactly one
 * pixel right — the game's only movement (§3.2 T6, CI §9.5).
 */
export const TOWER_GLINT_POS = { x: TOWER_DOOR_X, y: 0 } as const;
export const TOWER_GLINT_POS_WIDE = { x: TOWER_DOOR_X_WIDE, y: 0 } as const;
export const TOWER_GLINT_POS_FINAL = { x: TOWER_DOOR_X_WIDE + 1, y: 0 } as const;

/** Glyph counts: three from T3, five from T5 (§3.2). */
export const TOWER_GLYPH_COUNT = 3;
export const TOWER_GLYPH_COUNT_T5 = 5;
export const TOWER_GLYPH_WIDTH = 3;
export const TOWER_GLYPH_HEIGHT = 4;
/**
 * Glyph strip left column per state: packed without gaps, centred on the
 * body it sits on (T3/T4 on the 12-wide shaft; T5/T6's five-glyph strip of
 * 15 spans the 16-wide base — the only band wide enough to carry five).
 */
export const TOWER_GLYPH_X = TOWER_EDGE_WIDTH + Math.floor((TOWER_BODY_WIDTH - TOWER_GLYPH_COUNT * TOWER_GLYPH_WIDTH) / 2);
/** T4's three-glyph strip on the widened sheet: centred on the shaft (cols 4..12). */
export const TOWER_GLYPH_X_WIDE = TOWER_BUTTRESS_WIDTH + TOWER_EDGE_WIDTH + 1;
/** T5/T6's five-glyph strip of 15 on the 16-wide base (cols 1..15). */
export const TOWER_GLYPH_X_T5 = 1;

/** The full per-state sheet geometry. Pure and deterministic. */
export interface TowerLayout {
  readonly width: number;
  readonly height: number;
  /** The shaft's row span, edge columns inclusive. */
  readonly shaft: { readonly left: number; readonly right: number };
  /** The base flares for exactly the bottom `buttressRows` rows. */
  readonly buttressRows: number;
  readonly buttress: { readonly left: number; readonly right: number } | null;
  readonly doorX: number;
  readonly doorHeight: number;
  readonly glint: { readonly x: number; readonly y: number } | null;
  readonly glyphCount: number;
  readonly glyphX: number;
}

/** The layout for a state (§3.2). Pure. */
export function towerLayout(state: TowerState): TowerLayout {
  switch (state) {
    case "T0":
      return { width: TOWER_SPRITE_WIDTH, height: TOWER_SHORT_HEIGHT, shaft: { left: 0, right: TOWER_SPRITE_WIDTH - 1 }, buttressRows: 0, buttress: null, doorX: TOWER_DOOR_X, doorHeight: TOWER_DOOR_HEIGHT, glint: null, glyphCount: 0, glyphX: 0 };
    case "T1":
      return { width: TOWER_SPRITE_WIDTH, height: TOWER_SHORT_HEIGHT, shaft: { left: 0, right: TOWER_SPRITE_WIDTH - 1 }, buttressRows: 0, buttress: null, doorX: TOWER_DOOR_X, doorHeight: TOWER_DOOR_HEIGHT, glint: null, glyphCount: 0, glyphX: 0 };
    case "T2":
      return { width: TOWER_SPRITE_WIDTH, height: TOWER_TALL_HEIGHT, shaft: { left: 0, right: TOWER_SPRITE_WIDTH - 1 }, buttressRows: 0, buttress: null, doorX: TOWER_DOOR_X, doorHeight: TOWER_DOOR_HEIGHT, glint: TOWER_GLINT_POS, glyphCount: 0, glyphX: 0 };
    case "T3":
      return { width: TOWER_SPRITE_WIDTH, height: TOWER_TALL_HEIGHT, shaft: { left: 0, right: TOWER_SPRITE_WIDTH - 1 }, buttressRows: 0, buttress: null, doorX: TOWER_DOOR_X, doorHeight: TOWER_DOOR_HEIGHT, glint: TOWER_GLINT_POS, glyphCount: TOWER_GLYPH_COUNT, glyphX: TOWER_GLYPH_X };
    case "T4":
      return { width: TOWER_SPRITE_WIDTH_WIDE, height: TOWER_BUTTRESS_HEIGHT, shaft: { left: TOWER_BUTTRESS_WIDTH + TOWER_EDGE_WIDTH, right: TOWER_SPRITE_WIDTH_WIDE - 1 - TOWER_BUTTRESS_WIDTH - TOWER_EDGE_WIDTH }, buttressRows: TOWER_BUTTRESS_ROWS, buttress: { left: 0, right: TOWER_SPRITE_WIDTH_WIDE - 1 }, doorX: TOWER_DOOR_X_WIDE, doorHeight: TOWER_DOOR_HEIGHT, glint: TOWER_GLINT_POS_WIDE, glyphCount: TOWER_GLYPH_COUNT, glyphX: TOWER_BUTTRESS_WIDTH + TOWER_EDGE_WIDTH + 1 };
    case "T5":
      return { width: TOWER_SPRITE_WIDTH_WIDE, height: TOWER_BUTTRESS_HEIGHT, shaft: { left: TOWER_BUTTRESS_WIDTH + TOWER_EDGE_WIDTH, right: TOWER_SPRITE_WIDTH_WIDE - 1 - TOWER_BUTTRESS_WIDTH - TOWER_EDGE_WIDTH }, buttressRows: TOWER_BUTTRESS_ROWS, buttress: { left: 0, right: TOWER_SPRITE_WIDTH_WIDE - 1 }, doorX: TOWER_DOOR_X_WIDE, doorHeight: TOWER_DOOR_HEIGHT_TALL, glint: TOWER_GLINT_POS_WIDE, glyphCount: TOWER_GLYPH_COUNT_T5, glyphX: 1 };
    case "T6":
      return { width: TOWER_SPRITE_WIDTH_WIDE, height: TOWER_FINAL_HEIGHT, shaft: { left: TOWER_BUTTRESS_WIDTH + TOWER_EDGE_WIDTH, right: TOWER_SPRITE_WIDTH_WIDE - 1 - TOWER_BUTTRESS_WIDTH - TOWER_EDGE_WIDTH }, buttressRows: TOWER_BUTTRESS_ROWS, buttress: { left: 0, right: TOWER_SPRITE_WIDTH_WIDE - 1 }, doorX: TOWER_DOOR_X_WIDE, doorHeight: TOWER_DOOR_HEIGHT_TALL, glint: TOWER_GLINT_POS_FINAL, glyphCount: TOWER_GLYPH_COUNT_T5, glyphX: 1 };
  }
}

/** Height in pixels for a state (§3.2). Pure. */
export function towerHeight(state: TowerState): number {
  return towerLayout(state).height;
}

/** Sheet size in pixels for a state. Pure. */
export function towerSpriteSize(state: TowerState): { width: number; height: number } {
  return { width: towerLayout(state).width, height: towerLayout(state).height };
}

// --- The silhouette mask --------------------------------------------------------

/**
 * Mask legend. `.` transparent, `B` tower_body, `V` tower_void, `G`
 * tower_glint. Every pixel maps to exactly one of the three canonical tower
 * colours (§3.1) — the palette lock (CI §9.1) reads this sheet.
 */
export type TowerCell = "." | "B" | "V" | "G";

/** The eight glyph canon keys, in strip order (canon 层 key,不重抄位图)。 */
const TOWER_GLYPH_KEYS: readonly string[] = [
  "fragment.f1",
  "fragment.f2",
  "fragment.f3",
  "fragment.f4",
  "fragment.f5",
  "fragment.f6",
  "fragment.f7",
  "fragment.f8",
];

/**
 * 已读消色的纹理缓存键成分(票 0029/0035):已读刻符集合归一到 8 枚的有序
 * key 串;未知 key 忽略——垃圾永远画不到塔上。
 */
export function towerReadKey(readSet?: readonly string[]): string {
  if (readSet === undefined || readSet.length === 0) {
    return "";
  }
  return TOWER_GLYPH_KEYS.filter((key) => readSet.includes(key)).join(",");
}

export interface TowerSilhouetteOptions {
  /** The world's read glyphs (canon keys): a read glyph is painted in
   * tower_body — the word is gone once it has been read away (§6.3). */
  readonly readSet?: readonly string[] | undefined;
  /** C 遗忘:实际绘制的刻符枚数(被状态槽位封顶)。缺省 = 状态基线。 */
  readonly glyphCount?: number | undefined;
  /** 真·凝视:塔身全部 tower_body → tower_void,顶点高光保持(§7 真)。 */
  readonly gaze?: boolean | undefined;
}

function silhouetteOptions(
  readSetOrOptions?: readonly string[] | TowerSilhouetteOptions,
): TowerSilhouetteOptions {
  if (Array.isArray(readSetOrOptions)) {
    return { readSet: readSetOrOptions as readonly string[] };
  }
  return (readSetOrOptions as TowerSilhouetteOptions | undefined) ?? {};
}

/**
 * The mask for a state: a straight-sided shaft, flanked by the 1px
 * tower_void edge on each row, plus the state's detail. T4+ the base flares
 * into 2px buttresses for the bottom band. Deterministic and idempotent: the
 * same state and options always yield the same rows (R9: one frame, forever).
 */
export function towerSilhouette(
  state: TowerState,
  readSetOrOptions?: readonly string[] | TowerSilhouetteOptions,
): string[] {
  const { readSet, glyphCount, gaze } = silhouetteOptions(readSetOrOptions);
  const layout = towerLayout(state);
  const { width: w, height: h, shaft, buttress, buttressRows } = layout;
  const rows: string[][] = [];
  for (let y = 0; y < h; y += 1) {
    const flared = buttress !== null && y >= h - buttressRows;
    const span = flared && buttress !== null ? buttress : shaft;
    const row: string[] = [];
    for (let x = 0; x < w; x += 1) {
      if (x < span.left || x > span.right) {
        row.push(".");
        continue;
      }
      row.push(x === span.left || x === span.right ? "V" : "B");
    }
    rows.push(row);
  }
  // T1+: the door slit, base centre, tower_void (§3.2).
  if (state !== "T0") {
    for (let y = h - layout.doorHeight; y < h; y += 1) {
      const row = rows[y];
      if (row === undefined) {
        continue;
      }
      for (let x = layout.doorX; x < layout.doorX + TOWER_DOOR_WIDTH; x += 1) {
        row[x] = "V";
      }
    }
  }
  // T2+: the vertex glint, one pixel, top-row shaft centre (§3.2). T6 is the
  // only state whose glint leaves the centre — one pixel right (CI §9.5).
  if (layout.glint !== null) {
    const row = rows[layout.glint.y];
    if (row !== undefined) {
      row[layout.glint.x] = "G";
    }
  }
  // The glyph row: canon 3×4 glyphs directly above the door (§3.2). `▓` is
  // tower_void, `·` stays body; the bitmaps come from the canon layer, never
  // retranscribed here. A read glyph loses its void: tower_void → tower_body,
  // the tower's word has been read away (§6.3).
  const count = Math.min(glyphCount ?? layout.glyphCount, layout.glyphCount);
  if (count > 0) {
    const glyphs = canonGlyphs().slice(0, count);
    const top = h - layout.doorHeight - TOWER_GLYPH_HEIGHT;
    glyphs.forEach((glyph, index) => {
      const read = readSet?.includes(TOWER_GLYPH_KEYS[index] ?? "") ?? false;
      const x0 = layout.glyphX + index * TOWER_GLYPH_WIDTH;
      glyph.rows.forEach((line, gy) => {
        const row = rows[top + gy];
        if (row === undefined) {
          return;
        }
        for (let gx = 0; gx < TOWER_GLYPH_WIDTH; gx += 1) {
          if (line[gx] === "▓") {
            row[x0 + gx] = read ? "B" : "V";
          }
        }
      });
    });
  }
  // 真·凝视: every body pixel sinks into the void; only the glint stays
  // (§7 真 — 黑到只剩一个白点).
  if (gaze === true) {
    for (const row of rows) {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === "B") {
          row[x] = "V";
        }
      }
    }
  }
  return rows.map((row) => row.join(""));
}

// --- Rendering (pure bytes, no GPU) ---------------------------------------------

const TOWER_COLORS: readonly string[] = [TOWER_BODY_COLOR, TOWER_VOID_COLOR, TOWER_GLINT_COLOR];

const TOWER_SLOTS: Readonly<Record<string, number>> = { B: 0, V: 1, G: 2 };

const TOWER_BYTES: readonly (readonly [number, number, number, number])[] = TOWER_COLORS.map(
  (color) => colorBytes(color) ?? ([0, 0, 0, 0] as const),
);

function paintRows(rows: readonly string[], width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < width; x += 1) {
      const slot = TOWER_SLOTS[row[x] ?? "."];
      if (slot === undefined) {
        continue;
      }
      const bytes = TOWER_BYTES[slot];
      if (bytes === undefined) {
        continue;
      }
      const at = (y * width + x) * 4;
      out[at] = bytes[0];
      out[at + 1] = bytes[1];
      out[at + 2] = bytes[2];
      out[at + 3] = bytes[3];
    }
  }
  return out;
}

/**
 * One frame as RGBA bytes (row-major, `towerSpriteSize(state)` pixels). The
 * whole sprite table is seven frames — one per state T0–T6, none animated
 * (CI §9.2). `readSet` recolours the read glyphs (§6.3 读走); unread, the
 * sheet holds exactly the three canonical colours. Pure: no canvas, no
 * clock, so tests can assert pixel output directly.
 */
export function renderTower(
  state: TowerState,
  readSetOrOptions?: readonly string[] | TowerSilhouetteOptions,
): Uint8Array {
  const { width, height } = towerSpriteSize(state);
  return paintRows(towerSilhouette(state, readSetOrOptions), width, height);
}

/**
 * A 融合(§7):屏幕像素重组完成前,塔先溶解为 tower_void 色粒子——它先走。
 * Deterministic scatter: `hash01` decides each pixel's fate, so the same
 * (state, progress, seed) always renders the same frame. Body pixels turn
 * void first, then every void pixel falls away; the glint is the last thing
 * to leave (it is gone exactly at progress 1).
 */
export function renderTowerDissolve(
  state: TowerState,
  readSetOrOptions: readonly string[] | TowerSilhouetteOptions | undefined,
  progress: number,
  seed: number,
): Uint8Array {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const { width, height } = towerSpriteSize(state);
  const rows = towerSilhouette(state, readSetOrOptions).map((row) => row.split(""));
  // Pass 1: body pixels fall first — the earliest ones turn void, the rest
  // just disappear. The glint is the last thing to leave (exactly at 1).
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      const cell = row[x];
      if (cell === "B") {
        const r = hash01(x, y, seed);
        if (r < p * 0.6) {
          row[x] = ".";
        } else if (r < p) {
          row[x] = "V";
        }
      } else if (cell === "G" && p >= 1) {
        row[x] = ".";
      }
    }
  }
  // Pass 2: the void scatters — including the cells pass 1 converted, so at
  // progress 1 the sheet is fully transparent (it left before everything).
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 0; x < width; x += 1) {
      if (row[x] === "V" && hash01(x, y, seed + 11) < p) {
        row[x] = ".";
      }
    }
  }
  return paintRows(rows.map((row) => row.join("")), width, height);
}

/**
 * §7 结局表的唯一渲染入口:四结局各一副塔面,全部从 world 状态派生。
 *   A 融合   → 溶解粒子(进度 = `dissolveProgress(endTick, nowTick)`)
 *   B 审判   → 不变化(与常态渲染逐字节全等)
 *   C 遗忘   → 刻符逐游戏日增加(封顶于状态槽位与 canon 总数)
 *   真·凝视  → 纯 tower_void 全黑剪影、顶点高光保持(8/8 读走即成立,
 *              无需结局事件——`isGazeTower`)
 * Pure: same world state, same bytes, forever.
 */
export function renderTowerForEnding(
  state: TowerState,
  readSet: readonly string[] | undefined,
  ending: TowerEnding | null,
  endTick: number,
  nowTick: number,
): Uint8Array {
  if (ending === "fusion") {
    return renderTowerDissolve(state, readSet, dissolveProgress(endTick, nowTick), endTick);
  }
  if (ending === "forgetting") {
    const slots = towerLayout(state).glyphCount;
    return renderTower(state, {
      readSet,
      glyphCount: forgettingGlyphCount(slots, endTick, nowTick),
    });
  }
  if (ending === "gaze" || isGazeTower(readSet)) {
    return renderTower(state, { readSet, gaze: true });
  }
  return renderTower(state, { readSet });
}

// --- Light immunity and the misdirected shadow (§4) ------------------------------

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * The light's screen-space direction at a tick, as a unit vector. The sun
 * rides one full turn of the day cycle (sim/clock's `DAY_CYCLE_TICKS`), so
 * the same tick always casts the same light — deterministic, never the zero
 * vector. The tower ignores this for its own colours (§4 immunity) but not
 * for its shadow, which obeys it backwards.
 */
export function lightVectorAt(tick: number): Vec2 {
  const safe = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const angle = ((safe % DAY_CYCLE_TICKS) / DAY_CYCLE_TICKS) * Math.PI * 2;
  return { x: Math.cos(angle), y: -Math.sin(angle) };
}

/**
 * §4, the tower's one broken rule: the world's shadow flees the light, the
 * tower's shadow points at it — the shadow vector is the light vector's
 * positive self. dot(shadow, light) > 0 always (asserted in CI §9.4). Pure.
 */
export function towerShadowVector(light: Vec2): Vec2 {
  return { x: light.x, y: light.y };
}

/**
 * Ground-plane offset for the shadow blob at a tick: the light direction
 * scaled to `length`, y halved by the isometric squash, both rounded to
 * whole pixels (determinism, integer discipline). Pure.
 */
export function towerShadowOffset(tick: number, length: number): Vec2 {
  const shadow = towerShadowVector(lightVectorAt(tick));
  return { x: Math.round(shadow.x * length), y: Math.round(shadow.y * length * 0.5) };
}

// --- The canonical position (§2) --------------------------------------------------

/**
 * §2, the canonical spot: the world's west edge (the screen-left flank of the
 * isometric diamond — tile column 0) on its north–south midline. This is the
 * only world object whose position never changes once archived; sim's
 * structure-event coordinates stay untouched, and the render side takes its
 * bearing from this frozen constant.
 */
export const TOWER_CANON_TILE: TilePos = { x: 0, y: Math.floor((GRID_ROWS - 1) / 2) };

/** The canonical anchor in logical pixels: the tower sprite's base centre. */
export function towerAnchor(): ScreenPos {
  return tileCenter(TOWER_CANON_TILE);
}
