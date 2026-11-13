/**
 * Shared output validators for the bridge.
 *
 * Every L-point funnels model output through here before it may become a
 * protocol proposal. The rules are engine-shaped, not model-shaped: one line,
 * bounded length, bounded words — anything else falls back to a pool.
 */

import { createRng } from "../sim/rng";

/** Collapse all whitespace runs and trim: a reply is one line or nothing. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  const trimmed = singleLine(text);
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(" ").length;
}

export function isValidLine(
  raw: string,
  limits: { readonly maxChars: number; readonly maxWords: number },
): boolean {
  const line = singleLine(raw);
  if (line.length === 0 || line.length > limits.maxChars) {
    return false;
  }
  return wordCount(line) <= limits.maxWords;
}

export function containsNumber(text: string): boolean {
  return /[0-9]/.test(text);
}

/** Clamp into [-1, 1] and round to two decimals; non-finite becomes 0. */
export function clampSigned(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.min(1, Math.max(-1, value)) * 100) / 100;
}

export function truncate(text: string, maxChars: number): string {
  const line = singleLine(text);
  if (line.length <= maxChars) {
    return line;
  }
  return `${line.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

const GLITCH_CHARS = "%&#@?!*+=~^";

/**
 * Deterministic garble for undecoded player-entry lines. Same (seed, text)
 * always yields the same garble; letters and digits rot into glitch marks at
 * a fixed rate so the line keeps its shape.
 */
export function garble(text: string, seed: number): string {
  const line = singleLine(text);
  const rng = createRng(seed, line);
  let out = "";
  for (const char of line) {
    if (/[a-z0-9]/i.test(char) && rng.next() < 0.75) {
      out += GLITCH_CHARS[rng.int(0, GLITCH_CHARS.length - 1)] ?? "%";
    } else {
      out += char;
    }
  }
  return out;
}
