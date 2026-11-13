/**
 * Canonical gazer sprite masks — ART-CORE-01 §2/§6, encoded per [R5].
 *
 * "The mask is the creature": every pose is a character grid in code, never a
 * bitmap. The tables below are verbatim against the reviewed pixel maps; the
 * render layer (`sprite.ts`) derives the final sprite from them.
 *
 * Legend (ART-CORE-01 §2 图例):
 *   `.` transparent    `J` body base     `H` body highlight   `S` body shade / shadow
 *   `E` eye void       `P` pupil (stage colour)               `G` eye glint
 *   `I` iris ring (alert only)
 *
 * The authored grids carry `J` wherever the spec's body-paint rule (top rim
 * J→H, bottom arc J→S) will paint later, so the tables stay diff-able against
 * the spec document. Mask keys follow the `gazer_<pose>_<micro>` convention
 * (§1); ALERT is a single frame and carries no micro suffix.
 */

import {
  BODY_BASE_COLOR,
  CLOSEUP_PALETTE,
  EYE_VOID_COLOR,
  GLINT_COLOR,
  canonicalPalette,
  colorBytes,
} from "./palette";

/** The canonical sprite grid. 8×8 per §1; mirrors `MASK_SIZE` in sprite.ts. */
export const CANON_SIZE = 8;

/**
 * §2.1/§2.2/§2.3/§2.4/§2.5 verbatim. Idle A/B differ only in the top/bottom
 * body rows (jelly breath); the four eye rows (rows 1–4) are identical, which
 * the CI pins — the eyes never move.
 */
