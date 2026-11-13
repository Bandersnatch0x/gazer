/**
 * Colour helpers for the render layer.
 *
 * The world is cozy at `paletteDecay === 0` and fully desaturated at
 * `paletteDecay === 1`. Everything here is pure so the palette can be tested
 * without a GPU.
 */

import { DAY_CYCLE_TICKS } from "../sim/clock";
import type { WorldState } from "../sim/types";

/**
 * Length of one full day/night cycle, in simulation ticks. Moved to
 * `sim/clock.ts` in ticket 0008 so the sim layer owns the constant and the
 * derived hour; re-exported here so `skyAt` and `worldHour` stay in lockstep
 * by construction.
 */
export { DAY_CYCLE_TICKS };

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const LONG_HEX = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const SHORT_HEX = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;

/** Rec. 601 luma weights, kept as integers scaled by 1000 for exactness. */
const LUMA_R = 299;
const LUMA_G = 587;
const LUMA_B = 114;

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** Parses `#rgb` or `#rrggbb`. Returns null for anything else. */
export function parseColor(color: string): Rgb | null {
  const long = LONG_HEX.exec(color);
  if (long !== null) {
    return {
      r: Number.parseInt(long[1] as string, 16),
      g: Number.parseInt(long[2] as string, 16),
      b: Number.parseInt(long[3] as string, 16),
    };
  }
  const short = SHORT_HEX.exec(color);
  if (short !== null) {
    const [r, g, b] = [short[1], short[2], short[3]] as [string, string, string];
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    };
  }
  return null;
}

function hexByte(value: number): string {
  return clampChannel(value).toString(16).padStart(2, "0");
}

export function toHex(rgb: Rgb): string {
  return `#${hexByte(rgb.r)}${hexByte(rgb.g)}${hexByte(rgb.b)}`;
}

export function luma(rgb: Rgb): number {
  return (rgb.r * LUMA_R + rgb.g * LUMA_G + rgb.b * LUMA_B) / 1000;
}

/** Linear blend; `t` is clamped to 0..1. */
export function mix(from: Rgb, to: Rgb, t: number): Rgb {
  const amount = clamp01(t);
  return {
    r: clampChannel(from.r + (to.r - from.r) * amount),
    g: clampChannel(from.g + (to.g - from.g) * amount),
    b: clampChannel(from.b + (to.b - from.b) * amount),
  };
}

/**
 * Pulls a colour toward its own luma. At `amount === 0` the colour is returned
 * normalized and unchanged; at `amount === 1` it is grey.
 *
 * Unparseable input is returned untouched rather than throwing: director
 * palettes are untrusted data.
 */
export function applyDecay(color: string, amount: number): string {
  const rgb = parseColor(color);
  if (rgb === null) {
    return color;
  }
  const grey = luma(rgb);
  return toHex(mix(rgb, { r: grey, g: grey, b: grey }, amount));
}

/** RGBA bytes for sprite rendering; null means "do not draw this pixel". */
export function colorBytes(color: string): readonly [number, number, number, number] | null {
  const rgb = parseColor(color);
  if (rgb === null) {
    return null;
  }
  return [rgb.r, rgb.g, rgb.b, 255];
}

/**
 * The five seasons. One act, one season (GAME_REVIEW §10.5-3): the season is a
 * render-layer parameter only — the simulation never stores it, the canvas
 * derives it from the stage. "bleak" is the season-less final act.
 */
export type Season = "spring" | "summer" | "autumn" | "winter" | "bleak";

export const SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter", "bleak"];

/** Stage → season. Stages outside 0..4 clamp to the nearest end. */
export function seasonForStage(stage: number): Season {
  const index = Math.min(SEASONS.length - 1, Math.max(0, Math.floor(stage)));
  const season = SEASONS[index];
  return season === undefined ? "spring" : season;
}

