/**
 * The social layer (stream F, ticket 0006).
 *
 * Mood dynamics, sex dimorphism, juvenile care, emergent division of labour,
 * mourning circles, factions, and terrain traces. Everything here is pure and
 * deterministic: no `Math.random`, no clock, no I/O — the one source of
 * randomness is `createRng(seed, salt)`, and every pass runs inside the engine
 * reducer so replay stays exact.
 *
 * Ownership notes:
 * - The whole shape lives here; `types.ts` only carries the one optional
 *   `WorldState.social` field (lead ruling, 2026-11-12).
 * - Numeric values marked "F-owned, B may re-home" are rhythm candidates; they
 *   intentionally do not touch `src/sim/rhythm.ts` (stream B's file).
 * - Nothing here renders. Stains, accents, and factions are data only; the
 *   render layer consumes them through existing palette/tile seams.
 */

import type { CreatureId, CreatureState, Mood, TilePos, WorldState } from "./types";
import type { MemorySlice } from "./memory";
import type { LearningState } from "./genome";
import { predictedTile } from "./genome";
import { WHISPER_RANGE } from "./gossip";
import { createRng } from "./rng";

// ---------------------------------------------------------------------------
// World social state
// ---------------------------------------------------------------------------

export type Sex = "female" | "male";

/** A mood with a fading intensity. Intensity 0 means "no mood". */
export interface MoodState {
  readonly mood: Mood;
  /** 0..1. Decays every tick; below the adopt floor a mood can be replaced. */
  readonly intensity: number;
}

export type StainKind = "wear" | "feed" | "hoard" | "mourning";

/** Terrain trace on one tile. Entries are faded by cleaning, never removed. */
export interface TileStain {
  readonly kind: StainKind;
  readonly intensity: number;
  readonly createdAtTick: number;
  readonly lastTouchTick: number;
}

/**
 * One mourning circle. Participants hold ring slots around the corpse in
 * silence; the circle expires after `duration` ticks.
 */
export interface MourningCircle {
  readonly corpseId: CreatureId;
  readonly at: TilePos;
  readonly participants: readonly CreatureId[];
  readonly startedTick: number;
  readonly duration: number;
}

export interface SocialState {
  /**
   * Sexes, assigned once at hatch and never re-rolled (lead ruling:
   * 判明即冻结). Creatures absent from the table are unsexed and pair as
   * before — that keeps director spawns and legacy worlds pairing.
   */
  readonly sexes: Readonly<Record<CreatureId, Sex>>;
  readonly moods: Readonly<Record<CreatureId, MoodState>>;
  /** Keyed by `stainKey(tile)`; bounded by the 14×14 diamond. */
  readonly stains: Readonly<Record<string, TileStain>>;
  readonly mourning: readonly MourningCircle[];
}

export function emptySocial(): SocialState {
  return { sexes: {}, moods: {}, stains: {}, mourning: [] };
}

export function ensureSocial(state: Pick<WorldState, "social">): SocialState {
  return state.social ?? emptySocial();
}

export function stainKey(at: TilePos): string {
  return `${at.x},${at.y}`;
}

/** Diamond bounds, mirroring engine GRID_MIN/GRID_MAX (frozen); a test pins them. */
export const SOCIAL_GRID_MIN = 1;
export const SOCIAL_GRID_MAX = 14;