export const GAZER_MASKS: Readonly<Record<string, readonly string[]>> = {
  gazer_idle_a: [
    "..JJJJ..",
    ".JGEEEJ.",
    "JJEPPEJJ",
    "JJEPPEJJ",
    ".JEEEEJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
  gazer_idle_b: [
    "...JJJ..",
    ".JGEEEJ.",
    "JJEPPEJJ",
    "JJEPPEJJ",
    ".JEEEEJ.",
    ".JJJJJJ.",
    "..SS....",
    "........",
  ],
  // §2.3 EAT, verbatim (ticket 0042, R4 以像素图为准): rows 1/4 keep the
  // four-column eye rim; rows 2/3 squint shut to the CENTER two columns
  // (cols 3–4 — the squint line is centred, not shifted a pixel right).
  gazer_eat_a: [
    "..JJJJ..",
    ".JEEEEJ.",
    "JJJEEJJJ",
    "JJJEEJJJ",
    ".JEEEEJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
  // Micro B: the squint opens one column per side (cols 2–5, still centred).
  // Still no mouth; the glint stays gone (§2.3).
  gazer_eat_b: [
    "..JJJJ..",
    ".JEEEEJ.",
    "JJEEEEJJ",
    "JJEEEEJJ",
    ".JEEEEJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
  // §2.4 SLEEP: the closed-eye line is two staggered S runs sinking toward
  // the lower right — a cross-player constant, never explained. The shadow
  // rides on row5 here; micro B sinks the whole body one row, which lands it
  // on row6 exactly as the spec draws it.
  gazer_sleep_a: [
    "........",
    "..JJJJ..",
    ".JJSSJJ.",
    ".JJJSSJ.",
    "..JJJJ..",
    "..SS....",
    "........",
    "........",
  ],
  gazer_sleep_b: [
    "........",
    "........",
    "..JJJJ..",
    ".JJSSJJ.",
    ".JJJSSJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
  // §2.5 ALERT: iris ring around a centred glint — facing the viewer.
  // Single frame, no micro loop; stillness is the performance.
  gazer_alert: [
    "..JJJJ..",
    ".JIIIIJ.",
    "JJIGEIJJ",
    "JJIEEIJJ",
    ".JIIIIJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
  // §7 哀悼体 (ticket 0037): the standing posture with SLEEP's closed-eye
  // line inside it — awake in the body, shut in the eye. The line keeps
  // SLEEP's stagger: the right half sinks one row, tilting toward the lower
  // right, the same cross-player constant the sleep pose holds.
  gazer_grief: [
    "..JJJJ..",
    ".JEEEEJ.",
    "JJESSEJJ",
    "JJEESSJJ",
    ".JEEEEJ.",
    "..JJJJ..",
    "..SS....",
    "........",
  ],
};

/**
 * §3 pupil anchors: the top-left corner of the 2×2 pupil inside the eye block
 * (rows 1–4 × cols 2–5). The pupil steps between exactly these five spots.
 */
export const PUPIL_ANCHORS = {
  CENTER: { x: 3, y: 2 },
  TL: { x: 2, y: 1 },
  TR: { x: 4, y: 1 },
  BL: { x: 2, y: 3 },
  BR: { x: 4, y: 3 },
} as const;

export type PupilAnchor = keyof typeof PUPIL_ANCHORS;

/** The glint: one pixel, upper-left of the eye block, in every non-alert pose. */
export const GLINT_POS = { x: 2, y: 1 } as const;
/** [R1] ALERT is the one canonical exception: the glint centres on the viewer. */
export const GLINT_ALERT_POS = { x: 3, y: 2 } as const;

/**
 * Body-paint rule (§2 体绘规则, applied by the render layer): per column, the
 * topmost body pixel becomes the highlight rim and the bottommost becomes the
 * shade arc. Explicitly authored `S` cells (shadow rows, the sleep eye line)
 * are never touched, and only `J` cells are repainted.
 */
export function bodyPaint(mask: readonly string[]): string[] {
  const rows = mask.map((row) => row.split(""));
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  // The body's whole vertical extent, for tie-breaking lone body pixels.
  let bodyTop = Number.POSITIVE_INFINITY;
  let bodyBottom = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < height; y += 1) {
    if (rows[y]?.includes("J") === true) {
      bodyTop = Math.min(bodyTop, y);
      bodyBottom = Math.max(bodyBottom, y);
    }
  }
  for (let x = 0; x < width; x += 1) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      if (rows[y]?.[x] === "J") {
        if (top < 0) {
          top = y;
        }
        bottom = y;
      }
    }
    if (top < 0) {
      continue;
    }
    if (top === bottom) {
      // A lone body pixel in its column: the rim it belongs to is decided by
      // which half of the body it sits in (e.g. the bottom bulge of the
      // in-breath frame is shade, not highlight).
      const row = rows[top];
      if (row !== undefined) {
        row[x] = top - bodyTop < bodyBottom - top ? "H" : "S";
      }
      continue;
    }
    const topRow = rows[top];
    if (topRow !== undefined) {
      topRow[x] = "H";
    }
    const bottomRow = rows[bottom];
    if (bottomRow !== undefined) {
      bottomRow[x] = "S";
    }
  }
  return rows.map((row) => row.join(""));
}

/**
 * The back of the same body (ticket 0033, E4's one canonical gaze): the
 * creature faces the tower, so the viewer sees the silhouette without a face.
 * Derived from whatever frame is current — every face pixel (eye void, pupil,
 * glint, iris; the legacy eye `o`) becomes body — so the silhouette never
 * changes and movement keeps animating. The pupil rules are untouched by
 * construction (ART-CORE-03 §6.4: in the pupil's rules the tower does not
 * exist) — a back has no pupil at all. Pure and deterministic.
 */
export function backSilhouette(mask: readonly string[]): string[] {
  return mask.map((row) =>
    row
      .split("")
      .map((ch) => (ch === "E" || ch === "P" || ch === "G" || ch === "I" ? "J" : ch === "o" ? "#" : ch))
      .join(""),
  );
}

/**
 * Stamps the 2×2 pupil at an anchor. The pupil is exactly one block: wherever
 * it moved from, it leaves the eye void behind. It may cover eye-interior
 * pixels only (`E`, `P`, and the glint's cell — [R2] lets the glint win
 * because it is drawn last); body, shade and iris pixels are never painted.
 */
export function placePupil(mask: readonly string[], anchor: PupilAnchor): string[] {
  const at = PUPIL_ANCHORS[anchor];
  const rows = mask.map((row) => row.split(""));
  for (const row of rows) {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === "P") {
        row[x] = "E";
      }
    }
  }
  for (let dy = 0; dy < 2; dy += 1) {
    const row = rows[at.y + dy];
    if (row === undefined) {
      continue;
    }
    for (let dx = 0; dx < 2; dx += 1) {
      const cell = row[at.x + dx];
      if (cell === "E" || cell === "P" || cell === "G") {
        row[at.x + dx] = "P";
      }
    }
  }
  return rows.map((row) => row.join(""));
}

