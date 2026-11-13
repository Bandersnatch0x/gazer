/**
 * The isometric scene, described as data.
 *
 * Nothing here touches PixiJS. `scenePlan` turns a `WorldState` into a list of
 * draw instructions in logical pixels, and `app.ts` is the only file that turns
 * those into GPU objects. That split keeps the geometry testable and keeps the
 * 320x180 fixed camera in one place.
 */

import type { CreatureId, CreatureState, Structure, TilePos, WorldState } from "../sim/types";
import type { TileStain } from "../sim/social";
import { beliefAboutPlayer, factionAccent, factionOf, stainKey } from "../sim/social";
import type { Palette, Season } from "./palette";
import { atavisticPalette, decayedCanonicalPalette, paletteAt, pupilStageForGv, seasonForStage } from "./palette";
import type { PupilAnchor, SpriteFrame } from "./sprite";
import { frameFor, frameMask, hash01, pupilAnchorFor } from "./sprite";
import { maskWithPupilAnchor } from "./masks";

/**
 * A mask authored in the canonical ART-CORE-01 legend routes to the seven-slot
 * render. Same heuristic as `sprite.ts`'s private check, mirrored here because
 * the scene layer may not widen sprite.ts's surface.
 */
const CANONICAL_CHARS = /[JHSEPGI]/;

function isCanonicalMask(mask: readonly string[]): boolean {
  return mask.some((row) => CANONICAL_CHARS.test(row));
}

/** Logical resolution. Everything is authored here and scaled by an integer. */
export const LOGICAL_WIDTH = 320;
export const LOGICAL_HEIGHT = 180;

/** 2:1 tiles, 45 degrees. */
export const TILE_W = 16;
export const TILE_H = 8;
export const TILE_DEPTH = TILE_H / 2;

export const GRID_COLS = 16;
export const GRID_ROWS = 16;

export interface ScreenPos {
  readonly x: number;
  readonly y: number;
}

/**
 * The fixed camera. Tile (0,0)'s top corner sits at the origin, and the origin
 * is chosen so the whole diamond is centred with equal top and bottom margin.
 */
const ORIGIN_X = LOGICAL_WIDTH / 2;
const ORIGIN_Y = (LOGICAL_HEIGHT - (GRID_COLS + GRID_ROWS - 2) * TILE_DEPTH) / 2;

/** Tile coordinate to the tile's top corner, in logical pixels. */
export function project(tile: TilePos): ScreenPos {
  return {
    x: ORIGIN_X + (tile.x - tile.y) * (TILE_W / 2),
    y: ORIGIN_Y + (tile.x + tile.y) * TILE_DEPTH,
  };
}

/** The centre of a tile's diamond, where a creature stands. */
export function tileCenter(tile: TilePos): ScreenPos {
  const corner = project(tile);
  return { x: corner.x, y: corner.y + TILE_DEPTH };
}

/** Screen point back to the tile it lands on. Inverse of `project`. */
export function unproject(point: ScreenPos): TilePos {
  const a = (point.x - ORIGIN_X) / (TILE_W / 2);
  const b = (point.y - ORIGIN_Y) / TILE_DEPTH;
  return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
}

/**
 * Largest integer scale that fits the logical resolution into a CSS box. Never
 * below 1: below native size, pixel art stops being pixel art.
 */
export function integerScale(width: number, height: number): number {
  const fit = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT);
  return Math.max(1, Math.floor(fit));
}

export interface TileDraw {
  readonly tile: TilePos;
  readonly center: ScreenPos;
  readonly light: boolean;
  /**
   * 0..1: how rotten this tile's pattern is. Grows with the stage and the
   * palette decay; 0 for the primed fixed floor, which has no world yet.
   */
  readonly corrupt: number;
  /**
   * Terrain trace (stream F, ticket 0006 §7): the tile's strongest stain, if
   * any. Rendering belongs to `app.ts`; here it is pure data.
   */
  readonly stain?: TileStain;
}

export interface CreatureDraw {
  readonly kind: "creature";
  readonly id: CreatureId;
  readonly frame: SpriteFrame;
  readonly mask: readonly string[];
  /** Eyes-forward frame, used while the creature is watching the player. */
  readonly alertMask: readonly string[];
  readonly palette: readonly string[];
  /**
   * Ticket 0025 (sprite-core ruling ③): the seven-slot canonical palette —
   * body / highlight / shade / eye void / pupil / glint / iris — with the
   * pupil and iris carrying their stage colours. Present only for canonical
   * masks; the host renders those through the spec-exact renderer instead of
   * the legacy four-slot path.
   */
  readonly canonPalette?: readonly string[];
  /**
   * The pupil anchor this draw was masked for (CENTER when nobody said
   * otherwise). The host derives it from the live cursor position.
   */
  readonly pupilAnchor?: PupilAnchor;
  readonly center: ScreenPos;
  readonly depth: number;
}

export interface StructureDraw {
  readonly kind: "structure";
  readonly structure: Structure["kind"];
  readonly center: ScreenPos;
  readonly depth: number;
  /** Height in logical pixels; the tower stands taller every act. */
  readonly height: number;
  /** The world stage the height was planned for; drives the tower's cracks. */
  readonly stage: number;
}

