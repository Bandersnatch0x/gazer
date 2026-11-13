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

import type { CreatureBehavior, CreatureTrait, TilePos } from "../sim/types";
import { colorBytes } from "./palette";
import type { PupilAnchor } from "./masks";
import {
  GAZER_MASKS,
  GLINT_ALERT_POS,
  GLINT_POS,
  PUPIL_ANCHORS,
  bodyPaint,
  drawGlint,
  placePupil,
} from "./masks";

export const MASK_SIZE = 8;
export const MASK_PIXELS = MASK_SIZE * MASK_SIZE;
export const MASK_CHANNELS = 4;

export type SpriteFrame = "idle" | "alert" | "hungry" | "dead" | "sleep" | "eat" | "grief";

export const FRAMES: readonly SpriteFrame[] = ["idle", "alert", "hungry", "dead", "sleep", "eat", "grief"];

/**
 * Palette slot per mask character. Anything else is transparent.
 *
 * The canonical legend (ART-CORE-01: J/H/S/E/P/G/I) shares the four legacy
 * slots so canonical masks can flow through the existing scene path without
 * holes: body pixels take the body slot, eye pixels the eye slot, shade the
 * shade slot and — most importantly — the glint takes the accent slot, which
 * the wiring layer fills with pure white. The spec-exact seven-colour render
 * lives in `masks.ts` (`renderGazerMask` + `CANON_SLOTS`).
 */