/**
 * [R2] The glint is the last pixel drawn: after the pupil has stepped onto
 * its anchor, the glint is repainted over it. It covers eye-interior pixels
 * only, so it can never leak onto the body.
 */
export function drawGlint(
  mask: readonly string[],
  at: { readonly x: number; readonly y: number } = GLINT_POS,
): string[] {
  const rows = mask.map((row) => row.split(""));
  const row = rows[at.y];
  const cell = row?.[at.x];
  if (row !== undefined && (cell === "E" || cell === "P" || cell === "G")) {
    row[at.x] = "G";
  }
  return rows.map((row) => row.join(""));
}

/**
 * Ticket 0025 (sprite-core ruling ③): the cursor→anchor line runs for real.
 * Re-seats a canonical mask's pupil at a non-default anchor. Two canon rules
 * are preserved on purpose:
 *   - ALERT is a single frozen frame whose glint is already centred on the
 *     viewer (§2.5, [R1]) — it is returned untouched, always;
 *   - the glint is repainted last after the pupil moves ([R2]), so the pixel
 *     that reads "it sees you" survives the step.
 * CENTER and an already-canonical mask are the identity (a copy, never the
 * caller's array).
 */
export function maskWithPupilAnchor(
  mask: readonly string[],
  anchor: PupilAnchor,
  alert: boolean = false,
): string[] {
  if (alert || anchor === "CENTER") {
    return [...mask];
  }
  return drawGlint(placePupil(mask, anchor), GLINT_POS);
}

/**
 * Canonical slot table for the full-fidelity render: seven colours, one per
 * legend character. Palette order matches `canonicalPalette` in palette.ts.
 */
export const CANON_SLOTS: Readonly<Record<string, number>> = {
  J: 0,
  H: 1,
  S: 2,
  E: 3,
  P: 4,
  G: 5,
  I: 6,
};

/**
 * Full-fidelity RGBA bytes for a canonical mask (8×8, row-major). Separate
 * from `sprite.ts`'s `renderMask` because the four-slot scene path maps the
 * legend onto the legacy palette for a degraded preview; this renderer is the
 * spec-exact one the CI asserts against.
 */
export function renderGazerMask(mask: readonly string[], palette: readonly string[]): Uint8Array {
  const out = new Uint8Array(CANON_SIZE * CANON_SIZE * 4);
  for (let y = 0; y < CANON_SIZE; y += 1) {
    const row = mask[y] ?? "";
    for (let x = 0; x < CANON_SIZE; x += 1) {
      const slot = CANON_SLOTS[row[x] ?? "."];
      if (slot === undefined) {
        continue;
      }
      const color = palette[slot];
      const bytes = color === undefined ? null : colorBytes(color);
      if (bytes === null) {
        continue;
      }
      const at = (y * CANON_SIZE + x) * 4;
      out[at] = bytes[0];
      out[at + 1] = bytes[1];
      out[at + 2] = bytes[2];
      out[at + 3] = bytes[3];
    }
  }
  return out;
}

// --- The pupil close-up (ART-CORE-01 §6) -------------------------------------

export const CLOSEUP_SIZE = 16;
/** Open: the iris grows 2→4→8→12→16, nearest-neighbour steps, over 400ms. */
export const CLOSEUP_OPEN_MS = 400;
export const CLOSEUP_OPEN_STEPS: readonly [number, number, number, number, number] = [2, 4, 8, 12, 16];
/** Close: two eyelid rectangles shut over 200ms. */
export const CLOSEUP_CLOSE_MS = 200;

// --- The borrowed pupil (NARRATIVE-CORE-01 §6 借瞳, ticket 0029) --------------

/**
 * 借瞳:打印期间返祖体的瞳孔临时显示对应刻符位图——它在"誊写"。刻符
 * 3×4 放大 4 倍成 12×16,每一格落成整块像素,无插值。`▓` 落眼底色系
 * (E),`·` 落身体底色(J):与眼睛同一套黑,读作瞳孔里的纹身。
 */
