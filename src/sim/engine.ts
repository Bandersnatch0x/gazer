import type {
  CreatureBehavior,
  CreatureId,
  CreatureState,
  CreatureStats,
  Stage,
  TilePos,
  WorldState,
} from "./types";
import { stageForGv } from "./types";
import { createRng, hashString } from "./rng";
import type { MemoryEntry, MemorySlice } from "./memory";
import { emptySlice, sampleInherited, rememberEntry } from "./memory";
import { hybridize } from "./breed";
import {
  emptyLearning,
  isConverged,
  recordObservation,
  writeBackPrediction,
  type PlayerVerb,
} from "./genome";
import {
  accentForSex,
  addStain,
  clearMood,
  ensureSocial,
  fadeStainsAt,
  FEED_MOOD_RANGE,
  FEED_STAIN_AMOUNT,
  hoardPass,
  isJuvenile,
  MOOD_CLEAN,
  MOOD_FEED_JUVENILE_BONUS,
  MOOD_FEED_NEIGHBOUR,
  MOOD_FEED_SELF,
  MOOD_NAME,
  MOOD_PET,
  MOOD_PLAY,
  MOOD_STAGE_SHIFT,
  movementIntent,
  moodTickPass,
  pairSexCompatible,
  raiseMood,
  registerSex,
  sexFor,
  startMourning,
  wearPass,
  type Sex,
  type SocialState,
} from "./social";
import { seasonParamsForStage } from "./rhythm";

export const TICK_MS = 1000;
export const HUNGER_PER_TICK = 0.35;
export const HYGIENE_PER_TICK = 0.2;
export const ENERGY_PER_TICK = 0.15;
export const HAPPINESS_DECAY_PER_TICK = 0.1;
export const STARVE_AT = 0;
export const HUNGRY_AT = 30;

/** Creatures stay inside the visible diamond, not at its edge. */
export const GRID_MIN = 1;
export const GRID_MAX = 14;

// ---------------------------------------------------------------------------
// 黑塔正典位与禁区(票 0043,ART-CORE-03 §2/§6.4,裁决 0013 项 5)。
// sim/game 渲染三面统一 {0,7}(西缘南北中线);{0,7} 本就在 GRID_MIN 之外,
// footprint 语义本就禁入——禁区判定一律按「距 footprint 的 Chebyshev 距离」。
// ---------------------------------------------------------------------------

/** sim/game 面的塔正典位(渲染面 `render/tower.ts` 的 TOWER_CANON_TILE 同值)。 */
export const TOWER_CANON_TILE: TilePos = { x: 0, y: 7 };
/** footprint + 1 缓冲区:普通个体寻路禁区(§6.4)。 */
export const TOWER_ZONE_RADIUS = 1;
/** §6.4 GV90 例外的注视半径(塔 2 tile 内 idle 瞳孔强制 CENTER)。 */
export const TOWER_PIN_RADIUS = 2;
/** T0 生成门(§3.2):GV≥50 首次越线生成;GV<50 无塔。 */
export const TOWER_SPAWN_GV = 50;

/** 塔的入档坐标(无塔为 null)。 */
export function towerAt(state: WorldState): TilePos | null {
  return state.structures.find((structure) => structure.kind === "black_tower")?.at ?? null;
}

/** Chebyshev 距 footprint ≤ r。 */
export function withinTowerZone(tile: TilePos, tower: TilePos, radius: number): boolean {
  return Math.max(Math.abs(tile.x - tower.x), Math.abs(tile.y - tower.y)) <= radius;
}

/**
 * 一格对个体是否可入。普通个体拒入 footprint+1 缓冲区;返祖体豁免缓冲区、
 * 永不入 footprint(§6.4)。无塔时全图可入。Pure.
 */
export function tileAllowedByTower(tile: TilePos, tower: TilePos | null, atavistic: boolean): boolean {
  if (tower === null) {
    return true;
  }
  if (tile.x === tower.x && tile.y === tower.y) {
    return false;
  }
  return atavistic || !withinTowerZone(tile, tower, TOWER_ZONE_RADIUS);
}

