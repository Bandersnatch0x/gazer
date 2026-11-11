import type { CreatureId, Mood } from "./types";

export type TurnIntent = "observe" | "deceive" | "query" | "confide" | "accuse" | "comfort";

export interface RoundtableTurn {
  readonly speaker: CreatureId;
  readonly text: string;
  readonly intent: TurnIntent;
  readonly mood: Mood;
  readonly memoryRef: string;
}

export interface RoundtableScript {
  readonly scene: readonly RoundtableTurn[];
}

export const MIN_TURNS = 2;
export const MAX_TURNS = 4;

export type LifecyclePoint =
  | "sim:tick"
  | "action:pre"
  | "action:post"
  | "ledger:anchor"
  | "gv:cross"
  | "stage:shift"
  | "creature:death"
  | "memory:propagate"
  | "session:start"
  | "session:end"
  | "llm:budget"
  | "llm:fallback";

export interface HookContext {
  readonly tick: number;
  readonly stage: number;
  readonly creatureId: CreatureId | null;
}

export interface HookDef {
  readonly point: LifecyclePoint;
  readonly id: string;
  readonly priority: number;
  readonly sync: boolean;
  readonly guard?: (ctx: HookContext) => boolean;
  readonly handler: (ctx: HookContext) => void | Promise<void>;
  readonly logged: boolean;
}
