/**
 * Frozen telemetry interface (stream A wiring; consumed by stream D).
 *
 * `getTelemetry()` is the one signature stream D may code against: the shape,
 * the field names, and the null-when-unknown semantics below are frozen. The
 * recorder is fed only from the integration layer's existing telemetry points
 * (pointer handlers, the idle check, the stare window, the naming panel, and
 * the sim's death detection); nothing in `src/sim/` reads or writes it.
 *
 * Field semantics:
 * - `hesitationMs`: the pause before the most recent feed. `null` before the
 *   first feed, and `null` when the hand had not moved inside the window, so
 *   no hesitation was measurable.
 * - `rapidClicks`: the running click count inside the most recent rapid-click
 *   window (1 after an isolated click — never 0 while the player is active).
 * - `idleMs`: elapsed time since the last recorded interaction, sampled at
 *   `getTelemetry()` call time against the injected clock.
 * - `stareMs`: accumulated pointer-rest time (each completed stare window
 *   adds its real elapsed milliseconds).
 * - `namedNames`: the names the player has given, in the order given.
 * - `feeds` / `cleans` / `deaths`: lifetime action counters.
 */

export interface Telemetry {
  hesitationMs: number | null;
  rapidClicks: number;
  idleMs: number;
  stareMs: number;
  namedNames: string[];
  feeds: number;
  cleans: number;
  deaths: number;
}

export interface TelemetryOptions {
  /** Injectable clock; defaults to the wall clock. Tests pass a fixed one. */
  readonly now?: () => number;
}

export interface TelemetryRecorder {
  /** Any player interaction the integration layer already observes. */
  recordInteraction(): void;
  recordPointerDown(input: { readonly hesitationMs: number | null; readonly rapidClicks: number }): void;
  /** One completed stare window; the recorder accumulates the durations. */
  recordStare(durationMs: number): void;
  recordFeed(hesitationMs: number | null): void;
  recordClean(): void;
  recordDeath(): void;
  recordName(name: string): void;
  getTelemetry(): Telemetry;
}

export function createTelemetryRecorder(options: TelemetryOptions = {}): TelemetryRecorder {
  const now = options.now ?? (() => Date.now());
  let lastInteractionAt = now();
  let lastHesitationMs: number | null = null;
  let rapidClicks = 0;
  let stareMs = 0;
  let feeds = 0;
  let cleans = 0;
  let deaths = 0;
  const namedNames: string[] = [];

  return {
    recordInteraction(): void {
      lastInteractionAt = now();
    },

    recordPointerDown(input): void {
      lastInteractionAt = now();
      lastHesitationMs = input.hesitationMs;
      rapidClicks = input.rapidClicks;
    },

    recordStare(durationMs): void {
      if (Number.isFinite(durationMs) && durationMs > 0) {
        stareMs += durationMs;
      }
    },

    recordFeed(hesitationMs): void {
      feeds += 1;
      lastHesitationMs = hesitationMs;
    },

    recordClean(): void {
      cleans += 1;
    },

    recordDeath(): void {
      deaths += 1;
    },

    recordName(name): void {
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        namedNames.push(trimmed);
      }
    },

    getTelemetry(): Telemetry {
      return {
        hesitationMs: lastHesitationMs,
        rapidClicks,
        idleMs: Math.max(0, now() - lastInteractionAt),
        stareMs,
        namedNames: [...namedNames],
        feeds,
        cleans,
        deaths,
      };
    },
  };
}