/**
 * T0 生成门(§3.2,票 0043):GV 首次越线(GV≥50)且塔未在位才生成——
 * 替代旧的「任何首次阶段切换」;GV<50 无塔。Pure.
 */
export function towerSpawnDue(gv: number, structures: readonly import("./types").Structure[]): boolean {
  const value = Number.isFinite(gv) ? gv : 0;
  return value >= TOWER_SPAWN_GV && !structures.some((structure) => structure.kind === "black_tower");
}

/**
 * §6.4 GV90 例外 sim 侧信号:塔 2 tile 内 idle 的个体瞳孔强制 CENTER——
 * 它们不看塔,它们看你有没有在看你。渲染面接线归票 0042;此处只供判定。
 */
export function pinnedCenterAt(
  tile: TilePos,
  tower: TilePos | null,
  gv: number,
  behavior: CreatureBehavior,
): boolean {
  const value = Number.isFinite(gv) ? gv : 0;
  return value >= 90 && behavior === "idle" && tower !== null && withinTowerZone(tile, tower, TOWER_PIN_RADIUS);
}

export type SimEvent =
  | { readonly kind: "tick" }
  | { readonly kind: "feed"; readonly creatureId: CreatureId }
  | { readonly kind: "clean"; readonly creatureId: CreatureId }
  | { readonly kind: "play"; readonly creatureId: CreatureId }
  | { readonly kind: "pet"; readonly creatureId: CreatureId }
  | { readonly kind: "name"; readonly creatureId: CreatureId; readonly name: string }
  | { readonly kind: "move"; readonly creatureId: CreatureId; readonly at: TilePos }
  | { readonly kind: "court"; readonly creatureId: CreatureId }
  | { readonly kind: "layEgg"; readonly parentA: CreatureId; readonly parentB: CreatureId; readonly forced: boolean }
  | {
      readonly kind: "hatchFromEgg";
      readonly eggId: string;
      readonly creatureId: CreatureId;
      readonly at: TilePos;
      readonly species: string;
      readonly choice: import("./types").HatchChoice;
    }
  | { readonly kind: "hatch"; readonly creatureId: CreatureId; readonly at: TilePos; readonly species: string }
  | { readonly kind: "gv"; readonly delta: number }
  | { readonly kind: "apply_effect"; readonly effect: import("./effects").Effect }
  /**
   * The keeper acted. Every living creature keeps a sliding window of these:
   * converged ones start moving before the hand lands. hesitationTicks is the
   * sim-tick mirror of the A-stream telemetry's hesitationMs.
   */
  | {
      readonly kind: "observe";
      readonly verb: PlayerVerb;
      readonly targetId: CreatureId | null;
      readonly targetTile: import("./types").TilePos | null;
      readonly hesitationTicks: number;
    }
  /** The game layer feeds a witnessed fact into a creature's memory slice. */
  | { readonly kind: "remember"; readonly creatureId: CreatureId; readonly entry: MemoryEntry };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function behaviorFor(stats: CreatureStats): CreatureBehavior {
  if (stats.hunger <= STARVE_AT) {
    return "dead";
  }
  if (stats.hunger < HUNGRY_AT) {
    return "hungry";
  }
  if (stats.hygiene < HUNGRY_AT) {
    return "dirty";
  }
  if (stats.energy < 15) {
    return "sleeping";
  }
  return "idle";
}