export const GLYPH_PUPIL_SCALE = 4;
export const GLYPH_PUPIL_WIDTH = 3 * GLYPH_PUPIL_SCALE;
export const GLYPH_PUPIL_HEIGHT = 4 * GLYPH_PUPIL_SCALE;

/**
 * One borrowed-pupil frame as RGBA bytes (12×16, row-major). The glyph rows
 * come verbatim from the canon layer (`canonGlyphs()[n].rows`); unknown or
 * short rows render as body, so untrusted input can never punch a hole.
 * Pure: no canvas, no clock, so a test can assert pixel output directly.
 */
export function borrowPupilFrame(glyph: readonly string[]): Uint8Array {
  const voidBytes = colorBytes(EYE_VOID_COLOR);
  const bodyBytes = colorBytes(BODY_BASE_COLOR);
  const out = new Uint8Array(GLYPH_PUPIL_WIDTH * GLYPH_PUPIL_HEIGHT * 4);
  for (let cellY = 0; cellY < 4; cellY += 1) {
    const row = glyph[cellY] ?? "";
    for (let cellX = 0; cellX < 3; cellX += 1) {
      const bytes = row[cellX] === "▓" ? voidBytes : bodyBytes;
      if (bytes === null) {
        continue;
      }
      for (let dy = 0; dy < GLYPH_PUPIL_SCALE; dy += 1) {
        for (let dx = 0; dx < GLYPH_PUPIL_SCALE; dx += 1) {
          const x = cellX * GLYPH_PUPIL_SCALE + dx;
          const y = cellY * GLYPH_PUPIL_SCALE + dy;
          const at = (y * GLYPH_PUPIL_WIDTH + x) * 4;
          out[at] = bytes[0];
          out[at + 1] = bytes[1];
          out[at + 2] = bytes[2];
          out[at + 3] = bytes[3];
        }
      }
    }
  }
  return out;
}

/**
 * §6 V1 (S0–S1): the grass reflection. One-pixel dark rim is the eye edge;
 * the dark corners draw the circle. Chars: `D` dark, `T` sky, `g` grass,
 * `f` flower white, `B` bright.
 */
export const GAZER_CLOSEUP_V1: readonly string[] = [
  "DDDDDDDDDDDDDDDD",
  "DTTTTTTTTTTTTTTD",
  "DTTBBTTTTTTTTTTD",
  "DTTBBTTTTTTTTTTD",
  "DTTTTTTTTTTTTTTD",
  "DggggggggggggggD",
  "DggfggggggfggggD",
  "DggggggggggggggD",
  "DDggggggggggggDD",
  "DDDggggggggggDDD",
  "DDDDDggggggDDDDD",
  "DDDDDDDDDDDDDDDD",
  "DDDDDDDDDDDDDDDD",
  "DDDDDDDDDDDDDDDD",
  "DDDDDDDDDDDDDDDD",
  "DDDDDDDDDDDDDDDD",
];

/** Which rung of the open ladder a moment sits on. Pure, deterministic. */
export function closeupOpenSize(openElapsedMs: number): number {
  const elapsed = Number.isFinite(openElapsedMs) ? Math.max(0, Math.floor(openElapsedMs)) : 0;
  const stepMs = CLOSEUP_OPEN_MS / CLOSEUP_OPEN_STEPS.length;
  const index = Math.min(CLOSEUP_OPEN_STEPS.length - 1, Math.floor(elapsed / stepMs));
  return CLOSEUP_OPEN_STEPS[index] ?? 16;
}

/** Eyelid rows covered from the top (and mirrored from the bottom), 0..8. */
export function closeupLidRows(closeElapsedMs: number): number {
  const elapsed = Number.isFinite(closeElapsedMs) ? Math.max(0, closeElapsedMs) : 0;
  return Math.min(CLOSEUP_SIZE / 2, Math.ceil((elapsed / CLOSEUP_CLOSE_MS) * (CLOSEUP_SIZE / 2)));
}

/**
 * One close-up frame as RGBA bytes (16×16, row-major). The final image is
 * shown through a nearest-neighbour ladder while opening (every rung centred
 * on an integer offset — no subpixel), and the eyelids close over it from
 * top and bottom. Pure: the wiring layer supplies elapsed times. This is the
 * V1 renderer, kept as the close-up's original face (ticket 0019).
 */
