import type { MemoryEntry, MemorySlice } from "./memory";
import type { LearningState, PromptGenome } from "./genome";

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

export type CreatureTrait =
  | "watcher"
  | "mimic"
  | "herald"
  | "mourner"
  /** Converged on the keeper's rhythm: it now acts before the hand lands. */
  | "predictor";

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
  /** The name the player gave it. Naming is a claim of ownership. */
  readonly name: string | null;
  /** 0..100. Below 70, pairing is forced if the player insists. */
  readonly willingness: number;
  /** Ticks this creature has spent courting, if any. */
  readonly courtshipTicks: number;
  /** The soul is a prompt. Absent only before a genome has been assigned. */
  readonly genome?: PromptGenome;
  /**
   * Frozen shape (ticket 0005, consumed by the D-stream tree view): the two
   * parents this creature hatched from. Absent for seed creatures.
   */
  readonly parentLinks?: { readonly parentA?: string; readonly parentB?: string };
  /** The sliding window of the keeper's observed actions, per creature. */
  readonly learning?: LearningState;
  /**
   * 返祖体 (ticket 0029, NARRATIVE-CORE-01 §6): a genome mutation (p≈0.05 at
   * hatch) that can walk to the tower and read a glyph. Optional so every
   * legacy world stays valid; absent means false, and it never regresses.
   */
  readonly atavistic?: boolean;
  /**
   * 双生魂 (ticket 0037, ART-CORE-01 §7): the other twin's id. The pair
   * shares one microframe phase with zero error and mirrors each other's
   * pupil within the same frame; the link is symmetric and never regresses.
   */
  readonly twinOf?: CreatureId;
  /**
   * 哀悼体 (ticket 0037, ART-CORE-01 §7): plays SLEEP's closed-eye line —
   * tilted toward the lower right — while standing upright. Eyes closed in
   * an awake posture; the tilt is a cross-player constant, never explained.
   */
  readonly grief?: boolean;
}

export type HatchChoice = "immediate" | "warm" | "still" | "self";

export interface Egg {
  readonly id: string;
  readonly parentA: CreatureId;
  readonly parentB: CreatureId;
  readonly laidAtTick: number;
  readonly forced: boolean;
  readonly at: TilePos;
  /** Both parents' genomes, written at lay time so hatching can hybridize. */
  readonly parentGenomes?: {
    readonly parentA?: PromptGenome | undefined;
    readonly parentB?: PromptGenome | undefined;
  };
  /** One memory drawn from each parent, hatched into a creature that never saw it. */
  readonly inheritedMemories?: readonly MemoryEntry[];
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
  readonly eggs: readonly Egg[];
  readonly uiLabels: Readonly<Record<string, string>>;
  readonly paletteDecay: number;
  readonly seed: number;
  readonly silent: boolean;
  /**
   * The keeper-facing memory layer. Optional so every existing world and test
   * stays valid; present once the game layer feeds entries in via `remember`.
   */
  readonly memories?: Readonly<Record<CreatureId, MemorySlice>>;
  /**
   * The social layer (stream F, ticket 0006): sexes, moods, mourning circles,
   * terrain traces. Shape lives in `./social`; optional so legacy worlds and
   * tests stay valid. (Field addition ruled in by lead, 2026-11-12.)
   */
  readonly social?: import("./social").SocialState;
  /**
   * 已读刻符集合 (ticket 0029): canon fragment keys (`fragment.f1` …) whose
   * glyph has been read off the tower. Append-only and persisted — read
   * progress never regresses, even when the atavistic reader dies
   * (NARRATIVE-CORE-01 §1 防死锁). Optional so legacy worlds stay valid.
   */
  readonly glyphsRead?: readonly string[];
  /**
   * 结局事件入档 (ticket 0035): the ending the world reached, with its tick
   * as the anchor for the fusion dissolve and the forgetting day count.
   * 真·凝视的塔面不需要它——8/8 读走即成立(`sim/endings.ts`)。Optional
   * so legacy worlds stay valid; set by the game layer, never by the tower.
   */
  readonly ending?: import("./endings").EndingState;
  /**
   * 幽灵档案入档 (ticket 0051, NARRATIVE-CORE-01 §5 / v3 §5.4): the
   * anonymized profiles of the dead — traits snapshot, one signature-moment
   * reference, kept memory ids; no raw logs (the recording and the NG+
   * opening draw their slots from here). Optional so legacy worlds stay
   * valid; built by the game layer via `sim/ghosts.ts`, append-only.
   */
  readonly ghosts?: readonly import("./ghosts").GhostProfile[];
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