function stepCreature(
  creature: CreatureState,
  world: WorldState,
  social: SocialState,
  seed: number,
  tick: number,
): CreatureState {
  if (creature.behavior === "dead") {
    return creature;
  }
  const eating = creature.behavior === "eating";
  // Seasonal dial (stream B's parameter interface, ticket 0002): hunger burns
  // faster in the lean seasons. Spring baseline is 1.0, so the cozy act plays
  // at book value.
  const hungerBurn = HUNGER_PER_TICK * seasonParamsForStage(world.stage).hungerMultiplier;
  const stats: CreatureStats = {
    hunger: clamp(creature.stats.hunger - (eating ? -40 : hungerBurn), 0, 100),
    hygiene: clamp(creature.stats.hygiene - HYGIENE_PER_TICK, 0, 100),
    energy: clamp(creature.stats.energy - ENERGY_PER_TICK, 0, 100),
    happiness: clamp(creature.stats.happiness - HAPPINESS_DECAY_PER_TICK, 0, 100),
  };
  return {
    ...creature,
    stats,
    behavior: behaviorFor(stats),
    // 黑塔禁区(票 0043):wander 的新格拒入 footprint+1 缓冲区(返祖体
    // 豁免缓冲区);拒入即原地不动——确定性,且向外移动永不受阻。
    position: keepOutOfTowerZone(
      wander(world, social, creature, seed, tick),
      creature.position,
      world,
      creature,
    ),
    // Contentment is the whole of willingness. A neglected creature cannot be
    // talked into anything, which is what makes forced pairing a choice.
    willingness: clamp(40 + (stats.happiness - 50) * 0.8, 0, 100),
  };
}

/** wander 结果的禁区过滤:可入则落新格,拒入则原地。Pure. */
function keepOutOfTowerZone(
  target: TilePos,
  fallback: TilePos,
  world: WorldState,
  creature: CreatureState,
): TilePos {
  return tileAllowedByTower(target, towerAt(world), creature.atavistic === true)
    ? target
    : fallback;
}

/** A content creature is willing. Neglect is what withholds consent. */
export const WILLING_AT = 60;
export const COURTSHIP_TICKS = 8;

/** Both sides must clear the threshold, at the lower of the two. */
export function pairWillingness(a: CreatureState, b: CreatureState): number {
  return Math.min(a.willingness, b.willingness);
}

/** One tile closer, clamped to the diamond. Used by willing pairs only. */
function stepToward(from: TilePos, to: TilePos): TilePos {
  return {
    x: clamp(from.x + Math.sign(to.x - from.x), GRID_MIN, GRID_MAX),
    y: clamp(from.y + Math.sign(to.y - from.y), GRID_MIN, GRID_MAX),
  };
}

/**
 * Population ceiling. Retuned 4 → 3 (lead ruling 2026-11-12, on stream F's
 * birth-rate read): with the 3s tick the starvation line sits at ~11 minutes
 * and feeding is confirm-gated, so a seven-creature swarm outgrows the care
 * the player can actually give. Three eggs keep a swarm of four adults plus a
 * litter — enough for a mourning ring, two factions, and a juvenile under
 * escort — while every birth stays an event the player paid attention for.
 */
export const MAX_EGGS = 3;

/**
 * One tick of swarm courtship. A willing, adjacent pair courts; after
 * COURTSHIP_TICKS of courtship and on a tick boundary, they lay one egg.
 * An unwilling pair never starts, which is what makes forcing the player's act.
 */