/**
 * How far each season leans the whole palette, and toward what tint. Amounts
 * strengthened after playtest p2 finding §10 (spring vs bleak was unreadable):
 * the season is a macro-clock you feel, not a costume — but you must feel it.
 */
const SEASON_DRIFT: Readonly<Record<Season, { readonly tint: Rgb; readonly amount: number }>> = {
  spring: { tint: { r: 0x46, g: 0x8f, b: 0x55 }, amount: 0 },
  summer: { tint: { r: 0x8f, g: 0x7d, b: 0x3e }, amount: 0.14 },
  autumn: { tint: { r: 0x7d, g: 0x5c, b: 0x2f }, amount: 0.18 },
  winter: { tint: { r: 0x6f, g: 0x83, b: 0x8f }, amount: 0.2 },
  bleak: { tint: { r: 0x3c, g: 0x42, b: 0x3c }, amount: 0.28 },
};

/**
 * Leans every palette entry toward a season's tint. Pure; spring is the
 * identity so the cozy baseline stays exactly the baseline.
 */
export function seasonal(palette: Palette, season: Season): Palette {
  const drift = SEASON_DRIFT[season];
  const lean = (color: string): string => {
    const rgb = parseColor(color);
    if (rgb === null) {
      return color;
    }
    return toHex(mix(rgb, drift.tint, drift.amount));
  };
  return {
    sky: lean(palette.sky),
    skyLow: lean(palette.skyLow),
    tileLight: lean(palette.tileLight),
    tileDark: lean(palette.tileDark),
    tileEdge: lean(palette.tileEdge),
    // The tower is immune to the seasons (§4): its colours pass through lean.
    tower: palette.tower,
    towerEdge: palette.towerEdge,
    creature: palette.creature.map(lean) as [string, string, string, string],
    text: lean(palette.text),
    bubble: lean(palette.bubble),
    egg: lean(palette.egg),
    eggForced: lean(palette.eggForced),
    wrong: lean(palette.wrong),
  };
}

export interface Palette {
  readonly sky: string;
  readonly skyLow: string;
  readonly tileLight: string;
  readonly tileDark: string;
  readonly tileEdge: string;
  /** [R10] tower_body; immune to decay and season (§4) — a constant. */
  readonly tower: string;
  /** [R10] The tower edge is tower_void; immune like the body. */
  readonly towerEdge: string;
  /** Body, eye, shade, accent — the four slots a mask may reference. */
  readonly creature: readonly [string, string, string, string];
  readonly text: string;
  readonly bubble: string;
  /** Egg shell and the forced-pairing shell; decay eats these like everything else. */
  readonly egg: string;
  readonly eggForced: string;
  /** Stroke for speech bubbles in the `wrong` mood. */
  readonly wrong: string;
}

// --- Hue rotation (ticket 0025, FX-LIB-01a C-03/C-03a) ------------------------
//
// The palette-shift family rotates the world's hue. C-03 is the transient
// rotation that recovers; C-03a is the branch that never recovers: the degrees
// accumulate as permanent pollution, hard-counted by the FX executor
// (`sim/fx.ts`) at 45 and persisted with the save through the executor state.
// The render side applies whatever degrees it is handed — clamped here too, so
// a mis-wired caller can never paint the world past the canonical ceiling.

/** C-03a ceiling, mirrored from `sim/fx.ts` `PALETTE_POLLUTION_MAX_DEGREES`. */
export const PALETTE_POLLUTION_MAX_DEGREES = 45;

function clampDegrees(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    return 0;
  }
  let value = degrees % 360;
  if (value > 180) {
    value -= 360;
  }
  if (value < -180) {
    value += 360;
  }
  return value;
}

/**
 * Rotates one colour's hue by `degrees` (−180..180; out-of-range wraps).
 * Pure and deterministic: same colour plus same degrees is always the same
 * result, so a replayed timeline replays the same polluted world.
 */
