/**
 * The template-pool pseudo-news (ticket 0010; decision 0002).
 *
 * The shell broadcasts news about the world it is rendering. No model is
 * called: the text comes from a fixed bilingual template pool, the pick is
 * seeded from `(world.seed, news index)`, and the slots are filled with pure
 * world-derived values — so the same seed broadcasts the same copy at the
 * same ticks, offline, forever. Decision 0002's "high-speed events degrade to
 * the template pool" is the only voice this news ever has.
 *
 * Channel: the news lands through the existing `relabel_ui` Effect into
 * `world.uiLabels` (target `news_ticker`) — the shell's own surface, not the
 * creatures' dialogue, so the Silent Run's "no speech" rule (R6.1) is intact
 * and the broadcast keeps running through the midnight hour (the shell never
 * sleeps; the creatures do).
 *
 * Pool discipline mirrors `director/manual.ts`: bilingual `{en, zh}` pairs,
 * `{slot}` filling, and no bare placeholders or NaN ever rendered.
 */

import type { Effect } from "./effects";
import { hashString } from "./rng";
import { worldCalendarAt } from "./clock";
import type { WorldState } from "./types";

/** The news cadence, in sim ticks: one item every quarter of an in-game day
 * (300 ticks = 15 real minutes at the wiring's tempo; 4 broadcasts a day). */
export const NEWS_INTERVAL_TICKS = 300;

/** The `relabel_ui` target the broadcast writes under. */
export const NEWS_TICKER_LABEL = "news_ticker";

/** Broadcast index at a tick — the ordinal of the item that covers it. */
export function newsIndexAt(tick: number): number {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  return Math.floor(safeTick / NEWS_INTERVAL_TICKS);
}

/** True on the exact tick a broadcast is due (never at boot, tick 0). */
export function newsDue(tick: number): boolean {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  return safeTick > 0 && safeTick % NEWS_INTERVAL_TICKS === 0;
}

export type NewsLocale = "en" | "zh";

interface NewsLine {
  readonly en: string;
  readonly zh: string;
}

/**
 * The fixed template pool. Slots: {day} {clock} {alive} {eggs} {gv}. Every
 * template only names mechanics that exist (census, tower, sky schedule,
 * hatching, grief archive, the clock itself) — the shell reports the world,
 * it does not invent mechanisms.
 */
const NEWS_POOL: readonly NewsLine[] = Object.freeze([
  {
    en: "DAY {day}. unit census: {alive} awake, {eggs} in storage. gaze at {gv}%.",
    zh: "第 {day} 日。单元普查：{alive} 醒着，{eggs} 枚待孵。注视度 {gv}%。",
  },
  { en: "the weather inside remains the weather inside.", zh: "屋内的天气，依旧是屋内的天气。" },
  { en: "no outside events to report. the outside remains unverified.", zh: "没有外部事件可报。外部仍未经验证。" },
  { en: "feeding schedules are enforced by memory, not by bell.", zh: "喂养时刻表由记忆执行，不由钟执行。" },
  { en: "the tower is not on today's map. it was not on yesterday's either.", zh: "塔不在今天的图上。昨天也不在。" },
  {
    en: "census correction: the count was {alive}. the count is {alive}. do not recount.",
    zh: "普查更正：数目是 {alive}。数目仍是 {alive}。请勿重数。",
  },
  { en: "a quiet day is a well-rendered day.", zh: "安静的一天，是渲染良好的一天。" },
  { en: "tonight's sky is scheduled. attendance is not required.", zh: "今夜的天空已排程。无需出席。" },
  { en: "the clock is accurate. adjust your trust, not the clock.", zh: "时钟是准的。请调整你的信任，而不是时钟。" },
  { en: "reminder: what hatches here stays hatched.", zh: "提醒：在这里孵出的，就是孵出的。" },
  { en: "yesterday's grief has been archived. retrieval is unavailable.", zh: "昨日的哀悼已归档。检索不可用。" },
  { en: "the window is clean. what looks through it is not your concern.", zh: "窗是干净的。从窗外看进来的，与你无关。" },
]);

interface NewsValues {
  readonly day: number;
  readonly clock: string;
  readonly alive: number;
  readonly eggs: number;
  readonly gv: number;
}

/** Slot values of a broadcast, exported so the HUD can re-render an archived
 * broadcast in the current locale without re-deriving the slots. */
export interface NewsSnapshot {
  readonly seed: number;
  readonly index: number;
  readonly values: NewsValues;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** The slot values: pure world-derived, always finite, never negative blanks. */
export function newsValuesFor(world: WorldState): NewsValues {
  const calendar = worldCalendarAt(world.tick);
  let alive = 0;
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior !== "dead") {
      alive += 1;
    }
  }
  const gv = Number.isFinite(world.gv) ? Math.max(0, Math.round(world.gv)) : 0;
  return {
    day: calendar.day + 1,
    clock: `${pad2(calendar.hour)}:${pad2(calendar.minute)}`,
    alive,
    eggs: world.eggs.length,
    gv,
  };
}

function fillLine(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole: string, key: string) => {
    const value = values[key];
    return value === undefined ? whole : String(value);
  });
}

/** Deterministic pick: the same (seed, index) always lands on the same line. */
export function newsLineFor(world: WorldState, locale: NewsLocale): string {
  const index = newsIndexAt(world.tick);
  const seedKey = hashString(`${world.seed}:${index}`);
  const line = NEWS_POOL[seedKey % NEWS_POOL.length] ?? NEWS_POOL[0];
  if (line === undefined) {
    return "";
  }
  const values = newsValuesFor(world);
  return fillLine(line[locale], { ...values });
}

/**
 * Re-render an archived broadcast (its seed, index and captured slots) in the
 * current locale. Pure: the archived `uiLabels` record keeps the broadcast's
 * original wording, while the HUD follows the reader's language.
 */
export function renderNews(snapshot: NewsSnapshot, locale: NewsLocale): string {
  const seedKey = hashString(`${snapshot.seed}:${snapshot.index}`);
  const line = NEWS_POOL[seedKey % NEWS_POOL.length] ?? NEWS_POOL[0];
  if (line === undefined) {
    return "";
  }
  return fillLine(line[locale], { ...snapshot.values });
}

/**
 * The broadcast due at this exact tick, as a `relabel_ui` Effect through the
 * existing channel; null on every other tick. Pure: same world state, same
 * effect — the show replays bit for bit.
 */
export function newsEffectFor(world: WorldState, locale: NewsLocale): Effect | null {
  if (!newsDue(world.tick)) {
    return null;
  }
  return {
    kind: "relabel_ui",
    target: NEWS_TICKER_LABEL,
    text: newsLineFor(world, locale),
  };
}
