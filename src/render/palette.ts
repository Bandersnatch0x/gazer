/**
 * Colour helpers for the render layer.
 *
 * The world is cozy at `paletteDecay === 0` and fully desaturated at
 * `paletteDecay === 1`. Everything here is pure so the palette can be tested
 * without a GPU.
 */

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

export interface Palette {
  readonly sky: string;
  readonly skyLow: string;
  readonly tileLight: string;
  readonly tileDark: string;
  readonly tileEdge: string;
  readonly tower: string;
  readonly towerEdge: string;
  /** Body, eye, shade, accent — the four slots a mask may reference. */
  readonly creature: readonly [string, string, string, string];
  readonly text: string;
  readonly bubble: string;
}

/** The cozy end of the curve: warm soil, soft green, cream creatures. */
export const COZY_PALETTE: Palette = {
  sky: "#20342a",
  skyLow: "#16241d",
  tileLight: "#3f6b4a",
  tileDark: "#355c3f",
  tileEdge: "#2a4a33",
  tower: "#141821",
  towerEdge: "#3a4256",
  creature: ["#f2e6c9", "#7ef0a6", "#1a2b1f", "#e8a87c"],
  text: "#d8f3dc",
  bubble: "#0f1a14",
};

export function paletteAt(decay: number): Palette {
  const amount = clamp01(decay);
  const creature = COZY_PALETTE.creature.map((color) => applyDecay(color, amount)) as [
    string,
    string,
    string,
    string,
  ];
  return {
    sky: applyDecay(COZY_PALETTE.sky, amount),
    skyLow: applyDecay(COZY_PALETTE.skyLow, amount),
    tileLight: applyDecay(COZY_PALETTE.tileLight, amount),
    tileDark: applyDecay(COZY_PALETTE.tileDark, amount),
    tileEdge: applyDecay(COZY_PALETTE.tileEdge, amount),
    tower: applyDecay(COZY_PALETTE.tower, amount),
    towerEdge: applyDecay(COZY_PALETTE.towerEdge, amount),
    creature,
    text: applyDecay(COZY_PALETTE.text, amount),
    bubble: applyDecay(COZY_PALETTE.bubble, amount),
  };
}
