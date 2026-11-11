import type { CreatureId } from "./types";

export type LedgerEvent =
  | { readonly kind: "feed"; readonly creatureId: CreatureId; readonly hesitationMs: number }
  | { readonly kind: "clean"; readonly creatureId: CreatureId }
  | { readonly kind: "stare"; readonly creatureId: CreatureId; readonly durationMs: number }
  | { readonly kind: "rapid_click"; readonly creatureId: CreatureId; readonly count: number }
  | { readonly kind: "drag_to_hazard"; readonly creatureId: CreatureId }
  | { readonly kind: "death"; readonly creatureId: CreatureId; readonly cause: "starvation" | "neglect" }
  | { readonly kind: "idle"; readonly durationMs: number }
  | { readonly kind: "session_start"; readonly localHour: number }
  | { readonly kind: "player_answer"; readonly question: string; readonly answer: string };

export interface LedgerEntry {
  readonly at: number;
  readonly wallClock: string;
  readonly event: LedgerEvent;
}

export interface LifetimeSummary {
  readonly feeds: number;
  readonly deaths: number;
  readonly meanHesitationMs: number;
  readonly favoriteCreatureId: CreatureId | null;
  readonly typicalHours: readonly number[];
  readonly sessions: number;
  readonly resets: number;
}

export const LEDGER_CAPACITY = 200;

const GV_WEIGHTS: Readonly<Record<LedgerEvent["kind"], number>> = {
  feed: 1,
  clean: 1,
  stare: 3,
  rapid_click: 4,
  drag_to_hazard: 8,
  death: 15,
  idle: 2,
  session_start: 0,
  player_answer: 0,
};

export function gvDeltaFor(event: LedgerEvent, localHour: number): number {
  const base = GV_WEIGHTS[event.kind];
  const night = localHour >= 0 && localHour < 5;
  return night ? base * 1.5 : base;
}