export function renderCloseupFrame(openElapsedMs: number, closeElapsedMs: number | null): Uint8Array {
  return renderCloseup("v1", { openElapsedMs, closeElapsedMs });
}

// --- Close-up variants V2–V4 (ART-CORE-01 §6, ticket 0037) --------------------

export type CloseupVariant = "v1" | "v2" | "v3" | "v4";

/** V2: the cursor reflection blinks off one frame in twenty. */
export const CLOSEUP_BLINK_FRAME_MS = 200;
export const CLOSEUP_BLINK_PERIOD = 20;
/** V4: the inner creature pulses 8→10→8 over 600ms, every 8 seconds. */
export const CLOSEUP_PULSE_PERIOD_MS = 8000;
export const CLOSEUP_PULSE_MS = 600;

/**
 * The cursor reflection (§6 V2): a 3×5 white arrow with a black outline,
 * pointing toward the upper left — your cursor, mirrored in its eye. `W`
 * white, `K` outline.
 */
export const CLOSEUP_ARROW: readonly string[] = ["WKK", "KWK", "KKW", "KKW", "KKW"];

/** The arrow sits centred-ish in the grass band (rows 6–10, cols 7–9). */
export const CLOSEUP_ARROW_X = 7;
export const CLOSEUP_ARROW_Y = 6;

/** §6 V2: every twentieth frame the arrow hides — it blinks, about 4s apart. */
export function closeupArrowVisible(blinkFrame: number): boolean {
  const frame = Number.isFinite(blinkFrame) ? Math.max(0, Math.floor(blinkFrame)) : 0;
  return frame % CLOSEUP_BLINK_PERIOD !== CLOSEUP_BLINK_PERIOD - 1;
}

/**
 * §6 V4: the pulse. Inside one 8s cycle, the first 600ms breathe 8→10→8
 * (nearest-neighbour steps); the rest holds 8. Only even sizes exist: 9
 * would need a half-pixel centre offset, and subpixel is forbidden (§1).
 */
export function closeupPulseSize(pulseElapsedMs: number): 8 | 10 {
  const elapsed = Number.isFinite(pulseElapsedMs) ? Math.max(0, pulseElapsedMs) : 0;
  const within = elapsed % CLOSEUP_PULSE_PERIOD_MS;
  if (within >= CLOSEUP_PULSE_MS) {
    return 8;
  }
  const rise = Math.sin((within / CLOSEUP_PULSE_MS) * Math.PI);
  return rise > 0.5 ? 10 : 8;
}

/**
 * The inner creature of V4 (§6): the canonical ALERT map — the same pipeline
 * the world sprite runs — with its glint frozen at (3,2), dead centre on the
 * viewer. It mirrors `sprite.ts`'s `canonicalMask("alert")` (the close-up
 * module may not import the sprite layer); the CI pins the two together.
 */
export function closeupV4InnerMask(): string[] {
  return bodyPaint(GAZER_MASKS.gazer_alert ?? []);
}

// --- The 3×5 name font (§6 V3) -------------------------------------------------
//
// 玩家被起的名字: two rows of three 3×5 glyphs, rendered in `#DDE3EA` and
// mirrored as one block — recognisable as writing, unreadable in direction.

const FONT_UNKNOWN = "111111111111111";

