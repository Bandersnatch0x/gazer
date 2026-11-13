/**
 * The reflection (projection hidden line, ticket 0057; decision 0014, SPEC
 * §4 L3/L4). Two pure layers over the outside's memory trail:
 *
 * - The reflection: the engine-side aggregation of what the swarm currently
 *   believes about the outside (and about the hand that feeds them). It is
 *   nobody's belief — the swarm never sees this whole; that difference is
 *   Stage 4 material (SPEC §3).
 * - The bee/ant predictor: bees inject wild claims when the ant scores are
 *   too close to call; ants reinforce whatever the stream's momentum keeps
 *   confirming. The "pheromone" is an exponential decay over the last seven
 *   days of observed topics — the same salience-decay spirit the memory
 *   layer already uses, no new state shape.
 *
 * Determinism: every function is pure over (state, world, memories). The
 * same seed and the same memory trail produce the same Reflection JSON byte
 * for byte (SPEC §10.1). The calibration bench (ticket 0057's test) asserts
 * the ant model beats the uniform baseline by ≥ 10pp — that assertion is the
 * honest alternative to promising prediction.
 */

import type { CreatureId, WorldState } from "./types";
import type { MemorySlice } from "./memory";
import { hashString } from "./rng";
import { worldDay } from "./clock";
import {
  type OutsideTopic,
  OUTSIDE_TOPICS,
  archetypeOf,
  seedForDay,
  topicForDay,
} from "./outside";

export type ReflectionTopic = OutsideTopic | "player";

export interface ReflectionNode {
  readonly topic: ReflectionTopic;
  readonly claimEn: string;
  readonly claimZh: string;
  readonly heldBy: readonly CreatureId[];
  /** 0..1. Outside topics: the node's share of the outside's belief mass. */
  readonly confidence: number;
  readonly meanValence: number;
  /** Entry ids, newest first; [0] must resolve inside a living slice. */
  readonly traceChain: readonly string[];
  /** 0..1: the share of this node's belief mass written today. */
  readonly divergence: number;
}

/** Exactly four nodes, player last (SPEC §7). */
export interface Reflection {
  readonly day: number;
  readonly nodes: readonly ReflectionNode[];
}

export interface PredictionClaim {
  readonly id: string;
  readonly topic: OutsideTopic;
  readonly resolvesOnDay: number;
  readonly resolvedTo: "hit" | "miss" | null;
  readonly confidence: number;
}

/** Persisted on the world (optional field `projection`) so saves replay. */
export interface ProjectionState {
  readonly predictions: readonly PredictionClaim[];
  readonly lastReflection: Reflection | null;
  readonly hits: Readonly<Record<OutsideTopic, { readonly hit: number; readonly miss: number }>>;
}

/** The ant's memory horizon, in days. */
const ANT_HORIZON_DAYS = 7;
/** The ant's day-over-day decay — the pheromone evaporation rate. */
const ANT_DECAY = 0.6;
/** Below this top-two gap the bees get the day (wild claim). */
const BEE_GAP_THRESHOLD = 0.12;
/** Bounded claim history: open + resolved, trimmed to the last 14. */
const PREDICTION_CAPACITY = 14;

export function emptyProjectionState(): ProjectionState {
  return {
    predictions: [],
    lastReflection: null,
    hits: { sky: { hit: 0, miss: 0 }, market: { hit: 0, miss: 0 }, crowd: { hit: 0, miss: 0 } },
  };
}

interface TopicTrail {
  readonly holders: Set<CreatureId>;
  valences: { readonly v: number; readonly w: number }[];
  entries: { readonly id: string; readonly atTick: number; readonly day: number }[];
  mass: number;
  massToday: number;
}

function emptyTrail(): TopicTrail {
  return { holders: new Set(), valences: [], entries: [], mass: 0, massToday: 0 };
}

function playerClaim(valence: number): { readonly en: string; readonly zh: string } {
  if (valence > 0.15) {
    return { en: "the hand is warm", zh: "那只手是暖的" };
  }
  if (valence < -0.15) {
    return { en: "the hand is cold", zh: "那只手是冷的" };
  }
  return { en: "the hand is steady", zh: "那只手是稳的" };
}