function clampToGrid(value: number): number {
  return Math.min(SOCIAL_GRID_MAX, Math.max(SOCIAL_GRID_MIN, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// ---------------------------------------------------------------------------
// Sex: dimorphism and the pairing gate
// ---------------------------------------------------------------------------

/**
 * Accent colours (stream C coordination, params only — render files untouched).
 * Female keeps C's cozy accent; male is its cool complement. Faction hues are
 * consumed by the render side through `factionAccent`.
 */
export const ACCENT_FEMALE = "#e8a87c";
export const ACCENT_MALE = "#7ec8e8";
export const ACCENT_FACTION_TENDER = "#a8d8a0";
export const ACCENT_FACTION_WRONG = "#b46a8a";

export function accentForSex(sex: Sex): string {
  return sex === "female" ? ACCENT_FEMALE : ACCENT_MALE;
}

/**
 * Deterministic sex for a creature id under a world seed. Same id, same seed,
 * same sex — forever. Called only at hatch time; the result is written into
 * `social.sexes` and frozen there.
 */
export function sexFor(creatureId: string, seed: number): Sex {
  return createRng(seed, `sex:${creatureId}`).next() < 0.5 ? "female" : "male";
}

/** Writes a sex once. An existing entry is never rewritten (判明即冻结). */
export function registerSex(social: SocialState, creatureId: CreatureId, sex: Sex): SocialState {
  if (social.sexes[creatureId] !== undefined) {
    return social;
  }
  return { ...social, sexes: { ...social.sexes, [creatureId]: sex } };
}

export function sexOf(social: SocialState, creatureId: CreatureId): Sex | null {
  return social.sexes[creatureId] ?? null;
}

/**
 * The pairing gate. Both sexes known → they must differ; either unknown →
 * compatible (legacy worlds and director spawns pair as before).
 */
export function pairSexCompatible(social: SocialState, aId: CreatureId, bId: CreatureId): boolean {
  const a = sexOf(social, aId);
  const b = sexOf(social, bId);
  if (a === null || b === null) {
    return true;
  }
  return a !== b;
}

// ---------------------------------------------------------------------------
// Mood dynamics: cause → contagion → decay → behaviour
// ---------------------------------------------------------------------------

/** F-owned, B may re-home. A strong mood fades over ~30 ticks. */
export const MOOD_DECAY_PER_TICK = 0.03;
/** F-owned, B may re-home. Per-tick intensity bleed between two neighbours. */
export const MOOD_CONTAGION_RATE = 0.08;
/** A neighbour's mood this strong is worth catching. */
export const MOOD_ADOPT_FROM = 0.35;
/** Mood intents drive movement only above this intensity. */
export const MOOD_DRIVE_AT = 0.3;
/** Mourners hold their grief at this floor for the whole circle. */
export const MOOD_MOURN_FLOOR = 0.8;

/** Event causes. Amounts are intensity deltas. */
export const MOOD_FEED_SELF = 0.6;
export const MOOD_FEED_NEIGHBOUR = 0.2;
export const MOOD_FEED_JUVENILE_BONUS = 0.2;
export const MOOD_CLEAN = 0.2;
export const MOOD_PET = 0.5;
export const MOOD_PLAY = 0.5;
export const MOOD_NAME = 0.7;
export const MOOD_STAGE_SHIFT = 0.6;
export const MOOD_WITNESS_DEATH = 0.9;
/** Neighbours this close to a fed creature share the mood. */
export const FEED_MOOD_RANGE = 2;

/**
 * Raises a mood. The same mood stacks; a different mood replaces the old one
 * (the newer event dominates) and keeps at least its own amount.
 */
export function raiseMood(
  social: SocialState,
  ids: readonly CreatureId[],
  mood: Mood,
  amount: number,
): SocialState {
  const moods: Record<CreatureId, MoodState> = { ...social.moods };
  let changed = false;
  for (const id of ids) {
    const current = moods[id];
    const next: MoodState =
      current === undefined || current.mood === mood
        ? { mood, intensity: clamp01((current?.intensity ?? 0) + amount) }
        : { mood, intensity: clamp01(Math.max(amount, current.intensity * 0.5)) };
    if (
      current !== undefined &&
      current.mood === next.mood &&
      current.intensity === next.intensity
    ) {
      continue;
    }
    moods[id] = next;
    changed = true;
  }
  return changed ? { ...social, moods } : social;
}

export function clearMood(social: SocialState, creatureId: CreatureId): SocialState {
  if (social.moods[creatureId] === undefined) {
    return social;
  }
  const moods = { ...social.moods };
  delete moods[creatureId];
  return { ...social, moods };
}

/** Faction of one creature's slice, or null when unaffiliated. */
export function factionOfSlice(slice: MemorySlice | undefined): Faction {
  return factionOf(beliefAboutPlayer(slice));
}

function livingIds(world: Pick<WorldState, "creatures">): readonly CreatureId[] {
  return Object.values(world.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort();
}

function chebyshevOf(a: TilePos, b: TilePos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * One tick of mood weather: decay everywhere, then contagion across the same
 * channel the whispers use (`WHISPER_RANGE` proximity). Mourners are pinned to
 * their grief for the length of the circle, and cross-faction neighbours
 * damp each other instead of syncing.
 */
export function moodTickPass(world: WorldState, social: SocialState): SocialState {
  const mourningNow = social.mourning.filter((circle) => world.tick < circle.startedTick + circle.duration);
  const pinned = new Map<CreatureId, MourningCircle>();
  for (const circle of mourningNow) {
    for (const id of circle.participants) {
      pinned.set(id, circle);
    }
  }

  const moods: Record<CreatureId, MoodState> = { ...social.moods };
  for (const id of livingIds(world)) {
    if (pinned.has(id)) {
      const current = moods[id];
      if (current === undefined || current.mood !== "sad" || current.intensity < MOOD_MOURN_FLOOR) {
        moods[id] = { mood: "sad", intensity: MOOD_MOURN_FLOOR };
      }
      continue;
    }
    const current = moods[id];
    if (current === undefined) {
      continue;
    }
    const intensity = current.intensity - MOOD_DECAY_PER_TICK;
    if (intensity <= 0) {
      delete moods[id];
    } else {
      moods[id] = { mood: current.mood, intensity };
    }
  }

  let socialNext: SocialState = { ...social, moods, mourning: mourningNow };

  // Contagion over sorted pairs, applied in order: deterministic.
  const ids = livingIds(world);
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const aId = ids[i];
      const bId = ids[j];
      if (aId === undefined || bId === undefined) {
        continue;
      }
      const a = world.creatures[aId];
      const b = world.creatures[bId];
      if (a === undefined || b === undefined) {
        continue;
      }
      if (chebyshevOf(a.position, b.position) > WHISPER_RANGE) {
        continue;
      }
      const cross = crossFaction(world.memories?.[aId], world.memories?.[bId]);
      if (cross && chebyshevOf(a.position, b.position) <= 1) {
        // Two factions face to face: a staring contest, not a mood exchange.
        continue;
      }
      const rate = cross ? MOOD_CONTAGION_RATE * FACTION_CONTAGION_DAMP : MOOD_CONTAGION_RATE;
      socialNext = contaminate(socialNext, aId, bId, rate);
    }
  }
  return socialNext;
}

function contaminate(social: SocialState, aId: CreatureId, bId: CreatureId, rate: number): SocialState {
  const a = social.moods[aId];
  const b = social.moods[bId];
  if (a === undefined && b === undefined) {
    return social;
  }
  if (a !== undefined && b !== undefined) {
    if (a.mood === b.mood) {
      const strong = a.intensity >= b.intensity ? a : b;
      const weak = a.intensity >= b.intensity ? b : a;
      const weakId = a.intensity >= b.intensity ? bId : aId;
      const lifted = Math.min(strong.intensity, weak.intensity + rate * (strong.intensity - weak.intensity));
      return raiseMood(social, [weakId], weak.mood, lifted - weak.intensity);
    }
    // Opposing moods grind each other; the weaker may flip to the stronger.
    const [weak, strong] = a.intensity <= b.intensity ? [a, b] : [b, a];
    const weakId = a.intensity <= b.intensity ? aId : bId;
    const groundDown = weak.intensity - rate;
    if (groundDown <= 0 && strong.intensity >= MOOD_ADOPT_FROM) {
      return raiseMood(social, [weakId], strong.mood, rate);
    }
    return groundDown === weak.intensity ? social : raiseMood(social, [weakId], weak.mood, groundDown - weak.intensity);
  }
  const source = a !== undefined ? a : b;
  const targetId = a === undefined ? aId : bId;
  if (source === undefined || source.intensity < MOOD_ADOPT_FROM) {
    return social;
  }
  // A catching mood lands at the transfer rate: the same bleed governs
  // adoption, so a cross-faction damp genuinely weakens the catch.
  return raiseMood(social, [targetId], source.mood, rate);
}

// ---------------------------------------------------------------------------
// Factions: clusters over the belief about the keeper
// ---------------------------------------------------------------------------

export type Faction = "tender" | "wrong" | null;

/** Mean valence of memories about the player; 0 when it holds none. */
export function beliefAboutPlayer(slice: MemorySlice | undefined): number {
  if (slice === undefined) {
    return 0;
  }
  const about = slice.working.filter((entry) => mentionsPlayer(entry.fact));
  if (about.length === 0) {
    return 0;
  }
  return about.reduce((sum, entry) => sum + entry.valence, 0) / about.length;
}

function mentionsPlayer(fact: string): boolean {
  return /\bplayer\b|\bkeeper\b/i.test(fact);
}

/** Belief valence above this is the tender camp, below the negative is wrong. */
export const FACTION_TENDER_THRESHOLD = 0.15;

export function factionOf(belief: number): Faction | null {
  if (belief >= FACTION_TENDER_THRESHOLD) {
    return "tender";
  }
  if (belief <= -FACTION_TENDER_THRESHOLD) {
    return "wrong";
  }
  return null;
}

/** F-owned, B may re-home. Cross-faction moods bleed this much weaker. */
export const FACTION_CONTAGION_DAMP = 0.4;

/** Two creatures are cross-faction when both hold a belief and they differ. */
export function crossFaction(a: MemorySlice | undefined, b: MemorySlice | undefined): boolean {
  const fa = factionOf(beliefAboutPlayer(a));
  const fb = factionOf(beliefAboutPlayer(b));
  return fa !== null && fb !== null && fa !== fb;
}

/**
 * Accent parameter for the render side (stream C consumes this): a faction
 * recolours the creature's accent slot; the unaffiliated keep their sex accent.
 */
export function factionAccent(faction: Faction, sexAccent: string): string {
  if (faction === "tender") {
    return ACCENT_FACTION_TENDER;
  }
  if (faction === "wrong") {
    return ACCENT_FACTION_WRONG;
  }
  return sexAccent;
}

// ---------------------------------------------------------------------------
// Division of labour: emergent from traits and memories, never dispatched
// ---------------------------------------------------------------------------

export type SocialRole = "watcher" | "echoer" | "paranoid";

const ROLE_WATCHFULNESS = 0.65;
const ROLE_LOYALTY = 0.65;
const ROLE_CLINGING = 0.65;
const ROLE_DECEIT = 0.6;

/**
 * The role a creature grows into, read straight off its genome traits (and the
 * director's existing trait marks, which are data like any other). No
 * assignment, no UI: the behaviour is all there is.
 */
export function roleFor(creature: CreatureState): SocialRole | null {
  if (creature.trait === "watcher") {
    return "watcher";
  }
  if (creature.trait === "herald" || creature.trait === "mimic") {
    return "echoer";
  }
  const traits = creature.genome?.traits;
  if (traits === undefined) {
    return null;
  }
  if (traits.watchfulness >= ROLE_WATCHFULNESS) {
    return "watcher";
  }
  if (traits.deceit >= ROLE_DECEIT) {
    return "paranoid";
  }
  if (traits.loyalty >= ROLE_LOYALTY || traits.clinging >= ROLE_CLINGING) {
    return "echoer";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Juvenile care: imitation of the keeper, escort by the adults
// ---------------------------------------------------------------------------

/** F-owned, B may re-home. A creature is a child for this many ticks. */
export const JUVENILE_TICKS = 240;

export function isJuvenile(creature: CreatureState, tick: number): boolean {
  return tick - creature.hatchedAtTick < JUVENILE_TICKS;
}

/**
 * How a juvenile models the keeper, from its own observation window (the same
 * sliding window the learning side converges on). Gentle hands raise gentle
 * keepers-in-training; rapid clicks raise hurried ones.
 */
export interface CareModel {
  /** 0..1. High means the keeper model is patient and caring. */
  readonly gentleness: number;
  /** Share of care verbs (feed/clean/pet) in the window. */
  readonly careShare: number;
  /** Mean hesitation ticks across the window. */
  readonly meanHesitation: number;
}

const CARE_VERBS = new Set(["feed", "clean", "pet"]);
const CARE_HESITATION_BASE = 2;
const CARE_HESITATION_WEIGHT = 0.15;
const CARE_SHARE_WEIGHT = 0.4;

export function careModelFor(learning: LearningState | undefined): CareModel {
  const observations = learning?.observations ?? [];
  if (observations.length === 0) {
    return { gentleness: 0.5, careShare: 0, meanHesitation: 0 };
  }
  const careCount = observations.filter((entry) => CARE_VERBS.has(entry.verb)).length;
  const careShare = careCount / observations.length;
  const meanHesitation =
    observations.reduce((sum, entry) => sum + entry.hesitationTicks, 0) / observations.length;
  const gentleness = clamp01(
    0.5 + (meanHesitation - CARE_HESITATION_BASE) * CARE_HESITATION_WEIGHT + careShare * CARE_SHARE_WEIGHT,
  );
  return { gentleness, careShare, meanHesitation };
}

/** An adult escorts hungry juveniles only when its keeper model is gentle enough. */
export const GENTLE_ESCORT_MIN = 0.35;
/** Adults look this far for a hungry juvenile to shepherd. */
export const ESCORT_SEEK_RANGE = 6;
/** Juveniles follow an adult within this range. */
export const FOLLOW_RANGE = 8;
/** Echoers close in on peers beyond this distance, then sit in whisper range. */
export const ECHO_RANGE = 2;
/** Paranoid creatures flee peers this close. */
export const PARANOID_FLEE_RANGE = 2;
/** Mirrors engine HUNGRY_AT (frozen); a test pins the two. */
export const SOCIAL_HUNGRY_AT = 30;

// ---------------------------------------------------------------------------
// Mourning: the circle is a function of memory
// ---------------------------------------------------------------------------

/** F-owned, B may re-home. A circle never lasts shorter than this. */
export const MOURN_MIN_TICKS = 4;
export const MOURN_MAX_TICKS = 240;

/**
 * How many memories a creature holds about the deceased — the unit the
 * mourning duration is counted in (§10.5-2: 被记得越多,哀悼越久).
 */
export function memoriesAbout(slice: MemorySlice | undefined, corpseId: CreatureId): number {
  if (slice === undefined) {
    return 0;
  }
  const inWorking = slice.working.filter(
    (entry) => entry.fact.includes(corpseId) || entry.source === corpseId,
  ).length;
  const inConsolidated = slice.consolidated.filter(
    (entry) => entry.content.includes(corpseId) || entry.derivedFrom.includes(corpseId),
  ).length;
  return inWorking + inConsolidated;
}

/**
 * Ring slots around a corpse: radius 1 first, then radius 2, each radius swept
 * in a fixed (dy, dx) order, clamped to the diamond. Deterministic per index.
 */
const RING_OFFSETS: readonly TilePos[] = (() => {
  const offsets: TilePos[] = [];
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
          offsets.push({ x: dx, y: dy });
        }
      }
    }
  }
  return offsets;
})();

export function ringSlotFor(at: TilePos, index: number): TilePos {
  const offset = RING_OFFSETS[index % RING_OFFSETS.length] ?? { x: 1, y: 0 };
  return {
    x: clampToGrid(at.x + offset.x),
    y: clampToGrid(at.y + offset.y),
  };
}

export function mourningOf(social: SocialState, corpseId: CreatureId): MourningCircle | undefined {
  return social.mourning.find((circle) => circle.corpseId === corpseId);
}

export function activeMourningFor(
  social: SocialState,
  creatureId: CreatureId,
  tick: number,
): MourningCircle | undefined {
  return social.mourning.find(
    (circle) =>
      circle.participants.includes(creatureId) && tick < circle.startedTick + circle.duration,
  );
}

/**
 * The death's social fallout: a circle forms around the corpse from the
 * creatures that saw it (within whisper range) or carry a memory of it, the
 * corpse tile takes its permanent stain, and the witnesses' mood turns sad.
 * Creatures that never knew the deceased do not come (§10.5-2).
 */
export function startMourning(
  world: WorldState,
  social: SocialState,
  corpseId: CreatureId,
  corpseAt: TilePos,
  tick: number,
): SocialState {
  if (mourningOf(social, corpseId) !== undefined) {
    return social;
  }
  const memoryIds = Object.keys(world.memories ?? {})
    .filter((id) => memoriesAbout(world.memories?.[id], corpseId) > 0)
    .sort();
  const nearIds = Object.values(world.creatures)
    .filter(
      (creature) =>
        creature.id !== corpseId &&
        creature.behavior !== "dead" &&
        chebyshevOf(creature.position, corpseAt) <= WHISPER_RANGE,
    )
    .map((creature) => creature.id)
    .sort();
  const participants = [...new Set([...nearIds, ...memoryIds])].sort();
  if (participants.length === 0) {
    return social;
  }
  const memoryCount = participants.reduce(
    (sum, id) => sum + memoriesAbout(world.memories?.[id], corpseId),
    0,
  );
  const duration = Math.min(
    MOURN_MAX_TICKS,
    Math.max(MOURN_MIN_TICKS, memoryCount),
  );
  let next = raiseMood(
    social,
    participants,
    "sad",
    MOOD_WITNESS_DEATH,
  );
  next = {
    ...next,
    mourning: [
      ...next.mourning,
      { corpseId, at: corpseAt, participants, startedTick: tick, duration },
    ],
  };
  return addStain(next, corpseAt, "mourning", MOURNING_STAIN_INTENSITY, tick);
}

// ---------------------------------------------------------------------------
// Terrain traces: the world remembers what happened on it
// ---------------------------------------------------------------------------

/** Rank decides which trace a tile keeps when two kinds collide. */
const STAIN_RANK: Readonly<Record<StainKind, number>> = { wear: 0, feed: 1, hoard: 2, mourning: 3 };

/** The corpse tile's stain never fades: 清理只淡不清, mourning not at all. */
export const MOURNING_STAIN_INTENSITY = 1;
/** F-owned, B may re-home. Trampling accumulates per tick of presence. */
export const WEAR_PER_TICK = 0.01;
export const WEAR_MAX = 1;
export const FEED_STAIN_AMOUNT = 0.4;
/** F-owned, B may re-home. A lurking paranoid deepens its hoard per tick. */
export const HOARD_PER_TICK = 0.1;
export const STAIN_MAX = 1;
/** Cleaning fades a stain to this fraction… */
export const CLEAN_FADE = 0.7;
/** …but never below this floor: the trace survives the sponge. */
export const STAIN_FLOOR = 0.15;
/** Tiles this close to the diamond edge count as corners for hoarding. */
export const EDGE_DISTANCE = 5.5;
const DIAMOND_CENTER = (SOCIAL_GRID_MIN + SOCIAL_GRID_MAX) / 2;

export function addStain(
  social: SocialState,
  at: TilePos,
  kind: StainKind,
  amount: number,
  tick: number,
): SocialState {
  const key = stainKey(at);
  const existing = social.stains[key];
  if (existing !== undefined && STAIN_RANK[existing.kind] >= STAIN_RANK[kind]) {
    // A stronger trace keeps its kind; the new event only refreshes it.
    if (existing.kind === kind) {
      const intensity = Math.min(STAIN_MAX, existing.intensity + amount);
      if (intensity === existing.intensity && existing.lastTouchTick === tick) {
        return social;
      }
      return {
        ...social,
        stains: {
          ...social.stains,
          [key]: { ...existing, intensity, lastTouchTick: tick },
        },
      };
    }
    return social;
  }
  const base = existing ?? { kind, intensity: 0, createdAtTick: tick, lastTouchTick: tick };
  return {
    ...social,
    stains: {
      ...social.stains,
      [key]: {
        kind,
        intensity: Math.min(STAIN_MAX, base.intensity + amount),
        createdAtTick: base.createdAtTick,
        lastTouchTick: tick,
      },
    },
  };
}

/** Cleaning fades every stain on a tile toward its floor; nothing is removed. */
export function fadeStainsAt(social: SocialState, at: TilePos, tick: number): SocialState {
  const key = stainKey(at);
  const existing = social.stains[key];
  if (existing === undefined) {
    return social;
  }
  const floor = existing.kind === "mourning" ? MOURNING_STAIN_INTENSITY : STAIN_FLOOR;
  const intensity = Math.max(floor, existing.intensity * CLEAN_FADE);
  if (intensity === existing.intensity) {
    return social;
  }
  return {
    ...social,
    stains: {
      ...social.stains,
      [key]: { ...existing, intensity, lastTouchTick: tick },
    },
  };
}

export function stainAt(social: SocialState, at: TilePos): TileStain | undefined {
  return social.stains[stainKey(at)];
}

/** Presence wears a tile; mourners standing still wear it too. */
export function wearPass(
  world: WorldState,
  social: SocialState,
  tick: number,
): SocialState {
  let next = social;
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior === "dead") {
      continue;
    }
    next = addStain(next, creature.position, "wear", WEAR_PER_TICK, tick);
  }
  return next;
}

