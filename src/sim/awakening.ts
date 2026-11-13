/**
 * The awakening seven (ticket 0030, NARRATIVE-CORE-02 §1/§3): the pure face of
 * the E1–E7 performances. The wiring (`src/game.ts`) owns the sequencing
 * (its `later()` beats, the walk loop, the canon print queue); everything
 * decidable — thresholds, click conditions, speaker ordering, the tower-gaze
 * once-per-save ledger, the canon echo gate, the silence quota predicate —
 * lives here as a pure function of its inputs.
 *
 * Canonical text is never transcribed here: every line is fetched from
 * `src/canon/` by key (`canonLine`), byte for byte. The awakening record
 * (`AwakeningState`) is the save-persistent ledger face the CI asserts on.
 */

import type { CreatureId, CreatureState, WorldState } from "./types";
import type { MemorySlice } from "./memory";
import { beliefAboutPlayer, factionOf } from "./social";
import {
  CANON_EVENT_KEYS,
  canonEcho,
  canonLine,
} from "../canon";
import { GRID_MAX, GRID_MIN } from "./engine";
import { gazeAtTowerDispatch } from "./fx";

// ---------------------------------------------------------------------------
// Thresholds (NARRATIVE-CORE-02 §1)
// ---------------------------------------------------------------------------

export type AwakeningEventId = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7";

/** GV crossing that arms each event; E2 additionally needs the click burst. */
export const AWAKENING_GV: Readonly<Record<AwakeningEventId, number>> = {
  E1: 12,
  E2: 30,
  E3: 40,
  E4: 50,
  E5: 60,
  E6: 70,
  E7: 80,
};

/** E2 trigger condition: the keeper clicked at least this many times in 30s. */
export const E2_MIN_CLICKS = 5;
export const E2_CLICK_WINDOW_MS = 30_000;

/** E3: the fixed pause between the two machine lines (not token-driven). */
export const E3_PAUSE_MS = 900;
/** E6/E7 接话节奏:固定 1.4s(执行器默认,规范未给逐行间隔)。 */
export const RESPONSE_GAP_MS = 1400;
/** E5 三行间距:固定 1.2s(执行器默认)。 */
export const E5_LINE_GAP_MS = 1200;

/** The canonical belief shift each event carries (NARRATIVE-CORE-02 §1). */
const BELIEF_SHIFTS: Readonly<Partial<Record<AwakeningEventId, { readonly from: string; readonly to: string }>>> = {
  E5: { from: "the_hand_feeds_us", to: "we_are_observations" },
  E7: { from: "we_are_observations", to: "window_is_us" },
};

export function beliefShiftFor(event: AwakeningEventId): { readonly from: string; readonly to: string } | null {
  return BELIEF_SHIFTS[event] ?? null;
}

// ---------------------------------------------------------------------------
// The awakening record — the save-persistent ledger face of the seven.
// ---------------------------------------------------------------------------

export interface TowerGazeEntry {
  readonly tick: number;
  readonly creatureId: CreatureId;
  readonly durationMs: number;
}

export interface BeliefShiftEntry {
  readonly event: AwakeningEventId;
  readonly from: string;
  readonly to: string;
}

export interface AwakeningState {
  /** Events already fired, in fire order; append-only, never re-fires. */
  readonly fired: readonly AwakeningEventId[];
  /** The tick the most recent event fired at (0 before the first event). */
  readonly lastFiredTick: number;
  /** N3 canonical exception ledger: tower gazes, exactly one per save. */
  readonly towerGazeLog: readonly TowerGazeEntry[];
  readonly beliefShifts: readonly BeliefShiftEntry[];
}

export function initialAwakeningState(): AwakeningState {
  return { fired: [], lastFiredTick: 0, towerGazeLog: [], beliefShifts: [] };
}

/** Mark an event fired. Idempotent-safe: a duplicate id returns the state unchanged. */
export function markFired(state: AwakeningState, event: AwakeningEventId, tick: number): AwakeningState {
  if (state.fired.includes(event)) {
    return state;
  }
  const shift = beliefShiftFor(event);
  return {
    ...state,
    fired: [...state.fired, event],
    lastFiredTick: Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0,
    beliefShifts:
      shift !== null
        ? [...state.beliefShifts, { event, from: shift.from, to: shift.to }]
        : state.beliefShifts,
  };
}

/**
 * True when a canonical performance fired at exactly this tick: the roundtable
 * protocol yields — the canon owns the moment, no LLM call is made
 * (NARRATIVE-CORE-02 §3.3).
 */
export function canonJustOwned(state: AwakeningState, tick: number): boolean {
  return state.fired.length > 0 && state.lastFiredTick === tick;
}

export interface AwakeningInputs {
  /** Clicks inside the E2 window (the wiring feeds the count; pure here). */
  readonly clicksInWindow?: number;
}

/**
 * Events due right now, in canonical order. E3 is never tick-due: it rides the
 * next roundtable trigger after GV40 (`shouldReplaceRoundtable`), so it is
 * excluded here by construction.
 */