function finalizeNode(
  topic: ReflectionTopic,
  trail: TopicTrail,
  claim: { readonly en: string; readonly zh: string },
): ReflectionNode {
  const mass = trail.mass;
  const seen = new Set<string>();
  const traceChain: string[] = [];
  for (const entry of [...trail.entries].sort((a, b) => b.atTick - a.atTick)) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      traceChain.push(entry.id);
    }
    if (traceChain.length >= 5) {
      break;
    }
  }
  const valenceWeight = trail.valences.reduce((sum, item) => sum + item.w, 0);
  const meanValence =
    valenceWeight > 0 ? trail.valences.reduce((sum, item) => sum + item.v * item.w, 0) / valenceWeight : 0;
  return {
    topic,
    claimEn: claim.en,
    claimZh: claim.zh,
    heldBy: [...trail.holders].sort(),
    confidence: mass,
    meanValence,
    traceChain,
    divergence: mass > 0 ? trail.massToday / mass : 0,
  };
}

/**
 * The engine-side reflection over the current memory trail. Pure: same
 * world and memories, same nodes byte for byte. Outside entries are
 * recognized by their `out_` id prefix (written by `percolationPass`);
 * everything else feeds the player node — the swarm's model of the hand.
 */
export function aggregateReflection(
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
  day: number,
): Reflection {
  const trails: Record<ReflectionTopic, TopicTrail> = {
    sky: emptyTrail(),
    market: emptyTrail(),
    crowd: emptyTrail(),
    player: emptyTrail(),
  };
  for (const creatureId of Object.keys(memories).sort()) {
    const slice = memories[creatureId];
    if (slice === undefined || creatureDead(world, creatureId)) {
      continue;
    }
    for (const entry of slice.working) {
      const trail = trails[entry.id.startsWith("out_") ? topicOfEntry(world, entry) : "player"];
      if (trail === undefined) {
        continue;
      }
      trail.holders.add(creatureId);
      trail.valences.push({ v: entry.valence, w: entry.salience });
      trail.entries.push({ id: entry.id, atTick: entry.atTick, day: worldDay(entry.atTick) });
      trail.mass += entry.salience;
      if (worldDay(entry.atTick) === day) {
        trail.massToday += entry.salience;
      }
    }
  }
  const totalOutsideMass =
    trails.sky.mass + trails.market.mass + trails.crowd.mass;
  const nodes: ReflectionNode[] = OUTSIDE_TOPICS.map((topic) => {
    const trail = trails[topic];
    const claim = latestClaim(world, topic, trail);
    const node = finalizeNode(topic, trail, claim);
    return {
      ...node,
      confidence: totalOutsideMass > 0 ? node.confidence / totalOutsideMass : 0,
    };
  });
  const playerTrail = trails.player;
  const valenceWeight = playerTrail.valences.reduce((sum, item) => sum + item.w, 0);
  const playerValence =
    valenceWeight > 0
      ? playerTrail.valences.reduce((sum, item) => sum + item.v * item.w, 0) / valenceWeight
      : 0;
  nodes.push({
    ...finalizeNode("player", playerTrail, playerClaim(playerValence)),
    confidence: Math.min(1, playerTrail.mass / 12),
  });
  return { day, nodes };
}

function creatureDead(world: WorldState, creatureId: CreatureId): boolean {
  return world.creatures[creatureId]?.behavior === "dead";
}

/**
 * The ant model scores topics from what the swarm actually heard — the
 * memory trail, never the stream itself. This is the load-bearing choice
 * for the lie loop: a fabricated outside memory drags a day's observed
 * topic off the truth, and tomorrow's claim degrades with it (ticket 0059).
 * Each observed day contributes its decayed weight to the topic that held
 * the most belief mass that day; quiet days simply have no observation.
 */
function scoreFromTrail(
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
  day: number,
): Map<OutsideTopic, number> {
  const perDayMass = new Map<number, Map<OutsideTopic, number>>();
  for (const creatureId of Object.keys(memories).sort()) {
    const slice = memories[creatureId];
    if (slice === undefined || creatureDead(world, creatureId)) {
      continue;
    }
    for (const entry of slice.working) {
      if (!entry.id.startsWith("out_")) {
        continue;
      }
      const entryDay = worldDay(entry.atTick);
      if (entryDay > day || entryDay < day - ANT_HORIZON_DAYS + 1) {
        continue;
      }
      const topic = topicOfEntry(world, entry);
      let dayMass = perDayMass.get(entryDay);
      if (dayMass === undefined) {
        dayMass = new Map();
        perDayMass.set(entryDay, dayMass);
      }
      dayMass.set(topic, (dayMass.get(topic) ?? 0) + entry.salience);
    }
  }
  const scores = new Map<OutsideTopic, number>(OUTSIDE_TOPICS.map((topic) => [topic, 0]));
  for (const [entryDay, dayMass] of perDayMass) {
    let bestTopic: OutsideTopic = "sky";
    let bestMass = -1;
    for (const topic of OUTSIDE_TOPICS) {
      const mass = dayMass.get(topic) ?? 0;
      if (mass > bestMass) {
        bestMass = mass;
        bestTopic = topic;
      }
    }
    const weight = Math.pow(ANT_DECAY, day - entryDay);
    scores.set(bestTopic, (scores.get(bestTopic) ?? 0) + weight);
  }
  return scores;
}

