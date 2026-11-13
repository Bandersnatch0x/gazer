/**
 * The shell layer (ticket 0009; decisions 0001 + 0003).
 *
 * Everything here is a pure derivation from the tick — the shell's midnight
 * silence (W3) and its clock drift (W4) are performance, not state: no new
 * `WorldState` field, no wall clock, no LLM, no network. The v4 shell's
 * `drift_rate` depended on the real clock; decision 0003 determinizes it into
 * a tick-derived pure function, and the performance it drives lands through
 * the existing `Effect` channel (`apply_effect` SimEvent → `render/effects`
 * plan) using only effect kinds the render layer already speaks.
 *
 * Determinism contract: same tick, same performance, bit for bit — a replay
 * of ticks replays the show.
 */

import type { Effect } from "./effects";
import { TICK_MS } from "./rhythm";
import { worldHour } from "./clock";

// ---------------------------------------------------------------------------
// W3 — midnight silence
// ---------------------------------------------------------------------------

/**
 * The midnight hour closes the collective's speech channel: while the world
 * clock reads hour 0, nobody speaks. The window is the midnight hour itself
 * (50 ticks ≈ 2.5 real minutes per in-game day) — a legible daily beat, kept
 * deliberately distinct from the ledger's wider night-multiplier window
 * (hours 0..4, R3.3), which stays the ledger's business. The speech gate it
 * feeds is the existing Silent Run gate (`world.silent` → allowManualSpeech),
 * not a new mechanism.
 */
export function midnightSilenceAt(tick: number): boolean {
  return worldHour(tick) === 0;
}

/** True on the exact tick the world clock crosses into the midnight hour. */
export function midnightSilenceEntryAt(tick: number): boolean {
  return midnightSilenceAt(tick) && !midnightSilenceAt(tick - 1);
}

/** True on the exact tick the world clock leaves the midnight hour. */
export function midnightSilenceExitAt(tick: number): boolean {
  return !midnightSilenceAt(tick) && midnightSilenceAt(tick - 1);
}

/** The track the ambience drops into when the midnight hour begins. */
export const MIDNIGHT_TRACK = "midnight";
/** The track the ambience drops into when the midnight hour ends. */
export const DAWN_TRACK = "dawn";
/** The world holds for a breath when the clock crosses midnight. */
export const MIDNIGHT_FREEZE_MS = 400;

// ---------------------------------------------------------------------------
// W4 — clock drift
// ---------------------------------------------------------------------------

/**
 * The shell clock (the time the world *presents*) drifts around the world
 * clock on a deterministic triangle wave: it runs fast, overshoots, runs
 * slow, and catches up. Closed-form in the tick — no accumulated state, no
 * wall clock. One drift cycle spans two in-game days.
 */
export const DRIFT_PERIOD_TICKS = 2400;
/** How far the shell clock may lie, in seconds, at the wave's peaks. */
export const DRIFT_AMPLITUDE_SECONDS = 120;
/** Ticks per triangle quadrant: the rise (or fall) spans this many ticks. */
const DRIFT_RAMP_TICKS = DRIFT_PERIOD_TICKS / 4;
/** One sim tick in world seconds. */
const TICK_SECONDS = TICK_MS / 1000;

/** The shell's accumulated lie at `tick`, in seconds (positive = ahead). */
export function driftSecondsAt(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const phase = safeTick % DRIFT_PERIOD_TICKS;
  if (phase <= DRIFT_RAMP_TICKS) {
    // Rise: 0 → +A
    return (phase / DRIFT_RAMP_TICKS) * DRIFT_AMPLITUDE_SECONDS;
  }
  if (phase <= DRIFT_RAMP_TICKS * 3) {
    // Fall: +A → −A
    const into = phase - DRIFT_RAMP_TICKS;
    return DRIFT_AMPLITUDE_SECONDS - (2 * DRIFT_AMPLITUDE_SECONDS * into) / (DRIFT_RAMP_TICKS * 2);
  }
  // Rise: −A → 0
  const into = phase - DRIFT_RAMP_TICKS * 3;
  return -DRIFT_AMPLITUDE_SECONDS + (into / DRIFT_RAMP_TICKS) * DRIFT_AMPLITUDE_SECONDS;
}