/**
 * An egg on the floor (playtest: eggs were drawn before the depth sort, so any
 * later object painted over them and they read as clipped slivers). Eggs now
 * join the painter's list and occlude like everything else.
 */
export interface EggDraw {
  readonly kind: "egg";
  readonly id: string;
  readonly center: ScreenPos;
  readonly depth: number;
  readonly forced: boolean;
}

export type SceneObject = CreatureDraw | StructureDraw | EggDraw;

export interface ScenePlan {
  readonly palette: Palette;
  readonly season: Season;
  readonly tiles: readonly TileDraw[];
  readonly objects: readonly SceneObject[];
  /** Extra pairs of eyes the dark grows as the stage rises (A3). */
  readonly eyePairs: readonly EyePair[];
  /** Per-ring alpha for the vignette; 0 means no vignette. */
  readonly vignette: number;
}

export interface EyePair {
  readonly a: ScreenPos;
  readonly b: ScreenPos;
}

const TOWER_BASE_HEIGHT = 32;
const TOWER_STAGE_GROWTH = 8;

/** The black tower stands taller every act. Integer pixels, always. */
export function towerHeight(stage: number): number {
  const s = Math.min(4, Math.max(0, Math.floor(stage)));
  return TOWER_BASE_HEIGHT + s * TOWER_STAGE_GROWTH;
}

/**
 * Where the dark grows eyes. Fixed spots, one more pair per stage from stage
 * 2 on: the room keeps acquiring witnesses. Deterministic, no randomness.
 */
export function darkEyePairs(stage: number): readonly EyePair[] {
  const spots: readonly EyePair[] = [
    { a: { x: 26, y: 30 }, b: { x: 30, y: 30 } },
    { a: { x: 288, y: 148 }, b: { x: 292, y: 148 } },
    { a: { x: 156, y: 10 }, b: { x: 160, y: 10 } },
  ];
  if (stage < 2) {
    return [];
  }
  return spots.slice(0, Math.min(spots.length, Math.floor(stage) - 1));
}

/** Per-ring vignette alpha; stage 0 stays almost clean, stage 4 breathes dark. */
export function vignetteAlpha(stage: number): number {
  const s = Math.min(4, Math.max(0, Math.floor(stage)));
  return 0.018 + s * 0.016;
}

/**
 * How rotten one tile's pattern is, from the stage, the decay and a stable
 * hash of the tile itself. Pure: the same world always rots identically.
 */
export function tileCorruption(tile: TilePos, seed: number, stage: number, decay: number): number {
  if (stage < 1) {
    return 0;
  }
  const noise = hash01(tile.x, tile.y, seed);
  const reach = Math.min(0.94, stage * 0.16 + decay * 0.3);
  if (reach <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, (noise - (1 - reach)) / reach));
}

function tileAt(col: number, row: number): TileDraw {
  const tile = { x: col, y: row };
  return { tile, center: tileCenter(tile), light: (col + row) % 2 === 0, corrupt: 0 };
}

function corruptTile(col: number, row: number, world: WorldState): TileDraw {
  const base = tileAt(col, row);
  return {
    ...base,
    corrupt: tileCorruption(base.tile, world.seed, world.stage, world.paletteDecay),
  };
}

/** Fills a creature's palette to four slots from the cozy fallback. */
function slotPalette(colors: readonly string[], fallback: readonly string[]): readonly string[] {
  return [0, 1, 2, 3].map((slot) => colors[slot] ?? fallback[slot] ?? "#ff00ff");
}

function creatureDraw(
  id: CreatureId,
  creature: CreatureState,
  world: WorldState,
  palette: Palette,
  anchor: PupilAnchor = "CENTER",
): CreatureDraw {
  const frame = frameFor(creature);
  let mask = frameMask(creature.mask, frame);
  // The cursor→anchor line (sprite-core ruling ③): the pupil follows the
  // keeper's cursor. ALERT is canon-frozen (centred glint) and stays itself.
  if (anchor !== "CENTER") {
    mask = maskWithPupilAnchor(mask, anchor, frame === "alert");
  }
  // The four-slot expansion (sprite-core ruling ③): canonical masks render
  // through the seven-slot table, so the pupil and iris wear their stage
  // colours instead of collapsing into the eye void. The body family decays
  // along the §5.2 individual track with the world's GV, the pupil wears the
  // §4 individually aged colour (genome drift, ticket 0041), and the 返祖体
  // marker (§7) replaces all of it with the forced phosphor colours, which no
  // decay path ever touches — exempt by construction.
  const canonPalette = isCanonicalMask(mask)
    ? creature.atavistic === true
      ? atavisticPalette()
      : decayedCanonicalPalette(
          pupilStageForGv(world.gv),
          world.gv,
          creature.genome?.drift.length ?? 0,
        )
    : undefined;
  const colors = slotPalette(creature.palette, palette.creature);
  // Faction accent (stream F, ticket 0006 §6, consumed by integration):
  // tender/wrong members wear their faction's colour in the accent slot, the
  // rest keep their sex (or fallback) colour. Pure: faction is derived from
  // the creature's memories about the player.
  const faction = factionOf(beliefAboutPlayer(world.memories?.[id]));
  const accented: readonly string[] =
    faction === null ? colors : [...colors.slice(0, 3), factionAccent(faction, colors[3] ?? palette.creature[3])];
  return {
    kind: "creature",
    id,
    frame,
    mask,
    alertMask: frameMask(creature.mask, "alert"),
    palette: accented,
    ...(canonPalette === undefined ? {} : { canonPalette, pupilAnchor: anchor }),
    center: tileCenter(creature.position),
    depth: creature.position.x + creature.position.y,
  };
}