export function hueRotate(color: string, degrees: number): string {
  const rgb = parseColor(color);
  const turn = clampDegrees(degrees);
  if (rgb === null || turn === 0) {
    return color;
  }
  // Integer-maths hue rotation on the max/min chroma axis (no trig, no
  // rounding drift): the same integers in, the same integers out.
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) {
    return color; // A grey has no hue to rotate.
  }
  // Hue in [0, 6): which sextant of the colour wheel the colour sits on.
  let sextant: number;
  if (max === r) {
    sextant = ((g - b) / span) % 6;
  } else if (max === g) {
    sextant = (b - r) / span + 2;
  } else {
    sextant = (r - g) / span + 4;
  }
  const rotated = (sextant + turn / 60 + 6) % 6;
  const second = span * (rotated % 1);
  const lift = min;
  let next: [number, number, number];
  const sector = Math.floor(rotated) % 6;
  if (sector === 0) next = [span, second, 0];
  else if (sector === 1) next = [span - second, span, 0];
  else if (sector === 2) next = [0, span, second];
  else if (sector === 3) next = [0, span - second, span];
  else if (sector === 4) next = [second, 0, span];
  else next = [span, 0, span - second];
  return toHex({ r: clampChannel(next[0] + lift), g: clampChannel(next[1] + lift), b: clampChannel(next[2] + lift) });
}

/**
 * The palette entries hue can touch. The tower layer keeps its light immunity
 * (§4): `tower` / `towerEdge` are canon constants and never enter the rotation.
 */
const HUE_ROTATABLE_KEYS = [
  "sky",
  "skyLow",
  "tileLight",
  "tileDark",
  "tileEdge",
  "text",
  "bubble",
  "egg",
  "eggForced",
  "wrong",
] as const;

/**
 * Rotates a whole palette by `degrees`. The creature colours rotate with
 * everything else — the world's hue shift is global (C-03) — but the tower
 * stays exactly itself.
 */
export function rotatePalette(palette: Palette, degrees: number): Palette {
  const turn = clampDegrees(degrees);
  if (turn === 0) {
    return palette;
  }
  const out: Record<string, string> = {};
  for (const key of HUE_ROTATABLE_KEYS) {
    out[key] = hueRotate(palette[key], turn);
  }
  return {
    ...palette,
    sky: out.sky ?? palette.sky,
    skyLow: out.skyLow ?? palette.skyLow,
    tileLight: out.tileLight ?? palette.tileLight,
    tileDark: out.tileDark ?? palette.tileDark,
    tileEdge: out.tileEdge ?? palette.tileEdge,
    text: out.text ?? palette.text,
    bubble: out.bubble ?? palette.bubble,
    egg: out.egg ?? palette.egg,
    eggForced: out.eggForced ?? palette.eggForced,
    wrong: out.wrong ?? palette.wrong,
    creature: palette.creature.map((color) => hueRotate(color, turn)) as [string, string, string, string],
  };
}

/**
 * The permanent pollution face (C-03a): the degrees have already been
 * hard-counted by the executor; this clamps defensively at 45 and applies them.
 */
export function applyPalettePollution(palette: Palette, totalDegrees: number): Palette {
  const total = Number.isFinite(totalDegrees)
    ? Math.min(PALETTE_POLLUTION_MAX_DEGREES, Math.max(0, totalDegrees))
    : 0;
  return rotatePalette(palette, total);
}

// --- The canonical tower palette (ART-CORE-03 §3.1 [R10], ticket 0021) --------
//
// Three colours, and the tower's light immunity lives here: these constants
// never enter the decay curve below nor the seasonal lean — at the deepest
// night (§4) the tower still reads one step brighter than the night sky.
// tower_void equals ART-CORE-01's eye void E and tower_glint equals its glint
// G: the tower and their eyes are the same kind of black. The retired tower
// colours `#141821` / `#3a4256` are gone ([R10]); the edge is tower_void.
export const TOWER_BODY_COLOR = "#12151C";
export const TOWER_VOID_COLOR = "#0B0D12";
export const TOWER_GLINT_COLOR = "#FFFFFF";

