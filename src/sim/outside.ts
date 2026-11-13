/**
 * The outside (projection hidden line, tickets 0056; decision 0014, SPEC §4
 * L1/L2). The world is this machine's rendering of an external signal stream
 * (ART-CORE-04 §3's BIOS dark line: `Detecting: {settlement} ... FOUND`).
 * This module owns the offline snapshot of that stream: a fixed bilingual
 * archetype pool shipped with the build, plus the pure functions that pick a
 * day's seed and percolate it into creatures' memories as ordinary `heard`
 * entries.
 *
 * Boundaries held:
 * - Zero network, zero authorization (redline 8 untouched): the pool is
 *   in-repo data, anonymized public-event archetypes, no personal data.
 * - Zero wall clock (decision 0003): the seed for a day is a pure function of
 *   `(world.seed, day)`; the pool itself is static build data. The optional
 *   `anchor_time` slice selection is deliberately NOT implemented here — the
 *   seed-keyed stream is the deterministic default (SPEC §8).
 * - The ticker keeps lying (news.ts never mentions the outside); percolation
 *   enters only through memory, so the Silent Run is intact: creatures keep
 *   hearing, they just never speak.
 *
 * The stream carries momentum: a day's topic repeats yesterday's with p=0.55
 * before a hash decides a flip. Real event streams autocorrelate (weather
 * trends, market momentum); that structure is what the ant model in
 * `./projection` learns, and the calibration test (ticket 0057) asserts the
 * exploitation is real, not that any single run is rigged.
 */

import type { CreatureId, WorldState } from "./types";
import type { MemoryEntry, MemorySlice } from "./memory";
import { rememberEntry } from "./memory";
import { hashString } from "./rng";
import { worldCalendarAt, worldDay } from "./clock";

export type OutsideTopic = "sky" | "market" | "crowd";

export const OUTSIDE_TOPICS: readonly OutsideTopic[] = ["sky", "market", "crowd"];

/** The chance a day keeps yesterday's topic before the flip hash is consulted. */
export const TOPIC_MOMENTUM_P = 0.55;

/** Days whose seed intensity falls below this never percolate (a quiet day:
 * the event happens outside, nobody hears it inside). */
export const PERCOLATION_MIN_INTENSITY = 0.35;

interface Archetype {
  readonly en: string;
  readonly zh: string;
  /** -1..1: how the swarm tends to feel about this kind of outside event. */
  readonly valence: number;
}

/** The offline snapshot's phrase pool: eight archetypes per topic, bilingual
 * (manual-pool discipline), each carrying a valence the swarm inherits. */
const ARCHETYPE_POOL: Readonly<Record<OutsideTopic, readonly Archetype[]>> = Object.freeze({
  sky: Object.freeze([
    { en: "the sky elsewhere burned orange until noon", zh: "别处的天空烧成橙色，直到正午", valence: -0.4 },
    { en: "rain arrived sideways and stayed three days", zh: "雨横着来，赖了三天", valence: -0.2 },
    { en: "the frost came early and took the late crop", zh: "霜来得早，收走了晚茬", valence: -0.5 },
    { en: "a long heat sat over the valley", zh: "长热伏在山谷上", valence: -0.3 },
    { en: "the wind turned and carried something green", zh: "风转了向，捎来一点绿", valence: 0.4 },
    { en: "snow fell on a day nobody had scheduled", zh: "雪落在没人排程的日子", valence: 0.1 },
    { en: "the light was the color of old glass", zh: "光是最旧玻璃的颜色", valence: 0.0 },
    { en: "two sunrises were counted; one was wrong", zh: "数出两次日出；有一次是错的", valence: -0.1 },
  ]),
  market: Object.freeze([
    { en: "the price of bread doubled overnight", zh: "面包价一夜翻倍", valence: -0.6 },
    { en: "a ledger somewhere quietly balanced", zh: "某处的账目悄悄平了", valence: 0.3 },
    { en: "the market gates stayed shut till noon", zh: "市门关到正午", valence: -0.4 },
    { en: "coin grew heavier and worth less", zh: "钱更沉，也更不值", valence: -0.5 },
    { en: "a debt was forgiven in a small town", zh: "小镇上有一笔债被免了", valence: 0.5 },
    { en: "the granary reported numbers twice", zh: "粮仓报了两遍数", valence: -0.3 },
    { en: "someone bought the whole harvest forward", zh: "有人把整季收成买到了前头", valence: -0.2 },
    { en: "the tolls dropped and the road filled", zh: "税降了，路满了", valence: 0.4 },
  ]),
  crowd: Object.freeze([
    { en: "a crowd gathered and could not say why", zh: "人群聚起来，说不出为什么", valence: -0.2 },
    { en: "a rumor walked the whole road in a day", zh: "一条传闻一天走完全程", valence: -0.4 },
    { en: "they sang the same verse three towns over", zh: "隔三个镇，唱的是同一段", valence: 0.3 },
    { en: "the doors were painted the same color", zh: "门被刷成了同一种颜色", valence: 0.1 },
    { en: "someone counted the crowd twice and got two numbers", zh: "有人数了两遍人群，得出两个数", valence: -0.1 },
    { en: "a name was chanted until it wore out", zh: "一个名字被喊到磨旧", valence: -0.3 },
    { en: "the ferry carried twice its weight in stories", zh: "渡船载了双倍重量的故事", valence: 0.2 },
    { en: "they agreed on nothing except the hour", zh: "他们什么都没谈拢，除了时辰", valence: 0.0 },
  ]),
});

