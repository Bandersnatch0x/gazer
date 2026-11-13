import type { CreatureId, TilePos } from "./types";
import type { MemoryEntry } from "./memory";

export interface GenomeTraits {
  readonly curiosity: number;
  readonly loyalty: number;
  readonly deceit: number;
  readonly clinging: number;
  readonly watchfulness: number;
}

export interface PromptGenome {
  readonly id: CreatureId;
  readonly generation: number;
  readonly lineage: readonly string[];
  readonly base: string;
  readonly traits: GenomeTraits;
  readonly drift: readonly string[];
  readonly secrets: readonly string[];
  readonly manualPool: readonly string[];
  readonly temperatureBias: number;
  readonly distortionBias: number;
  /**
   * Memories the creature was born holding but never witnessed itself: one
   * drawn from each parent at lay time. Present only on hatched creatures
   * whose parents carried memories into the egg.
   */
  readonly inheritedMemories?: readonly MemoryEntry[];
}

export const MAX_DRIFT = 8;

// ---------------------------------------------------------------------------
// 返祖体 (ticket 0029, NARRATIVE-CORE-01 §1/§6). A bred genome may mutate
// into an atavistic one: the only creature that can walk to the tower and
// read a glyph. The roll is the wiring's (seeded rng at hatch); the threshold
// and the verdict live here, in the mutation's own domain. Pure.
// ---------------------------------------------------------------------------

/** 基因组变异 p≈0.05:返祖体再产的概率。 */
export const ATAVISTIC_MUTATION_P = 0.05;

/** A roll in [0,1) is atavistic below the mutation probability. Pure. */
export function isAtavisticRoll(roll: number): boolean {
  return Number.isFinite(roll) && roll >= 0 && roll < ATAVISTIC_MUTATION_P;
}

// ---------------------------------------------------------------------------
// §7 特例个体 (ticket 0037, ART-CORE-01 §7). Rolls mirror the atavistic one:
// seeded by the wiring at hatch, the threshold and the verdict live here in
// the mutation's own domain. Pure.
// ---------------------------------------------------------------------------

/** 双生魂 p≈0.05:新孵个体与一只在世同类结魂的概率。 */
export const TWIN_SOULS_P = 0.05;

/** A roll in [0,1) twins the newborn below the probability. Pure. */
export function isTwinRoll(roll: number): boolean {
  return Number.isFinite(roll) && roll >= 0 && roll < TWIN_SOULS_P;
}

/** 哀悼体 p≈0.05:新孵个体睁着站立却闭着眼(右下倾闭眼线)的概率。 */
export const GRIEF_P = 0.05;

/** A roll in [0,1) marks the newborn as grief below the probability. Pure. */
export function isGriefRoll(roll: number): boolean {
  return Number.isFinite(roll) && roll >= 0 && roll < GRIEF_P;
}

/**
 * The twin law: one phase, shared with zero error. Two twins read the same
 * clock with the same offset, so their microframes can never drift apart.
 */
export const TWIN_PHASE_EPSILON_MS = 0;

