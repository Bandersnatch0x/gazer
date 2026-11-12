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
import { createRng } from "./rng";

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
  | { readonly kind: "apply_effect"; readonly effect: import("./effects").Effect };

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

function stepCreature(creature: CreatureState, seed: number, tick: number): CreatureState {
  if (creature.behavior === "dead") {
    return creature;
  }
  const eating = creature.behavior === "eating";
  const stats: CreatureStats = {
    hunger: clamp(creature.stats.hunger - (eating ? -40 : HUNGER_PER_TICK), 0, 100),
    hygiene: clamp(creature.stats.hygiene - HYGIENE_PER_TICK, 0, 100),
    energy: clamp(creature.stats.energy - ENERGY_PER_TICK, 0, 100),
    happiness: clamp(creature.stats.happiness - HAPPINESS_DECAY_PER_TICK, 0, 100),
  };
  return {
    ...creature,
    stats,
    behavior: behaviorFor(stats),
    position: wander(creature, seed, tick),
    // Contentment is the whole of willingness. A neglected creature cannot be
    // talked into anything, which is what makes forced pairing a choice.
    willingness: clamp(40 + (stats.happiness - 50) * 0.8, 0, 100),
  };
}

/** A content creature is willing. Neglect is what withholds consent. */
export const WILLING_AT = 60;
export const COURTSHIP_TICKS = 8;
export const MAX_EGGS = 4;

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
      const near =
        Math.abs(a.position.x - b.position.x) <= 1 &&
        Math.abs(a.position.y - b.position.y) <= 1;
      if (!near) {
        // Willing pairs drift together on their own. That is the courtship
        // beginning, and it is the reason the player can see it happening.
        next = updateCreature(next, a.id, (creature) => ({
          ...creature,
          position: stepToward(creature.position, b.position),
        }));
        next = updateCreature(next, b.id, (creature) => ({
          ...creature,
          position: stepToward(creature.position, a.position),
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
 * A deterministic random walk. Same creature id, same seed, same tick always
 * lands on the same tile, so replay stays exact. Sleeping and dead creatures
 * hold still; hungry ones drift, which is what makes the hunger state legible
 * from across the map.
 */
function wander(creature: CreatureState, seed: number, tick: number): TilePos {
  if (creature.behavior === "dead" || creature.behavior === "sleeping") {
    return creature.position;
  }
  // A courting creature holds its ground. The courtship step is what moves it.
  if (creature.courtshipTicks > 0) {
    return creature.position;
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
): CreatureState {
  return {
    id,
    species,
    stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
    behavior: "idle",
    trait: null,
    position: at,
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: DEFAULT_MASK,
    hatchedAtTick: tick,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
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
    drift: [],
    secrets: choice === "self" ? ["it hatched without being asked"] : [],
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
      for (const [id, creature] of Object.entries(state.creatures)) {
        creatures[id] = stepCreature(creature, state.seed, state.tick + 1);
      }
      return { ...state, tick: state.tick + 1, creatures };
    }
    case "feed": {
      const fed = state.creatures[event.creatureId];
      const next = updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "eating",
        stats: {
          ...creature.stats,
          hunger: clamp(creature.stats.hunger + 45, 0, 100),
          happiness: clamp(creature.stats.happiness + 10, 0, 100),
        },
      }));
      if (fed === undefined) {
        return next;
      }
      // Watching a neighbour eat is worth something. It is also how a player
      // who only ever feeds one creature still ends up with a willing pair.
      const neighbours: Record<CreatureId, CreatureState> = { ...next.creatures };
      for (const [id, creature] of Object.entries(next.creatures)) {
        if (id === event.creatureId || creature.behavior === "dead") {
          continue;
        }
        const near =
          Math.abs(creature.position.x - fed.position.x) <= 2 &&
          Math.abs(creature.position.y - fed.position.y) <= 2;
        if (near) {
          neighbours[id] = {
            ...creature,
            stats: {
              ...creature.stats,
              happiness: clamp(creature.stats.happiness + 4, 0, 100),
            },
          };
        }
      }
      return { ...next, creatures: neighbours };
    }
    case "clean":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        stats: { ...creature.stats, hygiene: clamp(creature.stats.hygiene + 50, 0, 100) },
      }));
    case "play":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "playing",
        stats: {
          ...creature.stats,
          happiness: clamp(creature.stats.happiness + 15, 0, 100),
          energy: clamp(creature.stats.energy - 8, 0, 100),
        },
      }));
    case "pet":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        stats: { ...creature.stats, happiness: clamp(creature.stats.happiness + 8, 0, 100) },
      }));
    case "name":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        name: event.name.trim().slice(0, 24),
      }));
    case "move":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        position: {
          x: clamp(event.at.x, GRID_MIN, GRID_MAX),
          y: clamp(event.at.y, GRID_MIN, GRID_MAX),
        },
      }));
    case "court":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "mating",
        courtshipTicks: creature.courtshipTicks + 1,
      }));
    case "layEgg": {
      if (state.eggs.length >= 4) {
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
      const egg: import("./types").Egg = {
        id: `egg_${state.tick}_${event.parentA}`,
        parentA: event.parentA,
        parentB: event.parentB,
        laidAtTick: state.tick,
        forced: event.forced,
        at,
      };
      return { ...state, eggs: [...state.eggs, egg] };
    }
    case "hatchFromEgg": {
      if (state.creatures[event.creatureId] !== undefined) {
        return state;
      }
      if (!state.eggs.some((egg) => egg.id === event.eggId)) {
        return state;
      }
      const creature: CreatureState = {
        ...newCreature(event.creatureId, event.at, event.species, state.tick),
        genome: applyHatchChoice(state.creatures[event.creatureId]?.genome, event.choice, event.creatureId),
      };
      return {
        ...state,
        eggs: state.eggs.filter((egg) => egg.id !== event.eggId),
        creatures: { ...state.creatures, [event.creatureId]: creature },
      };
    }
    case "hatch": {
      if (state.creatures[event.creatureId] !== undefined) {
        return state;
      }
      const creature: CreatureState = newCreature(
        event.creatureId,
        event.at,
        event.species,
        state.tick,
      );
      return { ...state, creatures: { ...state.creatures, [event.creatureId]: creature } };
    }
    case "gv": {
      const gv = clamp(state.gv + event.delta, 0, 100);
      const stage: Stage = stageForGv(gv);
      return { ...state, gv, stage };
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
