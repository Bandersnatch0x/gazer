/**
 * Creature sprites, generated in code.
 *
 * An 8x8 character mask plus a palette becomes a texture. There are no image
 * files: the mask is the creature, and `rewrite_sprite` can replace it at
 * runtime without touching the asset pipeline.
 *
 * Mask characters:
 *   `.` transparent   `#` body (palette[0])   `o` eye (palette[1])
 *   `+` shade (palette[2])                    `*` accent (palette[3])
 */

import type { CreatureBehavior, CreatureTrait } from "../sim/types";
import { colorBytes } from "./palette";

export const MASK_SIZE = 8;
export const MASK_PIXELS = MASK_SIZE * MASK_SIZE;
export const MASK_CHANNELS = 4;

export type SpriteFrame = "idle" | "alert" | "hungry" | "dead";

export const FRAMES: readonly SpriteFrame[] = ["idle", "alert", "hungry", "dead"];

/** Palette slot per mask character. Anything else is transparent. */
export const MASK_SLOTS: Readonly<Record<string, number>> = {
  "#": 0,
  o: 1,
  "+": 2,
  "*": 3,
};

/**
 * Pads or truncates a mask to 8x8 and replaces unknown characters with
 * transparent. Director-supplied masks are untrusted, so this never throws.
 */
export function normalizeMask(mask: readonly string[]): string[] {
  const rows: string[] = [];
  for (let y = 0; y < MASK_SIZE; y += 1) {
    const source = mask[y] ?? "";
    let row = "";
    for (let x = 0; x < MASK_SIZE; x += 1) {
      const ch = source[x] ?? ".";
      row += MASK_SLOTS[ch] === undefined ? "." : ch;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * RGBA bytes, row-major, 8x8, always `MASK_PIXELS * MASK_CHANNELS` long.
 * Pure: no canvas, no GPU, so a test can assert pixel output directly.
 */
export function renderMask(mask: readonly string[], palette: readonly string[]): Uint8Array {
  const out = new Uint8Array(MASK_PIXELS * MASK_CHANNELS);
  const fallback = palette[0];
  for (let y = 0; y < MASK_SIZE; y += 1) {
    const row = mask[y] ?? "";
    for (let x = 0; x < MASK_SIZE; x += 1) {
      const slot = MASK_SLOTS[row[x] ?? "."];
      if (slot === undefined) {
        continue;
      }
      const color = palette[slot] ?? fallback;
      if (color === undefined) {
        continue;
      }
      const bytes = colorBytes(color);
      if (bytes === null) {
        continue;
      }
      const at = (y * MASK_SIZE + x) * MASK_CHANNELS;
      out[at] = bytes[0];
      out[at + 1] = bytes[1];
      out[at + 2] = bytes[2];
      out[at + 3] = bytes[3];
    }
  }
  return out;
}

/** Pixels enclosed by body on both sides in the same row: the eye sockets. */
function eyePixels(rows: readonly string[][]): readonly { x: number; y: number }[] {
  const eyes: { x: number; y: number }[] = [];
  for (let y = 0; y < MASK_SIZE; y += 1) {
    const row = rows[y];
    if (row === undefined) {
      continue;
    }
    for (let x = 1; x < MASK_SIZE - 1; x += 1) {
      if (row[x] === "." && row[x - 1] !== "." && row[x + 1] !== ".") {
        eyes.push({ x, y });
      }
    }
  }
  return eyes;
}

function setPixel(rows: string[][], x: number, y: number, ch: string): void {
  const row = rows[y];
  if (row === undefined || x < 0 || x >= MASK_SIZE) {
    return;
  }
  row[x] = ch;
}

function join(rows: readonly string[][]): string[] {
  return rows.map((row) => row.join(""));
}

/**
 * Derives a frame from a base mask. Frames change eyes and posture, never the
 * silhouette's identity, so a rewritten sprite keeps animating correctly.
 */
export function frameMask(mask: readonly string[], frame: SpriteFrame): string[] {
  const rows = normalizeMask(mask).map((row) => row.split(""));
  const eyes = eyePixels(rows);

  for (const eye of eyes) {
    setPixel(rows, eye.x, eye.y, frame === "alert" ? "o" : "+");
  }

  if (frame === "hungry") {
    // An open mouth: two centre cells below the eyes go transparent.
    for (const y of [3, 4]) {
      setPixel(rows, 3, y, ".");
      setPixel(rows, 4, y, ".");
    }
  }

  if (frame === "dead") {
    // Sunk: the feet and the lower body are gone.
    for (const y of [6, 7]) {
      const row = rows[y];
      if (row !== undefined) {
        for (let x = 0; x < MASK_SIZE; x += 1) {
          row[x] = ".";
        }
      }
    }
  }

  return join(rows);
}

export interface FrameSource {
  readonly behavior: CreatureBehavior;
  readonly trait: CreatureTrait | null;
  readonly mask: readonly string[];
}

/** Which frame a creature is drawn in. Behaviour wins; the watcher trait stares. */
export function frameFor(creature: FrameSource): SpriteFrame {
  if (creature.behavior === "dead") {
    return "dead";
  }
  if (creature.behavior === "hungry" || creature.behavior === "eating") {
    return "hungry";
  }
  if (creature.trait === "watcher") {
    return "alert";
  }
  return "idle";
}

export function spriteMask(creature: FrameSource): string[] {
  return frameMask(creature.mask, frameFor(creature));
}

/** Stable cache key: same mask, frame and palette reuse one texture. */
export function spriteKey(mask: readonly string[], palette: readonly string[]): string {
  return `${mask.join("/")}|${palette.join(",")}`;
}