export function planStructure(structure: Structure, stage: number = 0): StructureDraw {
  return {
    kind: "structure",
    structure: structure.kind,
    center: tileCenter(structure.at),
    depth: structure.at.x + structure.at.y,
    height: towerHeight(stage),
    stage: Math.min(4, Math.max(0, Math.floor(stage))),
  };
}

/**
 * Painter's order: by tile depth, then on the same tile structures behind eggs
 * behind creatures (the egg lies on the floor; the creature stands on it), then
 * id, so the ordering is stable for identical worlds.
 */
const KIND_ORDER: Readonly<Record<SceneObject["kind"], number>> = {
  structure: 0,
  egg: 1,
  creature: 2,
};

function compare(a: SceneObject, b: SceneObject): number {
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }
  if (a.kind !== b.kind) {
    return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  }
  return a.kind === "creature" && b.kind === "creature" ? a.id.localeCompare(b.id) : 0;
}

/** The fixed floor: the same tiles every frame, since the camera never moves. */
export function gridTiles(): readonly TileDraw[] {
  const tiles: TileDraw[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      tiles.push(tileAt(col, row));
    }
  }
  return tiles;
}

export function creatureDraws(
  world: WorldState,
  palette: Palette,
  anchors?: ReadonlyMap<CreatureId, PupilAnchor>,
): readonly CreatureDraw[] {
  return Object.entries(world.creatures)
    .map(([id, creature]) => creatureDraw(id, creature, world, palette, anchors?.get(id) ?? "CENTER"))
    .sort(compare);
}

/**
 * The whole scene as data. `season` defaults to the world's own act — one act,
 * one season — so callers never have to know the mapping. `anchors` optionally
 * carries the cursor-derived pupil anchor per creature (ticket 0025); absent
 * anchors are CENTER, exactly as before.
 */
export function scenePlan(
  world: WorldState,
  decay: number = world.paletteDecay,
  season: Season = seasonForStage(world.stage),
  anchors?: ReadonlyMap<CreatureId, PupilAnchor>,
): ScenePlan {
  const palette = paletteAt(decay, season);
  const objects: SceneObject[] = world.structures.map((structure) =>
    planStructure(structure, world.stage),
  );
  objects.push(...creatureDraws(world, palette, anchors));
  for (const egg of world.eggs) {
    const center = tileCenter(egg.at);
    objects.push({
      kind: "egg",
      id: egg.id,
      center,
      depth: egg.at.x + egg.at.y,
      forced: egg.forced,
    });
  }
  objects.sort(compare);
  const tiles: TileDraw[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const tile = corruptTile(col, row, world);
      // Terrain traces ride on the tile data (ticket 0006 §7): keyed by the
      // same hash the social layer uses, absent when no social state exists.
      const stain = world.social?.stains[stainKey(tile.tile)];
      tiles.push(stain === undefined ? tile : { ...tile, stain });
    }
  }
  return {
    palette,
    season,
    tiles,
    objects,
    eyePairs: darkEyePairs(world.stage),
    vignette: vignetteAlpha(world.stage),
  };
}

/** Where a creature stands, or null when it is not in the world. */
export function creatureCenter(world: WorldState, id: CreatureId): ScreenPos | null {
  const creature = world.creatures[id];
  return creature === undefined ? null : tileCenter(creature.position);
}

// --- Ticket 0025 helpers (FX-LIB-01a canvas layer) ----------------------------

/**
 * C-08 map_wither: the tiles a wither of `radius` (Chebyshev, clamped 2–5)
 * reaches from a centre tile, clipped to the grid. Pure: the same centre and
 * radius always wither the same ground.
 */
export function witherTiles(center: TilePos, radius: number): readonly TilePos[] {
  const reach = Math.min(5, Math.max(2, Math.floor(Number.isFinite(radius) ? radius : 2)));
  const tiles: TilePos[] = [];
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) {
        continue;
      }
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/**
 * The cursor→anchor line (sprite-core ruling ③): where the keeper's cursor
 * (logical pixels) puts a creature's pupil, given where the creature stands.
 * Pure, deterministic, and tie-stable via `pupilAnchorFor`.
 */
export function pupilAnchorAt(cursor: ScreenPos, home: TilePos): PupilAnchor {
  return pupilAnchorFor(unproject(cursor), home);
}