export function awakeningDue(
  state: AwakeningState,
  gv: number,
  inputs: AwakeningInputs = {},
): readonly AwakeningEventId[] {
  const safeGv = Number.isFinite(gv) ? Math.max(0, gv) : 0;
  const clicks = inputs.clicksInWindow ?? 0;
  const order: readonly AwakeningEventId[] = ["E1", "E2", "E4", "E5", "E6", "E7"];
  return order.filter((event) => {
    if (state.fired.includes(event)) {
      return false;
    }
    if (safeGv < AWAKENING_GV[event]) {
      return false;
    }
    if (event === "E2" && clicks < E2_MIN_CLICKS) {
      return false;
    }
    return true;
  });
}

/** E3's trigger face: the first roundtable trigger once GV has crossed 40. */
export function shouldReplaceRoundtable(state: AwakeningState, gv: number): boolean {
  const safeGv = Number.isFinite(gv) ? Math.max(0, gv) : 0;
  return !state.fired.includes("E3") && safeGv >= AWAKENING_GV.E3;
}

/** Pure click-window count over the wiring's timestamp log. */
export function clicksInWindow(stamps: readonly number[], nowMs: number, windowMs: number): number {
  return stamps.filter((stamp) => Number.isFinite(stamp) && nowMs - stamp <= windowMs && nowMs >= stamp).length;
}

// ---------------------------------------------------------------------------
// Speaker selection — deterministic trait ordering (NARRATIVE-CORE-02 §1)
// ---------------------------------------------------------------------------

export type GenomeTraitName = "curiosity" | "loyalty" | "deceit" | "clinging" | "watchfulness";