/** The cozy end of the curve: warm soil, soft green, cream creatures. */
export const COZY_PALETTE: Palette = {
  sky: "#20342a",
  skyLow: "#16241d",
  tileLight: "#3f6b4a",
  tileDark: "#355c3f",
  tileEdge: "#2a4a33",
  tower: TOWER_BODY_COLOR,
  towerEdge: TOWER_VOID_COLOR,
  creature: ["#f2e6c9", "#7ef0a6", "#1a2b1f", "#e8a87c"],
  text: "#d8f3dc",
  bubble: "#0f1a14",
  egg: "#f2e6c9",
  eggForced: "#b46a8a",
  wrong: "#b46a8a",
};

export function paletteAt(decay: number, season: Season = "spring"): Palette {
  const amount = clamp01(decay);
  const creature = COZY_PALETTE.creature.map((color) => applyDecay(color, amount)) as [
    string,
    string,
    string,
    string,
  ];
  const base: Palette = {
    sky: applyDecay(COZY_PALETTE.sky, amount),
    skyLow: applyDecay(COZY_PALETTE.skyLow, amount),
    tileLight: applyDecay(COZY_PALETTE.tileLight, amount),
    tileDark: applyDecay(COZY_PALETTE.tileDark, amount),
    tileEdge: applyDecay(COZY_PALETTE.tileEdge, amount),
    // Light immunity (§4): the tower layer bypasses the decay curve entirely.
    tower: COZY_PALETTE.tower,
    towerEdge: COZY_PALETTE.towerEdge,
    creature,
    text: applyDecay(COZY_PALETTE.text, amount),
    bubble: applyDecay(COZY_PALETTE.bubble, amount),
    egg: applyDecay(COZY_PALETTE.egg, amount),
    eggForced: applyDecay(COZY_PALETTE.eggForced, amount),
    wrong: applyDecay(COZY_PALETTE.wrong, amount),
  };
  return seasonal(base, season);
}

/**
 * The sky colour at a tick: the world's sky drifts between `sky` (noon) and
 * `skyLow` (deep night) over one cycle. Pure, so a test can pin both ends.
 */
export function skyAt(tick: number, decay: number, season: Season = "spring"): string {
  const palette = paletteAt(decay, season);
  const rgb = parseColor(palette.sky);
  const low = parseColor(palette.skyLow);
  if (rgb === null || low === null) {
    return palette.sky;
  }
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const phase = (safeTick % DAY_CYCLE_TICKS) / DAY_CYCLE_TICKS;
  const night = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
  return toHex(mix(rgb, low, night * 0.45));
}

// --- The canonical creature palette (ART-CORE-01 §4/§5/§6, ticket 0019) ------
//
// These constants are the palette lock the CI asserts against: the canonical
// gazer sprite renders only through these exact hexes. They never take part in
// the seasonal lean or the decay curve above — the eyes and the glint are the
// one thing in the world that never fades (§5.2).

/** §5.1 first-act body colours. */
export const BODY_BASE_COLOR = "#7ED957";
export const BODY_HI_COLOR = "#B8F0A8";
export const BODY_SHADE_COLOR = "#3F8F3A";
/** §4: the eye void and the glint are constant across every stage. */
export const EYE_VOID_COLOR = "#101018";
export const GLINT_COLOR = "#FFFFFF";

/**
 * §4 pupil stage colours S0–S4. Stage S4 equals the eye void on purpose: the
 * pupil has disappeared, and the eye holds nothing but reflection.
 */
export const PUPIL_STAGE_COLORS: readonly [string, string, string, string, string] = [
  "#E8A93C",
  "#C2A04A",
  "#7E93A6",
  "#39414F",
  "#0B0D12",
];