const OUTSIDE_ID_PATTERN = /^out_(sky|market|crowd)_d/;

function topicOfEntry(world: WorldState, entry: { readonly id: string; readonly atTick: number }): OutsideTopic {
  // The tag lives in the id (percolationEntryId); the day derivation is the
  // fallback for ids written before the tag scheme — a forger that skips the
  // tag gets the honest default, never a crash.
  const match = OUTSIDE_ID_PATTERN.exec(entry.id);
  if (match?.[1] !== undefined) {
    return match[1] as OutsideTopic;
  }
  return seedForDay(world.seed, worldDay(entry.atTick)).topic;
}

function latestClaim(
  world: WorldState,
  topic: OutsideTopic,
  trail: TopicTrail,
): { readonly en: string; readonly zh: string } {
  const newest = [...trail.entries].sort((a, b) => b.atTick - a.atTick)[0];
  if (newest === undefined) {
    return { en: "no outside events to report", zh: "没有外部事件可报" };
  }
  const seed = seedForDay(world.seed, newest.day);
  const archetype = archetypeOf(seed);
  return seed.topic === topic ? archetype : { en: "", zh: "" };
}

/**
 * One day boundary of the predictor: resolve yesterday's open claims against
 * the seed that actually landed, re-score the ant model over the observable
 * history, let the bees in when the scores are too close to call, and emit
 * tomorrow's claim. Pure; returns the next state (callers persist it on the
 * world's optional `projection` field).
 */
export function advanceProjections(
  state: ProjectionState,
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
  day: number,
): ProjectionState {
  const hits: Record<OutsideTopic, { hit: number; miss: number }> = {
    sky: { ...state.hits.sky },
    market: { ...state.hits.market },
    crowd: { ...state.hits.crowd },
  };
  const actualTopic = topicForDay(world.seed, day);
  const predictions = state.predictions.map((claim) => {
    if (claim.resolvedTo !== null || claim.resolvesOnDay !== day) {
      return claim;
    }
    const resolvedTo: "hit" | "miss" = claim.topic === actualTopic ? "hit" : "miss";
    const bucket = hits[claim.topic];
    if (bucket !== undefined) {
      hits[claim.topic] =
        resolvedTo === "hit" ? { ...bucket, hit: bucket.hit + 1 } : { ...bucket, miss: bucket.miss + 1 };
    }
    return { ...claim, resolvedTo };
  });

  const scores = scoreFromTrail(world, memories, day);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0] ?? ["sky", 0];
  const second = ranked[1] ?? ["market", 0];
  const gap = (top[1] ?? 0) - (second[1] ?? 0);
  const beeTurn = gap < BEE_GAP_THRESHOLD;
  const predictedTopic: OutsideTopic = beeTurn
    ? OUTSIDE_TOPICS[hashString(`${day}:bee:${world.seed}`) % OUTSIDE_TOPICS.length] ?? "sky"
    : (top[0] as OutsideTopic);
  const confidence = beeTurn
    ? 0.3
    : Math.min(0.9, 0.3 + 0.4 * ((top[1] ?? 0) / Math.max(1, (top[1] ?? 0) + (second[1] ?? 0))));

  const emitted: PredictionClaim = {
    id: `pred_d${day + 1}`,
    topic: predictedTopic,
    resolvesOnDay: day + 1,
    resolvedTo: null,
    confidence,
  };
  const kept = [...predictions, emitted].slice(-PREDICTION_CAPACITY);
  return {
    predictions: kept,
    lastReflection: aggregateReflection(world, memories, day),
    hits,
  };
}

/**
 * Corruption pressure (ticket 0059's hook): how far the current outside
 * distribution leans on fabricated entries, 0..1. Pure; the game layer feeds
 * this into the FX executor's pollution face.
 */
export function corruptionPressure(
  memories: Readonly<Record<CreatureId, MemorySlice>>,
  day: number,
): number {
  let fabricated = 0;
  let total = 0;
  for (const slice of Object.values(memories)) {
    for (const entry of slice.working) {
      if (!entry.id.startsWith("out_") || worldDay(entry.atTick) < day - ANT_HORIZON_DAYS) {
        continue;
      }
      total += 1;
      if (entry.distortion !== null) {
        fabricated += 1;
      }
    }
  }
  return total > 0 ? fabricated / total : 0;
}

/** Re-exports for the UI's locale rendering (SPEC §4 L5). */
export { archetypeOf, seedForDay } from "./outside";