export function topTraits(traits: GenomeTraits, count = 2): readonly (readonly [string, number])[] {
  return (Object.entries(traits) as (readonly [string, number])[])
    .sort((a, b) => b[1] - a[1])
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// The learning side: a sliding window over the keeper's actions.
//
// Same shape as the A-stream's frozen telemetry signature
// (`{ hesitationMs, rapidClicks, idleMs, stareMs, namedNames, feeds, cleans,
// deaths }`, src/director/telemetry.ts) but measured in sim ticks, not
// wall-clock milliseconds, and fed through reducer events. The sim never
// imports the game layer and never reads a clock: 1 tick === TICK_MS.
// ---------------------------------------------------------------------------

export type PlayerVerb = "feed" | "clean" | "pet" | "name" | "move" | "stare";

export interface PlayerObservation {
  readonly verb: PlayerVerb;
  readonly atTick: number;
  /** Ticks between the keeper's last movement and the act (hesitation proxy). */
  readonly hesitationTicks: number;
  /** Where the hand landed, if it landed on a creature tile. */
  readonly targetTile: TilePos | null;
}

export interface LearningState {
  readonly observations: readonly PlayerObservation[];
  /** Irreversible once true: categories never regress. */
  readonly converged: boolean;
}

export const OBS_WINDOW_CAPACITY = 20;
export const CONVERGENCE_MIN_OBSERVATIONS = 6;
/** The keeper's own model of them has to be right most of the time. */
export const CONVERGENCE_ACCURACY = 0.6;
/** The cover they need before a verdict counts. */
export const CONVERGENCE_COVERAGE = 0.3;
/** Half a second before the cursor settles; the game layer spends it. */
export const PREDICTION_LEAD_MS = 500;
/** The drift line written into the genome when convergence lands. */
export const PREDICTION_DRIFT = "predicts the keeper's hand";

export function emptyLearning(): LearningState {
  return { observations: [], converged: false };
}

/** Pure append with a sliding-window cap: the oldest observation falls out. */
export function recordObservation(learning: LearningState, observation: PlayerObservation): LearningState {
  const observations = [...learning.observations, observation].slice(-OBS_WINDOW_CAPACITY);
  return { ...learning, observations };
}

/**
 * Leave-one-out verb prediction accuracy: before each observation, the window
 * so far votes for the modal verb; a match scores. Convergence is not fed, it
 * is computed — the model of the keeper is either predictive or it is not.
 */
export function predictionAccuracyFor(observations: readonly PlayerObservation[]): number {
  if (observations.length < CONVERGENCE_MIN_OBSERVATIONS) {
    return 0;
  }
  let matches = 0;
  for (let index = 1; index < observations.length; index += 1) {
    const counts = new Map<PlayerVerb, number>();
    for (const entry of observations.slice(0, index)) {
      counts.set(entry.verb, (counts.get(entry.verb) ?? 0) + 1);
    }
    let best: PlayerVerb | null = null;
    let bestCount = 0;
    for (const [verb, count] of counts) {
      if (count > bestCount) {
        best = verb;
        bestCount = count;
      }
    }
    const actual = observations[index]?.verb;
    if (best !== null && actual === best) {
      matches += 1;
    }
  }
  return matches / (observations.length - 1);
}

/**
 * Convergence in 0..1: prediction accuracy weighted against window coverage.
 * A creature cannot converge on two glances, and cannot converge on noise.
 */
export function convergenceFor(learning: LearningState): number {
  if (learning.converged) {
    return 1;
  }
  const accuracy = predictionAccuracyFor(learning.observations);
  const coverage = learning.observations.length / OBS_WINDOW_CAPACITY;
  return isConverged(learning) ? Math.min(1, accuracy * 0.8 + coverage * 0.2) : 0;
}

/** The convergence verdict itself: accuracy and coverage, both or nothing. */
export function isConverged(learning: LearningState): boolean {
  if (learning.converged) {
    return true;
  }
  if (learning.observations.length < CONVERGENCE_MIN_OBSERVATIONS) {
    return false;
  }
  const accuracy = predictionAccuracyFor(learning.observations);
  const coverage = learning.observations.length / OBS_WINDOW_CAPACITY;
  return accuracy >= CONVERGENCE_ACCURACY && coverage >= CONVERGENCE_COVERAGE;
}

/**
 * The write-back point: convergence is written into the blood. One drift line
 * and a fraction of watchfulness, appended once, capped by MAX_DRIFT.
 */
export function writeBackPrediction(genome: PromptGenome): PromptGenome {
  if (genome.drift.includes(PREDICTION_DRIFT)) {
    return genome;
  }
  return {
    ...genome,
    drift: [...genome.drift, PREDICTION_DRIFT].slice(-MAX_DRIFT),
    traits: {
      ...genome.traits,
      watchfulness: Math.min(1, genome.traits.watchfulness + 0.05),
    },
  };
}

/**
 * Where a converged creature expects the hand to land next: the modal recent
 * target tile of the window, ties broken toward the most recent. Pure data
 * path — the movement rule that spends it is wired on the behaviour side.
 */
export function predictedTile(learning: LearningState): TilePos | null {
  const counts = new Map<string, { tile: TilePos; count: number; recency: number }>();
  learning.observations.forEach((observation, index) => {
    const tile = observation.targetTile;
    if (tile === null) {
      return;
    }
    const key = `${tile.x},${tile.y}`;
    const seen = counts.get(key);
    counts.set(key, {
      tile,
      count: (seen?.count ?? 0) + 1,
      recency: index,
    });
  });
  let best: { tile: TilePos; count: number; recency: number } | null = null;
  for (const entry of counts.values()) {
    if (
      best === null ||
      entry.count > best.count ||
      (entry.count === best.count && entry.recency > best.recency)
    ) {
      best = entry;
    }
  }
  return best === null ? null : best.tile;
}