function isEdgeTile(at: TilePos): boolean {
  return (
    Math.max(Math.abs(at.x - DIAMOND_CENTER), Math.abs(at.y - DIAMOND_CENTER)) >= EDGE_DISTANCE
  );
}

/**
 * A paranoid creature that lurks at the diamond edge digs its hoard: the tile
 * deepens while it stays. Emergent from the deceit trait; no dispatch.
 */
export function hoardPass(
  world: WorldState,
  social: SocialState,
  tick: number,
): SocialState {
  let next = social;
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior !== "idle") {
      continue;
    }
    if (roleFor(creature) !== "paranoid") {
      continue;
    }
    if (!isEdgeTile(creature.position)) {
      continue;
    }
    next = addStain(next, creature.position, "hoard", HOARD_PER_TICK, tick);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Movement intent: mood and role drive the feet
// ---------------------------------------------------------------------------

export type MovementIntent = { readonly kind: "hold" } | { readonly kind: "toward"; readonly target: TilePos };

function nearestPeer(
  world: WorldState,
  creature: CreatureState,
  filter?: (other: CreatureState) => boolean,
): CreatureState | undefined {
  let best: CreatureState | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of Object.values(world.creatures)) {
    if (other.id === creature.id || other.behavior === "dead") {
      continue;
    }
    if (filter !== undefined && !filter(other)) {
      continue;
    }
    const distance = chebyshevOf(creature.position, other.position);
    if (distance < bestDistance || (distance === bestDistance && best !== undefined && other.id < best.id)) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

function awayFrom(from: TilePos, threat: TilePos): TilePos {
  return {
    x: from.x + Math.sign(from.x - threat.x),
    y: from.y + Math.sign(from.y - threat.y),
  };
}

function cornerFor(at: TilePos): TilePos {
  return {
    x: at.x <= DIAMOND_CENTER ? SOCIAL_GRID_MIN : SOCIAL_GRID_MAX,
    y: at.y <= DIAMOND_CENTER ? SOCIAL_GRID_MIN : SOCIAL_GRID_MAX,
  };
}

/**
 * Why the creature moves this tick. The chain is fixed: mourning silence first,
 * then the faction stare, then roles, then care, then mood weather. `null`
 * means "no opinion" and the engine's seeded wander takes over.
 */
export function movementIntent(
  world: WorldState,
  social: SocialState,
  creature: CreatureState,
  tick: number,
): MovementIntent | null {
  if (creature.behavior === "dead" || creature.behavior === "sleeping") {
    return null;
  }
  if (creature.courtshipTicks > 0 || creature.behavior === "mating") {
    return null;
  }

  // 1. Mourning silence: hold the assigned ring slot.
  const circle = activeMourningFor(social, creature.id, tick);
  if (circle !== undefined) {
    const index = circle.participants.indexOf(creature.id);
    const slot = ringSlotFor(circle.at, index < 0 ? 0 : index);
    if (creature.position.x === slot.x && creature.position.y === slot.y) {
      return { kind: "hold" };
    }
    return { kind: "toward", target: slot };
  }

  // 2. Cross-faction neighbours face off: nobody moves.
  const ownSlice = world.memories?.[creature.id];
  if (ownSlice !== undefined) {
    for (const other of Object.values(world.creatures)) {
      if (
        other.id !== creature.id &&
        other.behavior !== "dead" &&
        chebyshevOf(creature.position, other.position) <= 1 &&
        crossFaction(ownSlice, world.memories?.[other.id])
      ) {
        return { kind: "hold" };
      }
    }
  }

  const role = roleFor(creature);

  // 3. Watchers stand guard: they watch, the whispers carry what they see.
  if (role === "watcher") {
    return { kind: "hold" };
  }

  // 4. Paranoid creatures flee closeness and hoard at the edge.
  if (role === "paranoid") {
    const threat = nearestPeer(world, creature);
    if (threat !== undefined && chebyshevOf(creature.position, threat.position) <= PARANOID_FLEE_RANGE) {
      return { kind: "toward", target: awayFrom(creature.position, threat.position) };
    }
    if (isEdgeTile(creature.position)) {
      return { kind: "hold" };
    }
    return { kind: "toward", target: cornerFor(creature.position) };
  }

  // 5. Adults shepherd hungry juveniles — their own children first.
  if (!isJuvenile(creature, tick)) {
    const juvenile = nearestJuvenileToShepherd(world, creature, tick);
    if (juvenile !== undefined) {
      return { kind: "toward", target: juvenile.position };
    }
  }

  // 6. Juveniles imitate: converge on the hand's usual tile, else shadow an adult.
  if (isJuvenile(creature, tick)) {
    if (creature.learning?.converged === true) {
      const target = predictedTile(creature.learning);
      if (target !== null) {
        return { kind: "toward", target };
      }
    }
    const adult = nearestPeer(world, creature, (other) => !isJuvenile(other, tick));
    if (adult !== undefined && chebyshevOf(creature.position, adult.position) <= FOLLOW_RANGE) {
      return { kind: "toward", target: adult.position };
    }
    return null;
  }

  // 7. Echoers close in on peers, then sit inside whisper range and talk.
  if (role === "echoer") {
    const peer = nearestPeer(world, creature);
    if (peer !== undefined && chebyshevOf(creature.position, peer.position) > ECHO_RANGE) {
      return { kind: "toward", target: peer.position };
    }
    return null;
  }

  // 8. Mood weather, for idle creatures only: hunger keeps its own restlessness.
  if (creature.behavior !== "idle") {
    return null;
  }
  const mood = social.moods[creature.id];
  if (mood === undefined || mood.intensity < MOOD_DRIVE_AT) {
    return null;
  }
  if (mood.mood === "loving") {
    const peer = nearestPeer(world, creature);
    if (peer !== undefined && chebyshevOf(creature.position, peer.position) <= ESCORT_SEEK_RANGE) {
      return { kind: "toward", target: peer.position };
    }
    return null;
  }
  if (mood.mood === "wrong") {
    const tower = world.structures.find((structure) => structure.kind === "black_tower");
    if (tower !== undefined) {
      return { kind: "toward", target: tower.at };
    }
    return { kind: "hold" };
  }
  if (mood.mood === "sad") {
    return { kind: "hold" };
  }
  return null;
}

function nearestJuvenileToShepherd(
  world: WorldState,
  adult: CreatureState,
  tick: number,
): CreatureState | undefined {
  const care = careModelFor(adult.learning);
  if (care.gentleness < GENTLE_ESCORT_MIN) {
    return undefined;
  }
  if (adult.behavior === "hungry") {
    // A starving adult cannot spare attention for anyone else's stomach.
    return undefined;
  }
  let best: CreatureState | undefined;
  for (const other of Object.values(world.creatures)) {
    if (
      other.id === adult.id ||
      other.behavior === "dead" ||
      !isJuvenile(other, tick) ||
      other.stats.hunger >= SOCIAL_HUNGRY_AT
    ) {
      continue;
    }
    if (chebyshevOf(adult.position, other.position) > ESCORT_SEEK_RANGE) {
      continue;
    }
    const ownChild =
      adult.parentLinks !== undefined &&
      (adult.parentLinks.parentA === other.id || adult.parentLinks.parentB === other.id);
    const bestOwnChild =
      best !== undefined &&
      adult.parentLinks !== undefined &&
      (adult.parentLinks.parentA === best.id || adult.parentLinks.parentB === best.id);
    if (best === undefined || (ownChild && !bestOwnChild) || (ownChild === bestOwnChild && other.stats.hunger < best.stats.hunger)) {
      best = other;
    }
  }
  return best;
}