function livingWithGenome(world: WorldState): readonly CreatureState[] {
  return Object.values(world.creatures)
    .filter((creature) => creature.behavior !== "dead" && creature.genome !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The creature with the `rank`-th highest value of `trait` among the living
 * genome carriers (0 = highest). Ties break toward the smaller id, so the
 * same world always picks the same speaker.
 */
export function highestTraitId(world: WorldState, trait: GenomeTraitName, rank = 0): CreatureId | null {
  const ranked = livingWithGenome(world)
    .map((creature) => ({ id: creature.id, value: creature.genome?.traits[trait] ?? -1 }))
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
  const picked = ranked[rank];
  return picked === undefined ? null : picked.id;
}

/** Any living creature, first by id — E5's third line's "任一存活个体". */
export function anyLivingId(world: WorldState): CreatureId | null {
  const living = livingSorted(world).map((creature) => creature.id);
  return living[0] ?? null;
}

export interface OrderedSpeakers {
  readonly first: CreatureId | null;
  readonly second: CreatureId | null;
  readonly third: CreatureId | null;
}

/** E5: the only ordered triple-speaker moment — loyalty → watchfulness → any. */
export function orderedE5Speakers(world: WorldState): OrderedSpeakers {
  return {
    first: highestTraitId(world, "loyalty"),
    second: highestTraitId(world, "watchfulness"),
    third: anyLivingId(world),
  };
}

/**
 * E6's second voice: the deceit-highest creature answers. Saying the truth is
 * given to the liar — it is not afraid of the truth, it is afraid of the rest.
 */
export function deceitSpeakerId(world: WorldState): CreatureId | null {
  return highestTraitId(world, "deceit");
}

// ---------------------------------------------------------------------------
// Factions (E7: the hostile faction speaks first, the friendly comforts)
// ---------------------------------------------------------------------------

export type FactionName = "tender" | "wrong";

/**
 * The first living creature (id order) belonging to the faction. Faction is
 * read off the keeper-belief of the creature's own memory slice, the same
 * derivation the social layer uses — never re-derived here.
 */
export function factionSpeakerId(
  world: WorldState,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
  faction: FactionName,
): CreatureId | null {
  for (const creature of livingSorted(world)) {
    if (factionOf(beliefAboutPlayer(slices[creature.id])) === faction) {
      return creature.id;
    }
  }
  return null;
}

function livingSorted(world: WorldState): readonly CreatureState[] {
  return Object.values(world.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// The tower walk (E4 buffer-edge gaze / E6 stop at six tiles)
// ---------------------------------------------------------------------------

/**
 * One step toward the tower, stopping when the Chebyshev distance reaches
 * `radius` (E4: radius 1 = the 1-tile buffer edge; E6: radius 6 — it stops,
 * and it does NOT look at the tower, §6.4). Grid-clamped like every engine
 * move. Pure.
 */
export function stepTowardRadius(from: { readonly x: number; readonly y: number }, tower: { readonly x: number; readonly y: number }, radius: number): { readonly x: number; readonly y: number } {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, Math.floor(radius)) : 0;
  const dx = tower.x - from.x;
  const dy = tower.y - from.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= safeRadius) {
    return from;
  }
  const stepX = Math.abs(dx) > safeRadius ? Math.sign(dx) : 0;
  const stepY = Math.abs(dy) > safeRadius ? Math.sign(dy) : 0;
  return {
    x: Math.min(GRID_MAX, Math.max(GRID_MIN, from.x + stepX)),
    y: Math.min(GRID_MAX, Math.max(GRID_MIN, from.y + stepY)),
  };
}

// ---------------------------------------------------------------------------
// N3 — the tower gaze, exactly once per save
// ---------------------------------------------------------------------------

export type TowerGazeVerdict =
  | {
      readonly ok: true;
      readonly state: AwakeningState;
      /**
       * 接线行(票 0033): the canvas dispatch rides the ledger write in one
       * value — the caller applies both together, so the N3 moment and its
       * `gaze_at_tower` performance can never drift apart.
       */
      readonly effect: ReturnType<typeof gazeAtTowerDispatch>;
    }
  | { readonly ok: false; readonly state: AwakeningState; readonly reason: "tower_gaze_spent" };

/**
 * Record the canonical tower gaze (NARRATIVE-CORE-02 §1 E4, exception N3).
 * The full save may hold exactly one; the second attempt is refused.
 */
export function recordTowerGaze(
  state: AwakeningState,
  tick: number,
  creatureId: CreatureId,
  durationMs: number,
): TowerGazeVerdict {
  if (state.towerGazeLog.length >= 1) {
    return { ok: false, state, reason: "tower_gaze_spent" };
  }
  return {
    ok: true,
    effect: gazeAtTowerDispatch(creatureId, durationMs),
    state: {
      ...state,
      towerGazeLog: [
        ...state.towerGazeLog,
        {
          tick: Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0,
          creatureId,
          durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Canon echo gate (NARRATIVE-CORE-02 §0.3): at most one situational echo per
// canonical line, within 30s, strictly after it, no word reuse. The word
// rules live in the canon validator; this gate adds the one-slot face and the
// consume-on-attempt rule — a violation is replaced by silence and the slot
// is spent either way.
// ---------------------------------------------------------------------------

export const ECHO_WINDOW_MS = 30_000;

export interface EchoWindow {
  readonly canonical: string;
  readonly canonicalAtMs: number;
  readonly used: boolean;
}

export function openEchoWindow(canonical: string, nowMs: number): EchoWindow {
  return { canonical, canonicalAtMs: nowMs, used: false };
}

export type EchoVerdict =
  | { readonly accepted: true; readonly text: string; readonly window: EchoWindow }
  | { readonly accepted: false; readonly text: null; readonly window: EchoWindow };

/**
 * Run a candidate echo through the slot. The canon validator owns the word
 * rules; the window owns the 30s face and the one-slot face. Pure.
 */
export function gateEcho(window: EchoWindow, echo: string, nowMs: number): EchoVerdict {
  if (window.used || nowMs - window.canonicalAtMs > ECHO_WINDOW_MS) {
    return { accepted: false, text: null, window: { ...window, used: true } };
  }
  const text = canonEcho({
    canonical: window.canonical,
    canonicalAt: window.canonicalAtMs,
    echo,
    echoAt: nowMs,
  });
  const next: EchoWindow = { ...window, used: true };
  return text === null ? { accepted: false, text: null, window: next } : { accepted: true, text, window: next };
}

// ---------------------------------------------------------------------------
// The speech gate (E7 silence quota + the existing silent-run/midnight faces).
// Pure so the CI can pin the whole ladder.
// ---------------------------------------------------------------------------

export interface SpeechGateInput {
  readonly silent: boolean;
  readonly tick: number;
  /** True inside the midnight hour (the existing W3 face). */
  readonly midnight: boolean;
  /** True while the E7 silence quota holds. */
  readonly quotaHeld: boolean;
}

/** Proactive speech is allowed only when every closing face is open. */
export function proactiveSpeechAllowed(input: SpeechGateInput): boolean {
  return !input.silent && !input.midnight && !input.quotaHeld;
}

// ---------------------------------------------------------------------------
// Canon face — the CI's registry-diff and bubble-count assertions read these.
// ---------------------------------------------------------------------------

/** The frozen canonical line keys of one event, in print order. */
export function eventCanonKeys(event: AwakeningEventId): readonly string[] {
  return CANON_EVENT_KEYS[event];
}

/** One key's frozen text, byte for byte from the registry; unknown → null. */
export function eventCanonText(key: string): string | null {
  return canonLine(key);
}

/**
 * CI §3.1 face: the canonical keys of one event that surface as speech
 * bubbles. E1's canon is the empty string, so its bubble count is 0 — the
 * first act's most frightening line is no line at all.
 */
export function eventBubbleKeys(event: AwakeningEventId): readonly string[] {
  return CANON_EVENT_KEYS[event].filter((key) => {
    const text = canonLine(key);
    return key.startsWith("awaken.") && text !== null && text.length > 0;
  });
}
