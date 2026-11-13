/**
 * The single tempo table (stream B, ticket 0002).
 *
 * Every pacing constant the wiring and the interaction layer read lives here:
 * the wall-clock tick, the input thresholds, the per-stage GV taper, and the
 * seasonal parameter presets. The simulation core stays pure — nothing in
 * `engine.ts` reads wall time, so the tempo is applied at the wiring layer by
 * stretching the real-time interval between sim ticks.
 *
 * Rationale (GAME_REVIEW §3, option a — "the gaze is fuel"):
 * - The old 1s tick starved a full creature in ~3.8 minutes and pumped GV to
 *   the finale in 2-3. A 30-60 minute playthrough needs both slowed.
 * - `tickMs: 3000` stretches starvation from 80/0.35 ≈ 229 ticks of wall time
 *   to ≈ 11.4 real minutes: ten minutes without feeding does not kill.
 * - GV gains taper per stage (`GV_STAGE_DECAY`): early acts still hook quickly,
 *   the late acts are the long tail. Modelled at "normal play" (mouse moving
 *   roughly a third of the time, stare every third tick), 0→80 lands near
 *   minute 25-30 and 0→100 inside the hour.
 */

// ---------------------------------------------------------------------------
// Wall-clock tempo
// ---------------------------------------------------------------------------

/**
 * One sim tick in real milliseconds. The engine keeps its own `TICK_MS = 1000`
 * naming for the in-sim step unit; the wiring stretches the interval between
 * ticks, which slows hunger, hygiene, courtship and consolidation together
 * without touching the deterministic core.
 */
export const TICK_MS = 3000;

// ---------------------------------------------------------------------------
// Input thresholds (stream B owns these; game.ts only references them)
// ---------------------------------------------------------------------------

export interface RhythmConfig {
  /** Sustained gaze window before the stare anomaly fires (§1.4: the tell). */
  readonly stareMs: number;
  /** No-input stretch after which the idle GV gain fires. */
  readonly idleMs: number;
  /** Clicks inside this window count toward the rapid-click burst. */
  readonly rapidClickWindowMs: number;
  /** Clicks needed to count as a rapid-click burst. */
  readonly rapidClickCount: number;
  /** Hold this long to pet. */
  readonly petHoldMs: number;
  /** Hold this much longer to name. */
  readonly nameHoldMs: number;
  /**
   * A released tap holds its feed this long so a second tap can cancel it and
   * become a double-tap (pupil panel) instead. Feeding is confirm-style:
   * drags never feed, double-taps never double-feed, pets are never preempted.
   */
  readonly feedGuardMs: number;
  /** Pointer travel (Manhattan px) that turns a press into a drag. */
  readonly dragThresholdPx: number;
  /** The silent-run breach line stays at exactly minute 40 (R6.2). */
  readonly silentRunMinutes: number;
  /** Consolidation cadence, in sim ticks (one in-game minute). */
  readonly consolidationIntervalTicks: number;
}

export const RHYTHM: RhythmConfig = Object.freeze({
  stareMs: 3000,
  idleMs: 30000,
  rapidClickWindowMs: 1200,
  rapidClickCount: 4,
  petHoldMs: 650,
  nameHoldMs: 900,
  feedGuardMs: 300,
  dragThresholdPx: 8,
  silentRunMinutes: 40,
  consolidationIntervalTicks: 60,
});

/**
 * GV gains taper by stage — the long tail is the design (§3 option a). Stage 0
 * hooks at full weight; by stage 4 the same stare buys a fifth of the GV, so
 * the final act takes minutes, not seconds. Index = stage, values multiplicative.
 */
export const GV_STAGE_DECAY: readonly number[] = Object.freeze([
  1.0, // stage 0 — spring: the cozy act, full pull
  0.55, // stage 1 — summer
  0.3, // stage 2 — autumn
  0.18, // stage 3 — winter
  0.1, // stage 4 — bleak: the finale is earned slowly
]);

/** Stage → GV multiplier. Stages outside 0..4 clamp to the nearest end. */
export function stageDecayFor(stage: number): number {
  const index = Math.min(GV_STAGE_DECAY.length - 1, Math.max(0, Math.floor(stage)));
  const decay = GV_STAGE_DECAY[index];
  return decay === undefined ? 1 : decay;
}

// ---------------------------------------------------------------------------
// Seasonal parameter presets (§10.5-3: one act, one season)
// ---------------------------------------------------------------------------

/**
 * The five seasons. Mirrors `render/palette.ts` so the sim-side parameter
 * presets and the render-side palette drift derive the same season from the
 * same stage — one shared macro-clock. The sim must not import from render,
 * so the mapping is duplicated here and a test pins the two in lockstep.
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
 * What one season does to the care loop. The three dials §10.5-3 gives this
 * stream: hunger burn, food growth (feed restore), and the tick tempo. Values
 * are multipliers on the engine's baseline constants.
 *
 * Consumers:
 * - `tickMs`: the wiring runs the loop at `TICK_MS` (the spring baseline) for
 *   now; per-season tick stretch is wired in when the loop timer can be
 *   restructured without touching stream A's frozen wiring calls.
 * - `hungerMultiplier` / `feedRestoreMultiplier`: consumed where the engine
 *   applies stats decay and feed restore — engine.ts belongs to stream F, so
 *   these presets are the parameter interface F reads (ticket 0006). Until
 *   F wires them, they are inert data, not behavior.
 */
export interface SeasonParams {
  /** Hunger decay multiplier per tick (spring baseline = 1). */
  readonly hungerMultiplier: number;
  /** Feed hunger-restore multiplier (spring baseline = 1). */
  readonly feedRestoreMultiplier: number;
  /** Wall-clock tick interval for this season, in ms. */
  readonly tickMs: number;
}

export const SEASON_PARAMS: Readonly<Record<Season, SeasonParams>> = Object.freeze({
  // Spring (act 1): the friendly baseline — everything at book value.
  spring: { hungerMultiplier: 1.0, feedRestoreMultiplier: 1.0, tickMs: 3000 },
  // Summer (act 2): abundance — they burn slower and eat better.
  summer: { hungerMultiplier: 0.8, feedRestoreMultiplier: 1.2, tickMs: 3000 },
  // Autumn (act 3): the harvest is over — leaner meals.
  autumn: { hungerMultiplier: 1.05, feedRestoreMultiplier: 0.9, tickMs: 2800 },
  // Winter (act 4): scarcity — hunger bites, food helps less.
  winter: { hungerMultiplier: 1.3, feedRestoreMultiplier: 0.8, tickMs: 3200 },
  // Bleak (act 5): no season — the treadmill tightens one last turn.
  bleak: { hungerMultiplier: 1.5, feedRestoreMultiplier: 0.7, tickMs: 3500 },
});

/** Stage → season parameters. Stages outside 0..4 clamp to the nearest end. */
export function seasonParamsForStage(stage: number): SeasonParams {
  return SEASON_PARAMS[seasonForStage(stage)];
}
