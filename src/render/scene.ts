/**
 * The isometric scene, described as data.
 *
 * Nothing here touches PixiJS. `scenePlan` turns a `WorldState` into a list of
 * draw instructions in logical pixels, and `app.ts` is the only file that turns
 * those into GPU objects. That split keeps the geometry testable and keeps the
 * 320x180 fixed camera in one place.
 */

import type { CreatureId, CreatureState, Structure, TilePos, WorldState } from "../sim/types";
import type { Palette } from "./palette";
import { paletteAt } from "./palette";
import type { SpriteFrame } from "./sprite";
import { frameFor, frameMask, spriteMask } from "./sprite";

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
}

export interface CreatureDraw {
  readonly kind: "creature";
  readonly id: CreatureId;
  readonly frame: SpriteFrame;
  readonly mask: readonly string[];
  /** Eyes-forward frame, used while the creature is watching the player. */
  readonly alertMask: readonly string[];
  readonly palette: readonly string[];
  readonly center: ScreenPos;
  readonly depth: number;
}

export interface StructureDraw {
  readonly kind: "structure";
  readonly structure: Structure["kind"];
  readonly center: ScreenPos;
  readonly depth: number;
  /** Height in logical pixels; the tower is tall. */
  readonly height: number;
}

export type SceneObject = CreatureDraw | StructureDraw;

export interface ScenePlan {
  readonly palette: Palette;
  readonly tiles: readonly TileDraw[];
  readonly objects: readonly SceneObject[];
}

const TOWER_HEIGHT = 44;

function tileAt(col: number, row: number): TileDraw {
  const tile = { x: col, y: row };
  return { tile, center: tileCenter(tile), light: (col + row) % 2 === 0 };
}

/** Fills a creature's palette to four slots from the cozy fallback. */
function slotPalette(colors: readonly string[], fallback: readonly string[]): readonly string[] {
  return [0, 1, 2, 3].map((slot) => colors[slot] ?? fallback[slot] ?? "#ff00ff");
}

function creatureDraw(
  id: CreatureId,
  creature: CreatureState,
  palette: Palette,
): CreatureDraw {
  const mask = spriteMask(creature);
  const frame = frameFor(creature);
  return {
    kind: "creature",
    id,
    frame,
    mask,
    alertMask: frameMask(creature.mask, "alert"),
    palette: slotPalette(creature.palette, palette.creature),
    center: tileCenter(creature.position),
    depth: creature.position.x + creature.position.y,
  };
}

export function planStructure(structure: Structure): StructureDraw {
  return {
    kind: "structure",
    structure: structure.kind,
    center: tileCenter(structure.at),
    depth: structure.at.x + structure.at.y,
    height: TOWER_HEIGHT,
  };
}

/**
 * Painter's order: by tile depth, then structures behind creatures on the same
 * tile, then id, so the ordering is stable for identical worlds.
 */
function compare(a: SceneObject, b: SceneObject): number {
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }
  if (a.kind !== b.kind) {
    return a.kind === "structure" ? -1 : 1;
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

export function creatureDraws(world: WorldState, palette: Palette): readonly CreatureDraw[] {
  return Object.entries(world.creatures)
    .map(([id, creature]) => creatureDraw(id, creature, palette))
    .sort(compare);
}

export function scenePlan(world: WorldState, decay: number = world.paletteDecay): ScenePlan {
  const palette = paletteAt(decay);
  const objects: SceneObject[] = world.structures.map(planStructure);
  objects.push(...creatureDraws(world, palette));
  objects.sort(compare);
  return { palette, tiles: gridTiles(), objects };
}

/** Where a creature stands, or null when it is not in the world. */
export function creatureCenter(world: WorldState, id: CreatureId): ScreenPos | null {
  const creature = world.creatures[id];
  return creature === undefined ? null : tileCenter(creature.position);
}
