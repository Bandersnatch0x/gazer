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
  };
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
    case "feed":
      return updateCreature(state, event.creatureId, (creature) => ({
        ...creature,
        behavior: "eating",
        stats: {
          ...creature.stats,
          hunger: clamp(creature.stats.hunger + 45, 0, 100),
          happiness: clamp(creature.stats.happiness + 10, 0, 100),
        },
      }));
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
    case "hatch": {
      if (state.creatures[event.creatureId] !== undefined) {
        return state;
      }
      const creature: CreatureState = {
        id: event.creatureId,
        species: event.species,
        stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
        behavior: "idle",
        trait: null,
        position: event.at,
        palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
        mask: DEFAULT_MASK,
        hatchedAtTick: state.tick,
      };
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