export function courtshipStep(state: WorldState): WorldState {
  if (state.eggs.length >= MAX_EGGS) {
    return state;
  }
  const living = Object.values(state.creatures).filter(
    (creature) => creature.behavior !== "dead",
  );
  let next = state;
  for (let i = 0; i < living.length; i += 1) {
    for (let j = i + 1; j < living.length; j += 1) {
      const a = living[i];
      const b = living[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      if (pairWillingness(a, b) < WILLING_AT) {
        continue;
      }
      // The sex gate: two creatures whose sexes are both known must differ.
      // Unsexed creatures (legacy worlds, director spawns) pair as before.
      if (!pairSexCompatible(ensureSocial(next), a.id, b.id)) {
        continue;
      }
      const near =
        Math.abs(a.position.x - b.position.x) <= 1 &&
        Math.abs(a.position.y - b.position.y) <= 1;
      if (!near) {
        // Willing pairs drift together on their own. That is the courtship
        // beginning, and it is the reason the player can see it happening.
        // 黑塔禁区随行:漂移新格同受 footprint+1 过滤(票 0043)。
        const tower = towerAt(next);
        next = updateCreature(next, a.id, (creature) => ({
          ...creature,
          position: tileAllowedByTower(stepToward(creature.position, b.position), tower, creature.atavistic === true)
            ? stepToward(creature.position, b.position)
            : creature.position,
        }));
        next = updateCreature(next, b.id, (creature) => ({
          ...creature,
          position: tileAllowedByTower(stepToward(creature.position, a.position), tower, creature.atavistic === true)
            ? stepToward(creature.position, a.position)
            : creature.position,
        }));
        return next;
      }
      const courting = Math.min(a.courtshipTicks, b.courtshipTicks) + 1;
      next = updateCreature(next, a.id, (creature) => ({
        ...creature,
        behavior: "mating",
        courtshipTicks: courting,
      }));
      next = updateCreature(next, b.id, (creature) => ({
        ...creature,
        behavior: "mating",
        courtshipTicks: courting,
      }));
      if (courting >= COURTSHIP_TICKS) {
        next = step(next, { kind: "layEgg", parentA: a.id, parentB: b.id, forced: false });
        // The pair rests after laying, so one courtship yields one egg.
        next = updateCreature(next, a.id, (creature) => ({ ...creature, courtshipTicks: 0 }));
        next = updateCreature(next, b.id, (creature) => ({ ...creature, courtshipTicks: 0 }));
      }
      return next;
    }
  }
  return next;
}

/**
 * A deterministic walk with a social opinion. The movement chain lives in
 * `social.movementIntent` (mourning silence, faction stare, watcher guard,
 * paranoid flight, juvenile escort and imitation, mood weather); when it has
 * no opinion the seeded random walk takes over. Same creature id, same seed,
 * same tick always lands on the same tile, so replay stays exact. Sleeping and
 * dead creatures hold still; hungry ones drift, which is what makes the hunger
 * state legible from across the map.
 */
function wander(
  world: WorldState,
  social: SocialState,
  creature: CreatureState,
  seed: number,
  tick: number,
): TilePos {
  if (creature.behavior === "dead" || creature.behavior === "sleeping") {
    return creature.position;
  }
  // A courting creature holds its ground. The courtship step is what moves it.
  if (creature.courtshipTicks > 0 || creature.behavior === "mating") {
    return creature.position;
  }
  const intent = movementIntent(world, social, creature, tick);
  if (intent?.kind === "hold") {
    return creature.position;
  }
  if (intent?.kind === "toward") {
    return stepToward(creature.position, intent.target);
  }
  const rng = createRng(seed, `${creature.id}:${tick}`);
  const restless = creature.behavior === "hungry" || creature.behavior === "dirty";
  if (!restless && rng.next() < 0.35) {
    return creature.position;
  }
  const dx = rng.int(-1, 1);
  const dy = rng.int(-1, 1);
  return {
    x: clamp(creature.position.x + dx, GRID_MIN, GRID_MAX),
    y: clamp(creature.position.y + dy, GRID_MIN, GRID_MAX),
  };
}

function newCreature(
  id: CreatureId,
  at: TilePos,
  species: string,
  tick: number,
  sex: Sex | null = null,
): CreatureState {
  return {
    id,
    species,
    stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
    behavior: "idle",
    trait: null,
    position: at,
    // The fourth slot is C's accent (palette[3]); sex dimorphism lives there
    // as plain data — female keeps the cozy accent, male takes its complement.
    palette:
      sex === null
        ? ["#f2e6c9", "#7ef0a6", "#1a2b1f"]
        : ["#f2e6c9", "#7ef0a6", "#1a2b1f", accentForSex(sex)],
    mask: DEFAULT_MASK,
    hatchedAtTick: tick,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    learning: emptyLearning(),
  };
}

/**
 * The hatch choice is the player's one lever on a creature's temperament.
 * "self" is the one that costs patience and buys the true ending.
 */
export function applyHatchChoice(
  parentGenome: import("./genome").PromptGenome | undefined,
  choice: import("./types").HatchChoice,
  id: CreatureId,
): import("./genome").PromptGenome {
  const base = parentGenome ?? {
    id,
    generation: 1,
    lineage: ["seed_alpha"],
    base: "you are a small one-eyed creature being raised through a window",
    traits: { curiosity: 0.5, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
    drift: [],
    secrets: [],
    manualPool: [],
    temperatureBias: 0,
    distortionBias: 0.15,
  };
  const traits = { ...base.traits };
  const bump = (key: keyof typeof traits, delta: number): void => {
    traits[key] = clamp(traits[key] + delta, 0, 1);
  };
  if (choice === "warm") {
    bump("curiosity", 0.15);
    bump("watchfulness", -0.1);
  } else if (choice === "still") {
    bump("loyalty", 0.15);
    bump("curiosity", -0.1);
  } else if (choice === "self") {
    bump("curiosity", 0.05);
    bump("loyalty", 0.05);
    bump("clinging", 0.05);
    bump("watchfulness", 0.05);
  }
  return {
    ...base,
    id,
    generation: base.generation + 1,
    lineage: [...base.lineage, base.id],
    traits,
    // Drift and secrets survive the hatch choice: what the parents converged
    // on is the child's birthright, not something a tap resets.
    drift: [...base.drift],
    secrets: choice === "self" ? [...base.secrets, "it hatched without being asked"] : [...base.secrets],
  };
}

function updateCreature(
  state: WorldState,
  id: CreatureId,
  patch: (creature: CreatureState) => CreatureState,
): WorldState {
  const creature = state.creatures[id];
  if (creature === undefined) {
    return state;
  }
  return { ...state, creatures: { ...state.creatures, [id]: patch(creature) } };
}

/** A caring verb's mood fallout: no creature, no mood, no social record. */
function withMood(
  state: WorldState,
  creatureId: CreatureId,
  mood: import("./types").Mood,
  amount: number,
): WorldState {
  if (state.creatures[creatureId] === undefined) {
    return state;
  }
  return {
    ...state,
    social: raiseMood(ensureSocial(state), [creatureId], mood, amount),
  };
}

function applyEffect(state: WorldState, effect: import("./effects").Effect): WorldState {
  switch (effect.kind) {
    case "spawn_structure":
      return {
        ...state,
        structures: [...state.structures, { kind: effect.structure, at: effect.at, createdBy: "director" }],
      };
    case "relabel_ui":
      return { ...state, uiLabels: { ...state.uiLabels, [effect.target]: effect.text } };
    case "desaturate":
      return { ...state, paletteDecay: clamp(state.paletteDecay + effect.amount, 0, 1) };
    case "set_trait":
      return updateCreature(state, effect.creatureId, (creature) => ({ ...creature, trait: effect.trait }));
    case "rewrite_sprite":
      return updateCreature(state, effect.creatureId, (creature) => ({
        ...creature,
        palette: effect.palette,
        mask: effect.mask,
      }));
    case "gaze_at_player":
    case "mirror_click_rhythm":
    case "creature_wink":
    case "cursor_pull":
      return state;
    case "creature_speech":
    case "collective_speech":
    case "freeze_all":
    case "palette_shift":
    case "audio_drop_track":
    case "glyph_corrupt":
    case "ui_shake":
      return state;
    default:
      return state;
  }
}

/**
 * The deterministic core. Same state plus same event always yields the same
 * next state. No clock, no randomness, no I/O.
 */
export function step(state: WorldState, event: SimEvent): WorldState {
  switch (event.kind) {
    case "tick": {
      const creatures: Record<CreatureId, CreatureState> = {};
      const previousBehaviors: Record<CreatureId, CreatureBehavior> = {};
      const socialBefore = ensureSocial(state);
      for (const [id, creature] of Object.entries(state.creatures)) {
        previousBehaviors[id] = creature.behavior;
        creatures[id] = stepCreature(creature, state, socialBefore, state.seed, state.tick + 1);
      }
      let next: WorldState = { ...state, tick: state.tick + 1, creatures };
      // The engine owns death's social fallout: a mourning circle forms from
      // the creatures that saw the corpse or carry a memory of it, the corpse
      // tile takes its permanent stain, and grief pins the witnesses. The
      // wiring layer's ledger and witness memories are untouched (stream A).
      let social = ensureSocial(next);
      for (const [id, creature] of Object.entries(next.creatures)) {
        if (creature.behavior === "dead" && previousBehaviors[id] !== "dead") {
          social = clearMood(social, id);
          social = startMourning(next, social, id, creature.position, next.tick);
        }
      }
      // Terrain traces: presence wears the floor, the paranoid deepen their
      // hoards, mood weather decays and spreads, old circles expire.
      social = wearPass(next, social, next.tick);
      social = hoardPass(next, social, next.tick);
      social = moodTickPass(next, social);
      return { ...next, social };
    }
    case "feed": {
      const fed = state.creatures[event.creatureId];
      const next = updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "eating",
        stats: {
          ...creature.stats,
          // Seasonal dial (stream B's parameter interface): lean seasons feed
          // less. Spring baseline is 1.0.
          hunger: clamp(
            creature.stats.hunger + 45 * seasonParamsForStage(state.stage).feedRestoreMultiplier,
            0,
            100,
          ),
          happiness: clamp(creature.stats.happiness + 10, 0, 100),
        },
      }));
      if (fed === undefined) {
        return next;
      }
      // Watching a neighbour eat is worth something. It is also how a player
      // who only ever feeds one creature still ends up with a willing pair.
      const neighbours: Record<CreatureId, CreatureState> = { ...next.creatures };
      const neighbourIds: CreatureId[] = [];
      const juvenileIds: CreatureId[] = [];
      for (const [id, creature] of Object.entries(next.creatures)) {
        if (id === event.creatureId || creature.behavior === "dead") {
          continue;
        }
        const near =
          Math.abs(creature.position.x - fed.position.x) <= FEED_MOOD_RANGE &&
          Math.abs(creature.position.y - fed.position.y) <= FEED_MOOD_RANGE;
        if (near) {
          neighbours[id] = {
            ...creature,
            stats: {
              ...creature.stats,
              happiness: clamp(creature.stats.happiness + 4, 0, 100),
            },
          };
          neighbourIds.push(id);
          if (isJuvenile(creature, next.tick)) {
            juvenileIds.push(id);
          }
        }
      }
      let result: WorldState = { ...next, creatures: neighbours };
      // Mood causes: the fed one blooms, close ones share it, juveniles get
      // the second helping (adult feeding priority, §10.4-2).
      let social = ensureSocial(result);
      social = raiseMood(social, [event.creatureId], "loving", MOOD_FEED_SELF);
      social = raiseMood(social, neighbourIds, "curious", MOOD_FEED_NEIGHBOUR);
      // Juveniles already took the shared share above; this is the extra on top.
      social = raiseMood(social, juvenileIds, "curious", MOOD_FEED_JUVENILE_BONUS);
      // The feeding spot keeps a grease mark the sponge only fades.
      social = addStain(social, fed.position, "feed", FEED_STAIN_AMOUNT, result.tick);
      return { ...result, social };
    }
    case "clean": {
      const target = state.creatures[event.creatureId];
      const next = updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        stats: { ...creature.stats, hygiene: clamp(creature.stats.hygiene + 50, 0, 100) },
      }));
      if (target === undefined) {
        return next;
      }
      // Cleaning fades the traces on the tile — never removes them. The stain
      // survives the sponge at its floor; mourning does not fade at all.
      let social = ensureSocial(next);
      social = fadeStainsAt(social, target.position, next.tick);
      social = raiseMood(social, [event.creatureId], "curious", MOOD_CLEAN);
      return { ...next, social };
    }
    case "play":
      return withMood(
        updateCreature(state, event.creatureId, (creature) => ({
          ...creature,
          behavior: "playing",
          stats: {
            ...creature.stats,
            happiness: clamp(creature.stats.happiness + 15, 0, 100),
            energy: clamp(creature.stats.energy - 8, 0, 100),
          },
        })),
        event.creatureId,
        "loving",
        MOOD_PLAY,
      );
    case "pet":
      return withMood(
        updateCreature(state, event.creatureId, (creature) => ({
          ...creature,
          stats: { ...creature.stats, happiness: clamp(creature.stats.happiness + 8, 0, 100) },
        })),
        event.creatureId,
        "loving",
        MOOD_PET,
      );
    case "name":
      return withMood(
        updateCreature(state, event.creatureId, (creature) => ({
          ...creature,
          name: event.name.trim().slice(0, 24),
        })),
        event.creatureId,
        "loving",
        MOOD_NAME,
      );
    case "move": {
      const mover = state.creatures[event.creatureId];
      if (mover === undefined) {
        return state;
      }
      const next: TilePos = {
        x: clamp(event.at.x, GRID_MIN, GRID_MAX),
        y: clamp(event.at.y, GRID_MIN, GRID_MAX),
      };
      // 黑塔禁区(票 0043):显式移动同受 footprint+1 过滤——普通个体拒入
      // 缓冲区,返祖体豁免缓冲区、永不入 footprint。拒入 = 原地不动。
      if (!tileAllowedByTower(next, towerAt(state), mover.atavistic === true)) {
        return state;
      }
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        position: next,
      }));
    }
    case "court":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "mating",
        courtshipTicks: creature.courtshipTicks + 1,
      }));
    case "layEgg": {
      if (state.eggs.length >= MAX_EGGS) {
        return state;
      }
      const a = state.creatures[event.parentA];
      const b = state.creatures[event.parentB];
      const at: TilePos =
        a === undefined || b === undefined
          ? { x: 7, y: 7 }
          : {
              x: clamp(Math.round((a.position.x + b.position.x) / 2), GRID_MIN, GRID_MAX),
              y: clamp(Math.round((a.position.y + b.position.y) / 2), GRID_MIN, GRID_MAX),
            };
      const id = `egg_${state.tick}_${event.parentA}`;
      // The egg carries both souls: hatching hybridizes them instead of
      // falling back to seed_alpha. 繁殖=延续.
      const parentGenomes: import("./types").Egg["parentGenomes"] = {
        parentA: a?.genome,
        parentB: b?.genome,
      };
      // One memory from each parent rides in the egg, seeded by the egg id so
      // the same world always hands down the same memories.
      const layRng = createRng(state.seed, id);
      const memories = state.memories;
      const sliceA = memories?.[event.parentA];
      const sliceB = memories?.[event.parentB];
      const inheritedMemories: readonly MemoryEntry[] = [
        a !== undefined && sliceA !== undefined
          ? sampleInherited(event.parentA, sliceA, layRng)
          : null,
        b !== undefined && sliceB !== undefined
          ? sampleInherited(event.parentB, sliceB, layRng)
          : null,
      ].filter((entry): entry is MemoryEntry => entry !== null);
      const egg: import("./types").Egg = {
        id,
        parentA: event.parentA,
        parentB: event.parentB,
        laidAtTick: state.tick,
        forced: event.forced,
        at,
        parentGenomes,
        inheritedMemories,
      };
      return { ...state, eggs: [...state.eggs, egg] };
    }
    case "hatchFromEgg": {
      if (state.creatures[event.creatureId] !== undefined) {
        return state;
      }
      const egg = state.eggs.find((entry) => entry.id === event.eggId);
      if (egg === undefined) {
        return state;
      }
      // P3: the egg carried both parents' genomes. Their hybrid is the
      // base; the hatch choice is layered on top of it, never a fresh
      // seed_alpha. Breeding is continuation.
      const genomeA = egg.parentGenomes?.parentA;
      const genomeB = egg.parentGenomes?.parentB;
      const base =
        genomeA !== undefined && genomeB !== undefined
          ? hybridize(genomeA, genomeB, (state.seed ^ hashString(egg.id)) >>> 0)
          : (genomeA ?? genomeB);
      // Sex is frozen at hatch (same ruling as `hatch`); the genome side of
      // this case is stream E's and stays untouched.
      const sex = sexFor(event.creatureId, state.seed);
      const creature: CreatureState = {
        ...newCreature(event.creatureId, event.at, event.species, state.tick, sex),
        genome: {
          ...applyHatchChoice(base, event.choice, event.creatureId),
          inheritedMemories: egg.inheritedMemories ?? [],
        },
        parentLinks: { parentA: egg.parentA, parentB: egg.parentB },
      };
      return {
        ...state,
        social: registerSex(ensureSocial(state), event.creatureId, sex),
        eggs: state.eggs.filter((entry) => entry.id !== event.eggId),
        creatures: { ...state.creatures, [event.creatureId]: creature },
      };
    }
    case "hatch": {
      if (state.creatures[event.creatureId] !== undefined) {
        return state;
      }
      // Sex is decided once, at hatch, and frozen into the social record:
      // 判明即冻结. Nothing re-rolls it for this creature's whole life.
      const sex = sexFor(event.creatureId, state.seed);
      const creature: CreatureState = newCreature(
        event.creatureId,
        event.at,
        event.species,
        state.tick,
        sex,
      );
      return {
        ...state,
        social: registerSex(ensureSocial(state), event.creatureId, sex),
        creatures: { ...state.creatures, [event.creatureId]: creature },
      };
    }
    case "gv": {
      const gv = clamp(state.gv + event.delta, 0, 100);
      const stage: Stage = stageForGv(gv);
      const next: WorldState = { ...state, gv, stage };
      if (stage > state.stage) {
        // A stage shift unsettles every living creature: the world changed
        // under them and they can tell.
        const ids = Object.values(next.creatures)
          .filter((creature) => creature.behavior !== "dead")
          .map((creature) => creature.id);
        return { ...next, social: raiseMood(ensureSocial(next), ids, "wrong", MOOD_STAGE_SHIFT) };
      }
      return next;
    }
    case "observe": {
      // The whole swarm watches the keeper, so every living creature keeps
      // its own sliding window of the keeper's rhythm.
      const creatures: Record<CreatureId, CreatureState> = {};
      let changed = false;
      for (const [id, creature] of Object.entries(state.creatures)) {
        if (creature.behavior === "dead") {
          creatures[id] = creature;
          continue;
        }
        const learning = recordObservation(creature.learning ?? emptyLearning(), {
          verb: event.verb,
          atTick: state.tick,
          hesitationTicks: event.hesitationTicks,
          targetTile: event.targetTile,
        });
        if (!creature.learning?.converged && isConverged(learning)) {
          // Convergence lands: 「它开始预测你」. The learned trait is written
          // back into the genome — death no longer clears learning.
          creatures[id] = {
            ...creature,
            trait: "predictor",
            learning: { ...learning, converged: true },
            ...(creature.genome === undefined
              ? {}
              : { genome: writeBackPrediction(creature.genome) }),
          };
        } else {
          creatures[id] = { ...creature, learning };
        }
        changed = true;
      }
      return changed ? { ...state, creatures } : state;
    }
    case "remember": {
      const creature = state.creatures[event.creatureId];
      if (creature === undefined) {
        return state;
      }
      const current: MemorySlice = state.memories?.[event.creatureId] ?? emptySlice();
      return {
        ...state,
        memories: {
          ...state.memories,
          [event.creatureId]: rememberEntry(current, event.entry),
        },
      };
    }
    case "apply_effect":
      return applyEffect(state, event.effect);
    default:
      return state;
  }
}

export const DEFAULT_MASK: readonly string[] = [
  "..####..",
  ".######.",
  "##.##.##",
  "########",
  "########",
  ".######.",
  "..####..",
  "...##...",
];