/**
 * GV → pupil stage. The thresholds mirror the sim's stage ladder (GV 20/40/60/
 * 80, `sim/types.ts` `GV_THRESHOLDS`); kept as literals here so the render
 * palette stays a leaf module.
 */
export function pupilStageForGv(gv: number): 0 | 1 | 2 | 3 | 4 {
  const value = Number.isFinite(gv) ? Math.max(0, gv) : 0;
  if (value >= 80) return 4;
  if (value >= 60) return 3;
  if (value >= 40) return 2;
  if (value >= 20) return 1;
  return 0;
}

/**
 * The seven canonical sprite slots, in `CANON_SLOTS` order:
 * J body, H highlight, S shade, E eye void, P pupil (stage colour),
 * G glint, I iris (takes the stage colour, §4). `stage` is the pupil stage
 * S0–S4 (see `pupilStageForGv` for the GV ladder), clamped to the table.
 */
export function canonicalPalette(stage: number): readonly string[] {
  const index = Math.min(PUPIL_STAGE_COLORS.length - 1, Math.max(0, Math.floor(stage)));
  const pupil = PUPIL_STAGE_COLORS[index] ?? EYE_VOID_COLOR;
  return [BODY_BASE_COLOR, BODY_HI_COLOR, BODY_SHADE_COLOR, EYE_VOID_COLOR, pupil, GLINT_COLOR, pupil];
}

/**
 * The four-slot palette the scene path renders canonical masks with: the
 * legacy mask slots (body / eye / shade / accent) carry body base, eye void,
 * body shade and the white glint. The pupil's stage colour needs a wider
 * slot table; until the scene palette grows, the eye reads as void — the
 * glint still reads, which is the pixel that matters.
 */
export const GAZER_SCENE_PALETTE: readonly [string, string, string, string] = [
  BODY_BASE_COLOR,
  EYE_VOID_COLOR,
  BODY_SHADE_COLOR,
  GLINT_COLOR,
];

/** §6 close-up palette. Special colours for the pupil close-up only. */
export const CLOSEUP_PALETTE = {
  sky: "#A8D8E8",
  grass: "#6FBF5E",
  flower: "#F2F2F2",
  dark: "#101018",
  bright: "#FFFFFF",
  text: "#DDE3EA",
} as const;

// --- The atavistic palette (ART-CORE-01 §7, ticket 0037) ----------------------
//
// 返祖体: P/I forced `#33FF66`, body forced phosphor green `#2ECC5E`, fully
// exempt from palette decay — the world greys out, and it stays lit. The
// highlight/shade below are derived tints of the forced body so the body-paint
// rims stay readable; the eye void and glint keep their canon constants.

export const ATAVISTIC_BODY_COLOR = "#2ECC5E";
export const ATAVISTIC_PUPIL_COLOR = "#33FF66";
export const ATAVISTIC_BODY_HI_COLOR = "#8CF2A6";
export const ATAVISTIC_BODY_SHADE_COLOR = "#1E8F44";

/**
 * The atavistic seven-slot palette, in `CANON_SLOTS` order. It ignores the
 * pupil stage by design: the forced phosphor is the marker's whole point, at
 * every GV, forever.
 */
export function atavisticPalette(): readonly string[] {
  return [
    ATAVISTIC_BODY_COLOR,
    ATAVISTIC_BODY_HI_COLOR,
    ATAVISTIC_BODY_SHADE_COLOR,
    EYE_VOID_COLOR,
    ATAVISTIC_PUPIL_COLOR,
    GLINT_COLOR,
    ATAVISTIC_PUPIL_COLOR,
  ];
}

/**
 * §7 豁免: the decay path runs through here for creature colours, and the
 * atavistic marker bypasses it. Everything else decays exactly as before.
 */
export function decayCreatureColor(color: string, amount: number, exempt: boolean): string {
  return exempt ? color : applyDecay(color, amount);
}

