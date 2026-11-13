/**
 * The world clock (ticket 0008, W1 skeleton; decision 0003).
 *
 * Time never advances by wall clock inside the simulation: the engine's `tick`
 * SimEvent is the sole time mover, and every player-facing notion of "now" —
 * the in-world hour, the day/night phase — is a pure function of the tick
 * phase. One full in-game day is `DAY_CYCLE_TICKS` sim ticks; at the wiring's
 * 3-second tick that is one wall-clock hour per in-game day.
 *
 * Dependency direction: this module lives in `sim` so `render/palette.ts` and
 * anything else may import from it, never the reverse (the constant used to
 * live in render; ticket 0008 moved it here).
 */

import { TICK_MS } from "./rhythm";

/**
 * Length of one full day/night cycle, in simulation ticks. Single source of
 * truth: `render/palette.ts` re-exports this, so `skyAt` and `worldHour` can
 * never drift apart.
 */
export const DAY_CYCLE_TICKS = 1200;

/** One in-game day in wall-clock seconds at the wiring's tick tempo (1200 × 3s). */
export const GAME_DAY_SECONDS = (DAY_CYCLE_TICKS * TICK_MS) / 1000;

/** The world seed used when none is provided. */
export const DEFAULT_WORLD_SEED = 1997;

/**
 * The in-world hour (0..23) derived from the tick phase. Aligned with
 * `render/palette.ts`'s `skyAt`: the sky is brightest (phase 0) at hour 12
 * (noon) and darkest (phase 0.5) at hour 0 (midnight). Pure: same tick, same
 * hour, offline, forever — no wall clock anywhere.
 */
export function worldHour(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  // Integer arithmetic only: a float phase ((tick/1200 + 0.5) * 24) wobbles at
  // hour boundaries, which would smear the midnight window by a tick. The
  // equivalent exact form is floor((phaseTicks·24 + 14400) / 1200) mod 24 —
  // integer numerator, integer denominator, no rounding surprises.
  const phaseTicks = safeTick % DAY_CYCLE_TICKS;
  return Math.floor((phaseTicks * 24 + (DAY_CYCLE_TICKS / 2) * 24) / DAY_CYCLE_TICKS) % 24;
}

/**
 * The ledger's night window (R3.3): hours 0..4 count as night. Kept here so
 * `ledger.ts` and any future silent/calendar judgment share one definition.
 */
export function isNightHour(hour: number): boolean {
  return hour >= 0 && hour < 5;
}

// ---------------------------------------------------------------------------
// The calendar (ticket 0010) — the honest world-clock face
// ---------------------------------------------------------------------------

/**
 * Display seconds of the in-world day, scaled so one cycle renders as a full
 * 24-hour day. Integer-exact: one cycle is 1200 ticks shown as 86400s, i.e.
 * 72 display-seconds per tick, and the offset is half a day (the sky's noon
 * is the calendar's 12:00 — the same anchor `worldHour` uses). Both the hour
 * and the minute below read this one value, so the face can never disagree
 * with itself.
 */
export function worldDaySeconds(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const phaseTicks = safeTick % DAY_CYCLE_TICKS;
  const secondsPerTick = 86400 / DAY_CYCLE_TICKS; // 72, exact — one cycle renders as 24h
  return (phaseTicks * secondsPerTick + 43200) % 86400;
}

/** The in-world day number since boot (day 0 is the boot day; UI adds 1). */
export function worldDay(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  return Math.floor(safeTick / DAY_CYCLE_TICKS);
}

/** The in-world minute of the current hour (0..59), same phase as `worldHour`. */
export function worldMinute(tick: number): number {
  return Math.floor(worldDaySeconds(tick) / 60) % 60;
}

export interface WorldCalendar {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** The full honest calendar face at `tick`, pure and offline. */
export function worldCalendarAt(tick: number): WorldCalendar {
  return {
    day: worldDay(tick),
    hour: worldHour(tick),
    minute: worldMinute(tick),
  };
}

/**
 * Normalize a raw seed (from a URL parameter, a save slot, anywhere) into a
 * valid unsigned 32-bit integer, falling back to the default when missing or
 * malformed. Pure and total: any input yields a usable seed.
 */
export function normalizeWorldSeed(raw?: number | string | null): number {
  if (raw === null || raw === undefined || raw === "") {
    return DEFAULT_WORLD_SEED;
  }
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(value)) {
    return DEFAULT_WORLD_SEED;
  }
  return Math.abs(Math.trunc(value)) >>> 0;
}
