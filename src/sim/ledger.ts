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
  /** Power-button restart. Narrative, not care: weight 0, never moves GV. */
  | { readonly kind: "reset" }
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
  reset: 0,
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
 * omitted resolves to **full weight** — the un-tapered truth the two-argument
 * contract pins (decision 0025 halved stage 0, not this contract). An explicit
 * stage clamps through `stageDecayFor` (9 → the finale). The runtime call
 * sites always pass the world's stage so gains taper toward it (ticket 0002).
 */
export function gvDeltaFor(event: LedgerEvent, localHour: number, stage?: number): number {
  const base = GV_WEIGHTS[event.kind] * (stage === undefined ? 1 : stageDecayFor(stage));
  return isNightHour(localHour) ? base * 1.5 : base;
}

/**
 * Append one behaviour entry. The ledger is a rolling window: when it exceeds
 * `LEDGER_CAPACITY`, the oldest entries fall off. Pure; the caller owns the
 * clock face (`wallClock`) so the sim layer never reads a wall clock.
 */
export function appendLedgerEntry(
  entries: readonly LedgerEntry[],
  entry: LedgerEntry,
): readonly LedgerEntry[] {
  const next = [...entries, entry];
  return next.length > LEDGER_CAPACITY ? next.slice(next.length - LEDGER_CAPACITY) : next;
}

/**
 * The lifetime summary over the retained ledger window. Feeds/deaths are
 * counted, hesitation is averaged over feed events, the favourite creature is
 * the most-fed id (ties keep the earliest first-fed id), and typical hours are
 * the sorted unique `session_start` hours. Sessions and resets are counted from
 * their own entries, so the summary has one source: the ledger.
 */
export function lifetimeSummary(entries: readonly LedgerEntry[]): LifetimeSummary {
  let feeds = 0;
  let deaths = 0;
  let hesitationTotal = 0;
  let sessions = 0;
  let resets = 0;
  const feedsByCreature = new Map<CreatureId, number>();
  const hours = new Set<number>();

  for (const entry of entries) {
    const event = entry.event;
    switch (event.kind) {
      case "feed":
        feeds += 1;
        hesitationTotal += event.hesitationMs;
        feedsByCreature.set(event.creatureId, (feedsByCreature.get(event.creatureId) ?? 0) + 1);
        break;
      case "death":
        deaths += 1;
        break;
      case "session_start":
        sessions += 1;
        hours.add(event.localHour);
        break;
      case "reset":
        resets += 1;
        break;
      default:
        break;
    }
  }

  // Map iteration follows first-feed order, so equal counts keep the creature
  // the player fed first — deterministic, no second tie-break pass.
  let favoriteCreatureId: CreatureId | null = null;
  let bestFeeds = 0;
  for (const [creatureId, count] of feedsByCreature) {
    if (count > bestFeeds) {
      bestFeeds = count;
      favoriteCreatureId = creatureId;
    }
  }

  return {
    feeds,
    deaths,
    meanHesitationMs: feeds === 0 ? 0 : hesitationTotal / feeds,
    favoriteCreatureId,
    typicalHours: [...hours].sort((left, right) => left - right),
    sessions,
    resets,
  };
}