// --- §5.2 GV-driven decay (ART-CORE-01, ticket 0041) --------------------------
//
// Two tracks, verbatim from §5.2:
//   个体身体:  S' = S × max(0.45, 1 − max(0, GV−40)/220)
//              L' = L × max(0.80, 1 − max(0, GV−40)/600)
//   世界/UI:   S' = S × max(0.35, 1 − max(0, GV−40)/140)   ← 世界比个体衰得快
// Below GV 40 both tracks are the identity. The eyes (E) and the glint (G)
// never enter either track (§5.2 closing law) — the canon palette keeps them
// out by construction.

export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

/** RGB→HSL on 0..1. Hue in degrees; grey inputs carry h=0, s=0. */
export function toHsl(color: string): Hsl | null {
  const rgb = parseColor(color);
  if (rgb === null) {
    return null;
  }
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  const l = (max + min) / 2;
  if (span <= 0) {
    return { h: 0, s: 0, l };
  }
  const s = span / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) {
    h = 60 * (((g - b) / span) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / span + 2);
  } else {
    h = 60 * ((r - g) / span + 4);
  }
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** HSL→hex. Hue wraps; s and l are clamped into 0..1 by the geometry itself. */
export function fromHsl(h: number, s: number, l: number): string {
  const light = clamp01(l);
  const sat = clamp01(s);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = ((((h % 360) + 360) % 360) / 60) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const sector = Math.floor(hp);
  let rgb: [number, number, number];
  if (sector === 0) rgb = [c, x, 0];
  else if (sector === 1) rgb = [x, c, 0];
  else if (sector === 2) rgb = [0, c, x];
  else if (sector === 3) rgb = [0, x, c];
  else if (sector === 4) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = light - c / 2;
  return toHex({
    r: clampChannel((rgb[0] + m) * 255),
    g: clampChannel((rgb[1] + m) * 255),
    b: clampChannel((rgb[2] + m) * 255),
  });
}

/** The GV amount above 40 that the decay bites on; NaN and negatives read 0. */
function gvOverflow(gv: number): number {
  const value = Number.isFinite(gv) ? Math.max(0, gv) : 0;
  return Math.max(0, value - 40);
}

/** §5.2 个体身体 track: S×max(0.45, 1−Δ/220), L×max(0.80, 1−Δ/600), Δ=GV−40. */
export function gvDecayCreatureColor(color: string, gv: number): string {
  const over = gvOverflow(gv);
  // Below the bite point the colour is the colour: no roundtrip, no drift.
  if (over <= 0) {
    return color;
  }
  const hsl = toHsl(color);
  if (hsl === null) {
    return color;
  }
  return fromHsl(
    hsl.h,
    hsl.s * Math.max(0.45, 1 - over / 220),
    hsl.l * Math.max(0.8, 1 - over / 600),
  );
}

/** §5.2 世界/UI track: S×max(0.35, 1−Δ/140), lightness untouched. */
export function gvDecayWorldColor(color: string, gv: number): string {
  const over = gvOverflow(gv);
  if (over <= 0) {
    return color;
  }
  const hsl = toHsl(color);
  if (hsl === null) {
    return color;
  }
  return fromHsl(hsl.h, hsl.s * Math.max(0.35, 1 - over / 140), hsl.l);
}

// --- §4 aging (ticket 0041) ----------------------------------------------------
//
// 个体 drift 每积累 3 条,P 色向下一阶段色插值 15% — the individual's eye
// reaches the next stage's colour before the group's GV does. S4 has no next
// stage: the pupil has already vanished, and nothing follows the void.

/** One aging step per this many drift fragments (§4). */
export const AGING_STEP_FRAGMENTS = 3;
/** Each step interpolates the pupil this far toward the next stage colour (§4). */
export const AGING_STEP_T = 0.15;