/** A minimal 3×5 glyph font: uppercase letters and digits; unknowns block. */
export const CLOSEUP_FONT: Readonly<Record<string, readonly string[]>> = {
  A: ["010", "101", "111", "101", "101"],
  B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"],
  D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"],
  H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"],
  J: ["001", "001", "001", "101", "010"],
  K: ["101", "110", "100", "110", "101"],
  L: ["100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["010", "101", "101", "101", "010"],
  P: ["110", "101", "110", "100", "100"],
  Q: ["010", "101", "101", "011", "001"],
  R: ["110", "101", "110", "110", "101"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"],
  W: ["101", "101", "111", "111", "101"],
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

/**
 * The name block as an 11×11 character grid (`N` = name pixel, `.` = keep the
 * background): two rows of three glyphs, one blank column between them and a
 * blank row between the lines. The WHOLE block is mirrored horizontally as a
 * single image (§6 V3) — the name is written in the direction you cannot read.
 * Chars beyond the first six are dropped; unknown glyphs render as blocks.
 */
export function closeupNameBlock(name: string): string[] {
  const chars = [...(name ?? "")].slice(0, 6).map((ch) => ch.toUpperCase());
  const width = 3 * 3 + 2;
  const height = 5 * 2 + 1;
  const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  chars.forEach((ch, index) => {
    const glyph = CLOSEUP_FONT[ch] ?? FONT_UNKNOWN.match(/.{3}/g) ?? ["000", "000", "000", "000", "000"];
    const gx = (index % 3) * 4;
    const gy = index < 3 ? 0 : 6;
    for (let y = 0; y < 5; y += 1) {
      const row = glyph[y] ?? "000";
      for (let x = 0; x < 3; x += 1) {
        if (row[x] === "1") {
          const target = grid[gy + y];
          if (target !== undefined) {
            target[gx + x] = "N";
          }
        }
      }
    }
  });
  // The mirror is the point: written in the direction you cannot read.
  return grid.map((row) => row.slice().reverse().join(""));
}

/** Where the name block lands: centred, integer offset (16−11 = 5 → 2). */
export const CLOSEUP_NAME_OFFSET = 2;

export interface CloseupFrameOptions {
  readonly openElapsedMs: number;
  readonly closeElapsedMs?: number | null;
  /** V2: the blink counter; the arrow hides on every twentieth frame. */
  readonly blinkFrame?: number;
  /** V3: the name written in the eye (mirrored, ≤6 glyphs). */
  readonly name?: string;
  /** V4: elapsed inside the 8s pulse cycle. */
  readonly pulseElapsedMs?: number;
  /** V4: the pupil stage whose colour the inner iris ring wears. */
  readonly pupilStage?: number;
}

function openLadder(source: readonly string[], openElapsedMs: number): string[][] {
  const size = closeupOpenSize(openElapsedMs);
  const grid: string[][] = Array.from({ length: CLOSEUP_SIZE }, () =>
    Array.from({ length: CLOSEUP_SIZE }, () => "D"),
  );
  const offset = (CLOSEUP_SIZE - size) / 2;
  for (let y = 0; y < size; y += 1) {
    const srcY = Math.floor((y * CLOSEUP_SIZE) / size);
    for (let x = 0; x < size; x += 1) {
      const srcX = Math.floor((x * CLOSEUP_SIZE) / size);
      const cell = source[srcY]?.[srcX];
      const row = grid[offset + y];
      if (cell !== undefined && row !== undefined) {
        row[offset + x] = cell;
      }
    }
  }
  return grid;
}

function closeLids(grid: string[][], closeElapsedMs: number | null | undefined): void {
  const lids = closeElapsedMs === null || closeElapsedMs === undefined ? 0 : closeupLidRows(closeElapsedMs);
  for (let y = 0; y < lids; y += 1) {
    const top = grid[y];
    const bottom = grid[CLOSEUP_SIZE - 1 - y];
    if (top !== undefined) {
      grid[y] = top.map(() => "D");
    }
    if (bottom !== undefined) {
      grid[CLOSEUP_SIZE - 1 - y] = bottom.map(() => "D");
    }
  }
}

/**
 * One close-up frame for any §6 variant, as RGBA bytes (16×16, row-major).
 * All variants open on the shared 2→4→8→12→16 ladder and close under the
 * same eyelids; what the open eye shows differs:
 *   V1 — the grass reflection;
 *   V2 — V1 plus the blinking cursor arrow;
 *   V3 — everything darkened to the eye void, the mirrored name in `#DDE3EA`;
 *   V4 — the eye void, with the 8×8 ALERT creature pulsing dead centre.
 * Pure: the wiring layer supplies all elapsed times and inputs.
 */
export function renderCloseup(variant: CloseupVariant, options: CloseupFrameOptions): Uint8Array {
  const grid = openLadder(GAZER_CLOSEUP_V1, options.openElapsedMs);
  if (variant === "v2" && closeupArrowVisible(options.blinkFrame ?? 0)) {
    for (let y = 0; y < CLOSEUP_ARROW.length; y += 1) {
      const arrowRow = CLOSEUP_ARROW[y];
      const target = grid[CLOSEUP_ARROW_Y + y];
      if (arrowRow === undefined || target === undefined) {
        continue;
      }
      for (let x = 0; x < arrowRow.length; x += 1) {
        target[CLOSEUP_ARROW_X + x] = arrowRow[x] ?? "K";
      }
    }
  }
  if (variant === "v3") {
    // The sky and the grass darken into the void; only the name stays.
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      const row = grid[y];
      if (row !== undefined) {
        grid[y] = row.map(() => "D");
      }
    }
    const block = closeupNameBlock(options.name ?? "");
    for (let y = 0; y < block.length; y += 1) {
      const row = block[y];
      const target = grid[CLOSEUP_NAME_OFFSET + y];
      if (row === undefined || target === undefined) {
        continue;
      }
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === "N") {
          target[CLOSEUP_NAME_OFFSET + x] = "N";
        }
      }
    }
  }
  if (variant === "v4") {
    // Recursion: the void, and inside it another one of them, looking back.
    for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
      const row = grid[y];
      if (row !== undefined) {
        grid[y] = row.map(() => "D");
      }
    }
    const size = closeupPulseSize(options.pulseElapsedMs ?? 0);
    const inner = closeupV4InnerMask();
    const offset = (CLOSEUP_SIZE - size) / 2;
    for (let y = 0; y < size; y += 1) {
      const srcY = Math.floor((y * CANON_SIZE) / size);
      for (let x = 0; x < size; x += 1) {
        const srcX = Math.floor((x * CANON_SIZE) / size);
        const cell = inner[srcY]?.[srcX];
        if (cell === undefined || cell === ".") {
          continue;
        }
        const target = grid[offset + y];
        if (target !== undefined) {
          target[offset + x] = cell;
        }
      }
    }
  }
  closeLids(grid, options.closeElapsedMs);
  return paintGrid(
    grid.map((row) => row.join("")),
    variant === "v4" ? canonLegend(options.pupilStage ?? 0) : CLOSEUP_LEGEND,
  );
}