export interface OutsideSeed {
  readonly id: string;
  readonly day: number;
  readonly topic: OutsideTopic;
  readonly archetypeIndex: number;
  readonly intensity: number;
}

/**
 * Build-time invariant: every topic's pool is frozen and non-empty, so a
 * missing entry can never reach a creature's memory as an empty fact.
 */
export const ARCHETYPE_POOL_UNAVAILABLE_GUARD = OUTSIDE_TOPICS.every(
  (topic) => ARCHETYPE_POOL[topic].length > 0,
);

/** A bounded slice of the pool, for tests and the calibration bench. */
export const OUTSIDE_SEED_POOL_SIZE = ARCHETYPE_POOL.sky.length;

function hash01(text: string): number {
  return (hashString(text) >>> 0) / 0x1_0000_0000;
}

/**
 * The seed for a world day. Pure: same (seed, day), same seed — offline,
 * forever. The topic chain carries momentum (Markov p=0.55) before a hash
 * may flip it to a different topic; the archetype and intensity are hash
 * draws on their own salts so they stay independent of the flip.
 */
export function seedForDay(worldSeed: number, day: number): OutsideSeed {
  const topic = topicForDay(worldSeed, day);
  const pool = ARCHETYPE_POOL[topic];
  const archetypeIndex = hashString(`${worldSeed}:arch:${day}`) % pool.length;
  const intensity = 0.3 + hash01(`${worldSeed}:int:${day}`) * 0.6;
  return { id: `out_d${day}`, day, topic, archetypeIndex, intensity };
}

/** The day's topic, honoring the momentum chain back to day 0. */
export function topicForDay(worldSeed: number, day: number): OutsideTopic {
  let topic = OUTSIDE_TOPICS[hashString(`${worldSeed}:topic:0`) % OUTSIDE_TOPICS.length] ?? "sky";
  for (let d = 1; d <= day; d += 1) {
    const stays = hash01(`${worldSeed}:stay:${d}`) < TOPIC_MOMENTUM_P;
    if (stays) {
      continue;
    }
    const others = OUTSIDE_TOPICS.filter((candidate) => candidate !== topic);
    const flip = hashString(`${worldSeed}:flip:${d}`) % others.length;
    topic = others[flip] ?? topic;
  }
  return topic;
}

/** The archetype a seed resolves to. */
export function archetypeOf(seed: OutsideSeed): Archetype {
  return ARCHETYPE_POOL[seed.topic][seed.archetypeIndex] ?? ARCHETYPE_POOL[seed.topic][0] ?? { en: "", zh: "", valence: 0 };
}

/** Percolation is due once per in-game day, at the ninth hour exactly
 * (09:00:00 — one tick, not the whole hour). */
export function percolationDue(tick: number): boolean {
  const calendar = worldCalendarAt(tick);
  return calendar.hour === 9 && calendar.minute === 0;
}

/**
 * The creatures that hear today's seed. 1–3 living creatures, hash-picked;
 * the same world always picks the same ears.
 */
export function percolationTargets(world: WorldState, seed: OutsideSeed): readonly CreatureId[] {
  const living = Object.values(world.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort();
  if (living.length === 0) {
    return [];
  }
  const count = Math.min(living.length, 1 + (hashString(`${world.seed}:${seed.id}:n`) % 3));
  const start = hashString(`${world.seed}:${seed.id}:s`) % living.length;
  const targets: CreatureId[] = [];
  for (let i = 0; i < count; i += 1) {
    targets.push(living[(start + i) % living.length] ?? living[0] ?? "");
  }
  return targets;
}

/**
 * One day's percolation: write the seed into the chosen ears as ordinary
 * `heard` memory. Pure over (world, memories); returns the next memories
 * record and the seed that landed (null on a quiet day). The engine never
 * learns about the outside — this rides the plain memory pipeline, so gossip,
 * roundtable citation and the validator treat it exactly like any rumour.
 */
export function percolationPass(
  world: WorldState,
  memories: Readonly<Record<CreatureId, MemorySlice>>,
): { readonly memories: Readonly<Record<CreatureId, MemorySlice>>; readonly seed: OutsideSeed | null } {
  const day = worldDay(world.tick);
  const seed = seedForDay(world.seed, day);
  if (seed.intensity < PERCOLATION_MIN_INTENSITY) {
    return { memories, seed: null };
  }
  const archetype = archetypeOf(seed);
  const targets = percolationTargets(world, seed);
  if (targets.length === 0) {
    return { memories, seed: null };
  }
  const next = { ...memories };
  for (const target of targets) {
    const slice = next[target] ?? { working: [], consolidated: [] };
    const entry: MemoryEntry = {
      id: seed.id,
      atTick: world.tick,
      wallClock: `d${day}`,
      fact: archetype.en,
      witnessed: "heard",
      source: null,
      distortion: null,
      salience: 0.5 + seed.intensity * 0.4,
      valence: archetype.valence * seed.intensity,
    };
    next[target] = rememberEntry(slice, entry);
  }
  return { memories: next, seed };
}