export function agedPupilColor(stage: number, driftCount: number): string {
  const safeStage = Number.isFinite(stage) ? Math.floor(stage) : 0;
  const index = Math.min(PUPIL_STAGE_COLORS.length - 1, Math.max(0, safeStage));
  const fragments = Number.isFinite(driftCount) ? Math.max(0, Math.floor(driftCount)) : 0;
  const t = Math.min(1, Math.floor(fragments / AGING_STEP_FRAGMENTS) * AGING_STEP_T);
  if (t <= 0) {
    return PUPIL_STAGE_COLORS[index] ?? EYE_VOID_COLOR;
  }
  if (t >= 1 || index >= PUPIL_STAGE_COLORS.length - 1) {
    // The step is complete: the canon constant itself, verbatim.
    return PUPIL_STAGE_COLORS[Math.min(index + 1, PUPIL_STAGE_COLORS.length - 1)] ?? EYE_VOID_COLOR;
  }
  const from = parseColor(PUPIL_STAGE_COLORS[index] ?? EYE_VOID_COLOR);
  const to = parseColor(PUPIL_STAGE_COLORS[index + 1] ?? EYE_VOID_COLOR);
  if (from === null || to === null) {
    return PUPIL_STAGE_COLORS[index] ?? EYE_VOID_COLOR;
  }
  return toHex(mix(from, to, t));
}

/**
 * The scene's canon palette for one living creature (ticket 0041): the body
 * family decays along the §5.2 individual track with the world's GV, the
 * pupil and iris wear the §4 individually aged colour, and the eye void and
 * glint never fade — the closing law stays true by construction.
 */
export function decayedCanonicalPalette(stage: number, gv: number, driftCount: number): readonly string[] {
  const index = Math.min(PUPIL_STAGE_COLORS.length - 1, Math.max(0, Math.floor(stage)));
  const base = canonicalPalette(index);
  const pupil = agedPupilColor(index, driftCount);
  return [
    gvDecayCreatureColor(base[0] ?? BODY_BASE_COLOR, gv),
    gvDecayCreatureColor(base[1] ?? BODY_BASE_COLOR, gv),
    gvDecayCreatureColor(base[2] ?? BODY_BASE_COLOR, gv),
    base[3] ?? EYE_VOID_COLOR,
    pupil,
    base[5] ?? GLINT_COLOR,
    pupil,
  ];
}

// --- §5.3 terminal backdrop × world mood (ART-CORE-02, ticket 0041) ------------

export const TERM_BG_EARLY_COLOR = "#0E1116";
export const TERM_BG_LATE_COLOR = "#0B0D12";

/**
 * world_mood 口径 (ticket 0041): WorldState carries no mood field, so the
 * backdrop reads the keeper's care instead — the mean `stats.happiness` of
 * the living, normalized to 0..1. An empty world reads neutral (1): there is
 * nobody left to grieve about. Pure; reads no clock.
 */
export function worldMood(world: Pick<WorldState, "creatures">): number {
  const living = Object.values(world.creatures).filter(
    (creature) => creature.behavior !== "dead",
  );
  if (living.length === 0) {
    return 1;
  }
  const total = living.reduce(
    (sum, creature) => sum + clamp01(creature.stats.happiness / 100),
    0,
  );
  return total / living.length;
}

/**
 * §5.3: L' = L × (0.92 + 0.08 × world_mood) — the worse the world feels, the
 * darker the terminal sits behind its words. Hue and saturation untouched;
 * stage ≥3 wears the deeper term_bg family (ART-CORE-02 §5.1).
 */
export function termBgColor(world: Pick<WorldState, "creatures" | "stage">): string {
  const base = world.stage >= 3 ? TERM_BG_LATE_COLOR : TERM_BG_EARLY_COLOR;
  const factor = 0.92 + 0.08 * clamp01(worldMood(world));
  if (factor >= 1) {
    // A world with nothing to grieve about leaves the backdrop exactly itself.
    return base;
  }
  const hsl = toHsl(base);
  if (hsl === null) {
    return base;
  }
  return fromHsl(hsl.h, hsl.s, hsl.l * factor);
}