/**
 * The shell clock's speed in shell-seconds per world-second at `tick`:
 * 1 is honest, above 1 runs fast, below 1 lags. Piecewise from the triangle
 * slope — the mechanical reading of the same drift.
 */
export function driftRateAt(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const phase = safeTick % DRIFT_PERIOD_TICKS;
  const slope =
    phase <= DRIFT_RAMP_TICKS || phase > DRIFT_RAMP_TICKS * 3
      ? DRIFT_AMPLITUDE_SECONDS / DRIFT_RAMP_TICKS
      : -DRIFT_AMPLITUDE_SECONDS / DRIFT_RAMP_TICKS;
  return (TICK_SECONDS + slope) / TICK_SECONDS;
}

/** The world's honest elapsed time at `tick`, in seconds. */
function worldSecondsAt(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  return safeTick * TICK_SECONDS;
}

/** What the shell's clock actually shows: world time plus the lie. */
export function shellSecondsAt(tick: number): number {
  return worldSecondsAt(tick) + driftSecondsAt(tick);
}

export interface ShellClock {
  readonly hour: number;
  readonly minute: number;
}

/**
 * The shell clock's displayed face at `tick`, anchored at 00:00 on tick 0.
 * Pure display value (decision 0001): derived, never stored.
 */
export function shellClockAt(tick: number): ShellClock {
  const total = Math.max(0, shellSecondsAt(tick));
  const daySeconds = total % 86400;
  return {
    hour: Math.floor(daySeconds / 3600) % 24,
    minute: Math.floor((daySeconds % 3600) / 60),
  };
}

/** The shell clock as the shell writes it: zero-padded `HH:MM`. */
export function shellClockText(tick: number): string {
  const clock = shellClockAt(tick);
  const pad = (value: number): string => (value < 10 ? `0${value}` : `${value}`);
  return `${pad(clock.hour)}:${pad(clock.minute)}`;
}

/**
 * The reveal threshold: once the lie exceeds this, the shell stops hiding it.
 * Half the amplitude, so the reveal beats land at exact triangle crossings
 * (tick ≡ 300 and 1500, mod DRIFT_PERIOD_TICKS) — no float wobble.
 */
export const DRIFT_REVEAL_SECONDS = DRIFT_AMPLITUDE_SECONDS / 2;

/** True on the exact tick the drift first crosses the reveal threshold. */
export function driftRevealAt(tick: number): boolean {
  const now = Math.abs(driftSecondsAt(tick));
  const before = Math.abs(driftSecondsAt(tick - 1));
  return now >= DRIFT_REVEAL_SECONDS && before < DRIFT_REVEAL_SECONDS;
}

/** The `relabel_ui` target the shell clock confesses under. */
export const SHELL_CLOCK_LABEL = "shell_clock";

// ---------------------------------------------------------------------------
// The performance script
// ---------------------------------------------------------------------------

/**
 * The shell's performance due at exactly this tick, as an ordered list of
 * Effects through the existing channel. Empty on almost every tick; the
 * wiring applies each via `apply_effect` and forwards it to the renderer.
 * Pure: same tick, same list.
 */
export function shellPerformanceAt(tick: number): readonly Effect[] {
  const effects: Effect[] = [];
  if (midnightSilenceEntryAt(tick)) {
    effects.push(
      { kind: "audio_drop_track", track: MIDNIGHT_TRACK },
      { kind: "freeze_all", ms: MIDNIGHT_FREEZE_MS },
    );
  }
  if (midnightSilenceExitAt(tick)) {
    effects.push({ kind: "audio_drop_track", track: DAWN_TRACK });
  }
  if (driftRevealAt(tick)) {
    effects.push(
      { kind: "relabel_ui", target: SHELL_CLOCK_LABEL, text: shellClockText(tick) },
      { kind: "glyph_corrupt", amount: 0.2 },
      { kind: "ui_shake", intensity: 0.25, ms: 400 },
    );
  }
  return effects;
}