export const MASK_SLOTS: Readonly<Record<string, number>> = {
  "#": 0,
  o: 1,
  "+": 2,
  "*": 3,
  J: 0,
  H: 0,
  S: 2,
  E: 1,
  P: 1,
  I: 1,
  G: 3,
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
  return renderGridMask(mask, palette, { width: MASK_SIZE, height: MASK_SIZE });
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
 * The gaze frame's eye, exaggerated. Each socket becomes a three-wide "o" run:
 * the eye reads from across the room, which is the whole point of a creature
 * named for watching. Interior pixels only — the silhouette never changes, so
 * a rewritten sprite keeps animating correctly.
 */
function widenEye(rows: string[][], eye: { x: number; y: number }): void {
  for (const x of [eye.x - 1, eye.x, eye.x + 1]) {
    const row = rows[eye.y];
    if (row === undefined) {
      continue;
    }
    // Only body/shade pixels may become eye; transparency stays transparent.
    if (row[x] === "#" || row[x] === "+" || row[x] === "o") {
      setPixel(rows, x, eye.y, "o");
    }
  }
}

/** A 2x2 eye stamped into solid body, for masks that never had sockets. */
function stampEye(rows: string[][], x: number, y: number): void {
  for (const dy of [0, 1]) {
    for (const dx of [0, 1]) {
      const row = rows[y + dy];
      if (row === undefined) {
        continue;
      }
      if (row[x + dx] === "#" || row[x + dx] === "+") {
        setPixel(rows, x + dx, y + dy, "o");
      }
    }
  }
}

/** A mask authored in the canonical ART-CORE-01 legend routes to that pipeline. */
const CANONICAL_CHARS = /[JHSEPGI]/;

function isCanonicalMask(mask: readonly string[]): boolean {
  return mask.some((row) => CANONICAL_CHARS.test(row));
}

/** A dead gazerling loses its shadow; the body deflates where it fell. */
function canonicalDeadMask(): string[] {
  const rows = canonicalMask("idle").map((row) => row.split(""));
  for (const y of [6, 7]) {
    const row = rows[y];
    if (row !== undefined) {
      row.fill(".");
    }
  }
  return rows.map((row) => row.join(""));
}

/**
 * Derives a frame from a base mask. Frames change eyes and posture, never the
 * silhouette's identity, so a rewritten sprite keeps animating correctly.
 *
 * Canonical masks (ART-CORE-01 legend) never go through the socket heuristics
 * below — they route straight to the canonical pose pipeline, so the true
 * ALERT/EAT/SLEEP pixel maps reach the scene through the existing seam.
 *
 * The alert frame is the title image: every eye socket widens into a bright
 * run, and a mask with no sockets at all gets one centre eye stamped into its
 * body — no creature may be eyeless while it is looking at you. No frame ever
 * carves a mouth: these creatures do not have one, and the law is absolute.
 */
export function frameMask(mask: readonly string[], frame: SpriteFrame): string[] {
  if (isCanonicalMask(mask)) {
    switch (frame) {
      case "alert":
        return canonicalMask("alert");
      case "sleep":
        return canonicalMask("sleep");
      case "eat":
        return canonicalMask("eat");
      case "grief":
        return canonicalMask("grief");
      case "dead":
        return canonicalDeadMask();
      default:
        // Idle and hungry share the watching face: hunger is posture, not a hole.
        return canonicalMask("idle");
    }
  }

  const rows = normalizeMask(mask).map((row) => row.split(""));
  let eyes = eyePixels(rows);

  if (frame === "alert" && eyes.length === 0) {
    // The cyclops fallback: carve (paint, not cut) one eye out of the body.
    stampEye(rows, 3, 2);
    stampEye(rows, 3, 3);
    eyes = eyePixels(rows);
  }

  for (const eye of eyes) {
    setPixel(rows, eye.x, eye.y, frame === "alert" ? "o" : "+");
  }
  if (frame === "alert") {
    for (const eye of eyes) {
      widenEye(rows, eye);
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
  /** §7 哀悼体 (ticket 0037): standing, with SLEEP's closed-eye line. */
  readonly grief?: boolean;
}

/**
 * Which frame a creature is drawn in. Behaviour wins; the watcher trait stares.
 * Sleeping and eating map to their own ART-CORE-01 poses; the 哀悼体 marker
 * closes the eye in an awake posture (§7). A canonical mask then renders the
 * real pixel maps, a legacy mask falls back to idle-like treatment inside
 * `frameMask`.
 */
export function frameFor(creature: FrameSource): SpriteFrame {
  if (creature.behavior === "dead") {
    return "dead";
  }
  if (creature.behavior === "sleeping") {
    return "sleep";
  }
  if (creature.behavior === "eating") {
    return "eat";
  }
  if (creature.behavior === "hungry") {
    return "hungry";
  }
  if (creature.grief === true) {
    // The grief line beats the stare: a closed eye cannot watch you back.
    return "grief";
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

// --- Canonical gazer poses (ART-CORE-01 §2/§3, ticket 0019) -------------------

export const POSES = ["idle", "eat", "sleep", "alert", "grief"] as const;

export type SpritePose = (typeof POSES)[number];

/** Microframe letter: `a` and `b` alternate; ALERT and GRIEF hold one frame. */
export type Micro = "a" | "b";

/**
 * Microframe cadence (§2): the jelly breathes at 250ms per microframe, eating
 * squints at the same beat, sleep sinks at 1200ms, and ALERT holds a single
 * frame — stillness is the performance, so there is no loop to leave. GRIEF
 * is a standing vigil; its line does not flicker either (§7).
 */
export const MICROFRAME_MS: Readonly<Record<SpritePose, number>> = {
  idle: 250,
  eat: 250,
  sleep: 1200,
  alert: 0,
  grief: 0,
};

/**
 * The microframe an elapsed moment falls on. Pure: the caller supplies the
 * clock, so replaying a timeline replays the exact same frames. No easing, no
 * tween — the mask jumps between two authored grids, and that mechanical snap
 * is the life (§3 追踪节奏).
 *
 * `phaseOffsetMs` (ticket 0037) is the twin-souls seam (§7): the pair reads
 * the same clock with the SAME offset, so their microframes share one phase
 * with zero error. Creatures with different offsets drift apart by design.
 */
export function microFor(pose: SpritePose, elapsedMs: number, phaseOffsetMs = 0): Micro {
  const cadence = MICROFRAME_MS[pose];
  if (cadence <= 0) {
    return "a";
  }
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.floor(elapsedMs - phaseOffsetMs))
    : 0;
  return elapsed % (cadence * 2) < cadence ? "a" : "b";
}

export interface CanonicalOptions {
  readonly micro?: Micro;
  readonly anchor?: PupilAnchor;
}

// --- Ticket 0042: microframes into the live scene, the 400ms anchor beat,
// and the twin-souls follow (ART-CORE-01 §2/§3/§7) ------------------------------

/**
 * Which canonical pose a scene frame breathes in. `hungry` wears the idle
 * body (hunger is posture, not a hole); the single-frame poses (ALERT, GRIEF)
 * and the corpse return null — there is no microframe loop to run.
 */
export function microPoseFor(frame: SpriteFrame): SpritePose | null {
  switch (frame) {
    case "idle":
    case "hungry":
      return "idle";
    case "eat":
      return "eat";
    case "sleep":
      return "sleep";
    default:
      return null;
  }
}

/**
 * The microframe mask a canonical creature wears at one clock moment, or null
 * when the frame holds a single authored frame (or the mask is not canonical —
 * legacy masks have no A/B grids to alternate). Pure: the caller supplies the
 * clock, so an injected tick clock replays the exact same frames.
 */
export function microMaskFor(
  frame: SpriteFrame,
  canonical: boolean,
  clockMs: number,
  phaseOffsetMs: number,
  anchor: PupilAnchor,
): string[] | null {
  if (!canonical) {
    return null;
  }
  const pose = microPoseFor(frame);
  if (pose === null) {
    return null;
  }
  return canonicalMask(pose, { micro: microFor(pose, clockMs, phaseOffsetMs), anchor });
}

/**
 * A creature's microframe phase offset, derived from its id alone: the same id
 * always breathes with the same offset, and the herd does not breathe in
 * lockstep. Pure and deterministic — no wall clock anywhere.
 */
export function phaseOffsetMsFor(id: string, capMs = 500): number {
  const cap = Number.isFinite(capMs) && capMs > 0 ? Math.floor(capMs) : 0;
  if (cap === 0) {
    return 0;
  }
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash ^ id.charCodeAt(i)) * 16777619) >>> 0;
  }
  return hash % cap;
}

/**
 * The mutual twin partner of a creature, or null. Only a mutual pair (both
 * naming each other) is a twin-soul pair — a dangling marker follows nobody.
 */
export function twinPartner(
  world: Readonly<{ readonly creatures: Readonly<Record<string, { readonly twinOf?: string }>> }>,
  id: string,
): string | null {
  const self = world.creatures[id];
  const named = self?.twinOf;
  if (named === undefined) {
    return null;
  }
  return world.creatures[named]?.twinOf === id ? named : null;
}

/** §3 追踪节奏: the pupil anchors are re-evaluated on this beat, and only then. */
export const ANCHOR_BEAT_MS = 400;

/** The beat index a clock moment falls on. Pure; jumps, never eases. */
export function anchorBeatAt(clockMs: number): number {
  const ms = Number.isFinite(clockMs) ? Math.max(0, Math.floor(clockMs)) : 0;
  return Math.floor(ms / ANCHOR_BEAT_MS);
}

/**
 * The full anchor resolution for one beat (§3 + §7, ticket 0042), in tile
 * space. Order of force:
 *   1. the cursor's quadrant per creature (`pupilAnchorFor`);
 *   2. the GV90 exception (ART-CORE-03 §6.4) — within two tiles of the tower
 *      an idle creature's pupil is forced CENTER: it is not looking at the
 *      tower, it is looking at whether you are looking. This beats the cursor;
 *   3. twin souls — the pair follows the lead twin (the smaller id) LAST, so
 *      whatever the lead shows — cursor, or the forced CENTER — is the one eye
 *      both bodies wear on the same frame.
 * Pure: same world, same cursor, same anchors.
 */
export function resolvePupilAnchors(
  world: Readonly<{
    readonly gv: number;
    readonly creatures: Readonly<
      Record<string, { readonly id: string; readonly position: TilePos; readonly behavior?: string; readonly twinOf?: string }>
    >;
    readonly structures: readonly { readonly kind: string; readonly at: TilePos }[];
  }>,
  cursorTile: TilePos,
): Map<string, PupilAnchor> {
  const anchors = new Map<string, PupilAnchor>();
  for (const creature of Object.values(world.creatures)) {
    anchors.set(creature.id, pupilAnchorFor(cursorTile, creature.position));
  }
  if (world.gv >= 90) {
    const tower = world.structures.find((structure) => structure.kind === "black_tower");
    if (tower !== undefined) {
      for (const creature of Object.values(world.creatures)) {
        const dx = Math.abs(creature.position.x - tower.at.x);
        const dy = Math.abs(creature.position.y - tower.at.y);
        if (creature.behavior === "idle" && Math.max(dx, dy) <= 2) {
          anchors.set(creature.id, "CENTER");
        }
      }
    }
  }
  for (const creature of Object.values(world.creatures)) {
    const partner = twinPartner(world, creature.id);
    if (partner === null) {
      continue;
    }
    // The pair follows the lead twin — the smaller id owns the eye.
    const lead = [creature.id, partner].sort()[0] ?? creature.id;
    const leadAnchor = anchors.get(lead);
    if (leadAnchor !== undefined) {
      anchors.set(creature.id, leadAnchor);
      anchors.set(partner, leadAnchor);
    }
  }
  return anchors;
}

/**
 * The final canonical mask for a pose: the verbatim canon table [R13 — the
 * pixel maps are per-pixel canon; nothing clips them], the body-paint rims
 * (top J→H, bottom arc J→S), the pupil at its anchor, and the glint drawn
 * last — [R2] says the glint wins any collision with the pupil. EAT loses
 * the glint while squinting (§2.3); SLEEP has no eye to light; ALERT is a
 * single frozen frame with the glint centred (§2.5, [R1]).
 */
export function canonicalMask(pose: SpritePose, options: CanonicalOptions = {}): string[] {
  const micro = options.micro ?? "a";
  // Single-frame poses carry no micro suffix (ALERT, GRIEF); the breathing
  // poses key on their microframe letter.
  const key = MICROFRAME_MS[pose] <= 0 ? `gazer_${pose}` : `gazer_${pose}_${micro}`;
  const authored = GAZER_MASKS[key];
  if (authored === undefined) {
    return canonicalMask("idle", options);
  }
  const painted = bodyPaint(authored);
  if (pose === "alert") {
    return drawGlint(painted, GLINT_ALERT_POS);
  }
  if (pose === "sleep" || pose === "grief") {
    // Eyes closed: no pupil, no glint. GRIEF keeps SLEEP's tilted line while
    // standing (§7); the pupil rules are not in force on a shut eye.
    return painted;
  }
  const pupil = placePupil(painted, options.anchor ?? "CENTER");
  return pose === "eat" ? pupil : drawGlint(pupil, GLINT_POS);
}

/**
 * §3 anchor selection: the pupil rests at CENTER when the cursor stays more
 * than six tiles away (or exactly on the watcher), otherwise it snaps to the
 * cursor's quadrant. Ties on an axis fall low/right — deterministic, and a
 * cursor gliding along an axis produces a stable anchor, not a flicker.
 */
export function pupilAnchorFor(cursor: TilePos, home: TilePos): PupilAnchor {
  const dx = Math.trunc(cursor.x) - Math.trunc(home.x);
  const dy = Math.trunc(cursor.y) - Math.trunc(home.y);
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 6 || (dx === 0 && dy === 0)) {
    return "CENTER";
  }
  const horizontal = dx < 0 ? "L" : "R";
  const vertical = dy < 0 ? "T" : "B";
  return (vertical + horizontal) as PupilAnchor;
}

