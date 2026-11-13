import type { CreatureId, Mood } from "./types";
import type { TurnIntent } from "./roundtable";
import { isNightHour } from "./clock";
import { stageDecayFor } from "./rhythm";

export type LedgerEvent =
  | { readonly kind: "feed"; readonly creatureId: CreatureId; readonly hesitationMs: number }
  | { readonly kind: "clean"; readonly creatureId: CreatureId }
  | { readonly kind: "stare"; readonly creatureId: CreatureId; readonly durationMs: number }
  | { readonly kind: "rapid_click"; readonly creatureId: CreatureId; readonly count: number }
  | { readonly kind: "drag_to_hazard"; readonly creatureId: CreatureId }
  | { readonly kind: "death"; readonly creatureId: CreatureId; readonly cause: "starvation" | "neglect" }
  | { readonly kind: "idle"; readonly durationMs: number }
  | { readonly kind: "session_start"; readonly localHour: number }
  | { readonly kind: "player_answer"; readonly question: string; readonly answer: string }
  // Stream A wiring additions: the remaining runtime increments previously
  // inlined in game.ts needed an honest ledger kind. Weights preserve the exact
  // values those sites used, so no runtime number changes. Stream B owns
  // retuning these (ticket 0002) — `drag_to_hazard` stays unused until a hazard
  // exists.
  | { readonly kind: "carry"; readonly creatureId: CreatureId }
  | { readonly kind: "name"; readonly creatureId: CreatureId; readonly name: string }
  | { readonly kind: "hatch"; readonly creatureId: CreatureId }
  /**
   * 翻译流完成 (ticket 0029, NARRATIVE-CORE-01 §6): one glyph read off the
   * tower. `fragment` is the canon key; `count` is the running total after
   * this read (the `n` in `glyph_read:{n}/8`). The flow is narrative, not
   * care — the weight stays 0 so GV never moves during a reading.
   */
  | { readonly kind: "glyph_read"; readonly creatureId: CreatureId; readonly fragment: string; readonly count: number }
  /**
   * 终端对话入账 (ART-CORE-02 §8, ticket 0044): 每条落在终端的对话回合,
   * speaker/text/intent/mood 原样保留——说话者为 null 是正典打印行(它们
   * 在背诵,没有「谁」在说,票 0029 惯例);intent/mood 为 null 是手动池
   * 台词(没有回合意图可记)。照 0029 惯例:叙事流,不喂 GV,权重 0。
   */
  | {
      readonly kind: "terminal_line";
      readonly speaker: CreatureId | null;
      readonly text: string;
      readonly intent: TurnIntent | null;
      readonly mood: Mood | null;
    };

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
  // Retuned (stream B, ticket 0002): the stare was the dominant GV pump
  // (+3 per window ≈ +60/min under a moving cursor, §3). Halved here; the
  // per-stage taper in `gvDeltaFor` does the rest of the slowdown.
  stare: 1.5,
  rapid_click: 4,
  drag_to_hazard: 8,
  death: 15,
  // Retained: idle stays a small ambient gain (AFK is still attention, and the
  // stage taper slows it with everything else); rapid_click stays the recorded
  // cost of a spam burst, now only emitted on confirmed feeds.
  idle: 2,
  session_start: 0,
  player_answer: 0,
  carry: 1,
  name: 2,
  hatch: 1,
  // The translation flow is narrative, not care (ticket 0029): reading a
  // glyph off the tower must never pump GV, day or night.
  glyph_read: 0,
  // The terminal transcript is narrative, not care (ART-CORE-02 §8, ticket
  // 0044, same convention as glyph_read): dialogue entering the terminal is
  // recorded verbatim, and never moves GV.
  terminal_line: 0,
};

/**
 * The single source of truth for GV deltas. `localHour` may be the player's
 * real local hour (telemetry context) or the in-world hour derived from the
 * tick (ticket 0008: the runtime now passes the deterministic world hour, so
 * the night multiplier replays identically offline). `stage` is optional:
 * omitted (or out of range) resolves to full weight, so the two-argument
 * contract the wiring tests pin stays exact. The runtime call sites pass the
 * world's stage so gains taper toward the finale (ticket 0002).
 */
export function gvDeltaFor(event: LedgerEvent, localHour: number, stage?: number): number {
  const base = GV_WEIGHTS[event.kind] * stageDecayFor(stage ?? 0);
  return isNightHour(localHour) ? base * 1.5 : base;
}