const CLOSEUP_LEGEND: Readonly<Record<string, string>> = {
  D: CLOSEUP_PALETTE.dark,
  T: CLOSEUP_PALETTE.sky,
  g: CLOSEUP_PALETTE.grass,
  f: CLOSEUP_PALETTE.flower,
  B: CLOSEUP_PALETTE.bright,
  N: CLOSEUP_PALETTE.text,
  W: CLOSEUP_PALETTE.bright,
  K: CLOSEUP_PALETTE.dark,
};

/**
 * V4 paints the inner creature through the canon creature colours: the iris
 * ring wears the current pupil stage colour (§6 V4), the glint stays white.
 */
function canonLegend(pupilStage: number): Readonly<Record<string, string>> {
  const palette = canonicalPalette(pupilStage);
  return {
    // The ladder's dark backdrop maps onto the void as well.
    D: CLOSEUP_PALETTE.dark,
    J: palette[0] ?? BODY_BASE_COLOR,
    H: palette[1] ?? BODY_BASE_COLOR,
    S: palette[2] ?? BODY_BASE_COLOR,
    E: palette[3] ?? EYE_VOID_COLOR,
    I: palette[6] ?? EYE_VOID_COLOR,
    G: palette[5] ?? GLINT_COLOR,
  };
}

function paintGrid(rows: readonly string[], legend: Readonly<Record<string, string>>): Uint8Array {
  const out = new Uint8Array(CLOSEUP_SIZE * CLOSEUP_SIZE * 4);
  for (let y = 0; y < CLOSEUP_SIZE; y += 1) {
    const row = rows[y] ?? "";
    for (let x = 0; x < CLOSEUP_SIZE; x += 1) {
      const hex = legend[row[x] ?? "D"];
      const bytes = hex === undefined ? null : colorBytes(hex);
      if (bytes === null) {
        continue;
      }
      const at = (y * CLOSEUP_SIZE + x) * 4;
      out[at] = bytes[0];
      out[at + 1] = bytes[1];
      out[at + 2] = bytes[2];
      out[at + 3] = bytes[3];
    }
  }
  return out;
}
