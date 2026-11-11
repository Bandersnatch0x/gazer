export type CreatureId = string;

export type TilePos = { readonly x: number; readonly y: number };

export type CreatureBehavior =
  | "idle"
  | "hungry"
  | "eating"
  | "dirty"
  | "sleeping"
  | "playing"
  | "mating"
  | "dead";

export type CreatureTrait = "watcher" | "mimic" | "herald" | "mourner";

export type Mood = "curious" | "sad" | "loving" | "wrong" | "hungry";

export type Stage = 0 | 1 | 2 | 3 | 4;

export interface CreatureStats {
  readonly hunger: number;
  readonly hygiene: number;
  readonly happiness: number;
  readonly energy: number;
}

export interface CreatureState {
  readonly id: CreatureId;
  readonly species: string;
  readonly stats: CreatureStats;
  readonly behavior: CreatureBehavior;
  readonly trait: CreatureTrait | null;
  readonly position: TilePos;
  readonly palette: readonly string[];
  readonly mask: readonly string[];
  readonly hatchedAtTick: number;
}

export interface Structure {
  readonly kind: "black_tower";
  readonly at: TilePos;
  readonly createdBy: "director" | "script";
}

export interface WorldState {
  readonly tick: number;
  readonly gv: number;
  readonly stage: Stage;
  readonly creatures: Readonly<Record<CreatureId, CreatureState>>;
  readonly structures: readonly Structure[];
  readonly uiLabels: Readonly<Record<string, string>>;
  readonly paletteDecay: number;
  readonly seed: number;
  readonly silent: boolean;
}

export const INITIAL_GV = 0;
export const MAX_GV = 100;

export const GV_THRESHOLDS: readonly { readonly stage: Stage; readonly min: number }[] = [
  { stage: 0, min: 0 },
  { stage: 1, min: 20 },
  { stage: 2, min: 40 },
  { stage: 3, min: 60 },
  { stage: 4, min: 80 },
];

export function stageForGv(gv: number): Stage {
  let stage: Stage = 0;
  for (const threshold of GV_THRESHOLDS) {
    if (gv >= threshold.min) {
      stage = threshold.stage;
    }
  }
  return stage;
}