/** The five anchors, re-exported here for the seam's consumers. */
export { PUPIL_ANCHORS, GLINT_POS, GLINT_ALERT_POS };
export type { PupilAnchor } from "./masks";

/** Generic mask dimensions for non-creature sprites (currently the tower). */
export interface GridSize {
  readonly width: number;
  readonly height: number;
}

/**
 * RGBA bytes for a mask of any grid size, row-major. Same slot rules as
 * `renderMask`; pure, so a test can assert pixel output without a GPU.
 */
export function renderGridMask(
  mask: readonly string[],
  palette: readonly string[],
  size: GridSize,
): Uint8Array {
  const out = new Uint8Array(size.width * size.height * MASK_CHANNELS);
  const fallback = palette[0];
  for (let y = 0; y < size.height; y += 1) {
    const row = mask[y] ?? "";
    for (let x = 0; x < size.width; x += 1) {
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
      const at = (y * size.width + x) * MASK_CHANNELS;
      out[at] = bytes[0];
      out[at + 1] = bytes[1];
      out[at + 2] = bytes[2];
      out[at + 3] = bytes[3];
    }
  }
  return out;
}

// --- The black tower ---------------------------------------------------------

/**
 * The egg, as an 8x8 pixel mask directly every other sprite (playtest: the
 * vector-ellipse egg turned to mud under integer upscaling). Shape: a narrow
 * top over a wide base, with a lit pixel on the upper-left and shade pixels on
 * the lower-right — `#` shell (palette[0]), `+` highlight (palette[2]).
 * Pure and deterministic.
 */
export function eggMask(): readonly string[] {
  return [
    "..###...",
    ".#####..",
    ".#+####.",
    ".######.",
    ".######.",
    ".###*##.",
    ".#####..",
    "..###...",
  ];
}

/**
 * Deterministic 0..1 hash for pixel-level noise. Render-layer texture work
 * never uses `Math.random`: the same tower must render identically forever.
 * Exported for sibling scene maths that needs the same discipline.
 */
export function hash01(x: number, y: number, salt: number): number {
  let h = ((Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + Math.floor(salt) * 2246822519) >>> 0) % 4294967291;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000;
}
