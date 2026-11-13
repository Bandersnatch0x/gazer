/**
 * Ticket 0030/0031 — the awakening seven (E1–E7) and the game wiring face.
 *
 * CI subset of NARRATIVE-CORE-02 §3:
 *   1. E1 renders zero bubbles — its canon is the empty string;
 *   2. E4's tower gaze happens exactly once per save (the N3 exception ledger);
 *   3. E5's three-line speaker order follows the trait ranking, and the
 *      roundtable protocol yields at a canon-owned trigger;
 *   4. E7's silence quota: 5 game hours, refusals booked as `silence_quota`;
 *   5. canon_echo compliance — late, ≤15 words, no word reuse, one slot;
 *   6. registry diff — every rendered canon line is byte-exact from src/canon/.
 *
 * Plus the executor's canonical-binding extensions: C-02 `target`, C-06
 * `duration_ms`, and the canonical exemption of gate/cap (E1's canonical wink
 * must land at stage 0).
 */

import { describe, expect, it } from "vitest";
import { CANON_EVENT_KEYS, CANON_REGISTRY, E7_SILENCE_QUOTA_GAME_HOURS } from "../src/canon";
import { WEBAPI_LINE_KEYS } from "../src/ui/shell";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { CreatureState, CreatureId, WorldState } from "../src/sim/types";
import type { GenomeTraits } from "../src/sim/genome";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import { emptySlice } from "../src/sim/memory";
import {
  AWAKENING_GV,
  E2_MIN_CLICKS,
  clicksInWindow,
  awakeningDue,
  beliefShiftFor,
  canonJustOwned,
  deceitSpeakerId,
  eventBubbleKeys,
  eventCanonKeys,
  eventCanonText,
  factionSpeakerId,
  gateEcho,
  highestTraitId,
  initialAwakeningState,
  markFired,
  openEchoWindow,
  orderedE5Speakers,
  proactiveSpeechAllowed,
  recordTowerGaze,
  shouldReplaceRoundtable,
  stepTowardRadius,
} from "../src/sim/awakening";
import {
  SILENCE_QUOTA_GAME_HOURS,
  SILENCE_QUOTA_TICKS,
  armSilenceQuota,
  executeFx,
  fxOnTick,
  initialFxState,
  recordSilenceRefusal,
  silenceQuotaHeld,
} from "../src/sim/fx";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TRAITS: GenomeTraits = {
  curiosity: 0.5,
  loyalty: 0.5,
  deceit: 0.1,
  clinging: 0.5,
  watchfulness: 0.5,
};

function creature(id: CreatureId, traits: Partial<GenomeTraits> = {}, behavior: CreatureState["behavior"] = "idle"): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
    behavior,
    trait: null,
    position: { x: 4, y: 5 },
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 1,
      lineage: ["seed_alpha"],
      base: "you are a small one-eyed creature being raised through a window",
      traits: { ...BASE_TRAITS, ...traits },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias: 0,
    },
  };
}

function world(creatures: readonly CreatureState[], stage: WorldState["stage"] = 3): WorldState {
  const map: Record<CreatureId, CreatureState> = {};
  for (const entry of creatures) {
    map[entry.id] = entry;
  }
  return {
    tick: 100,
    gv: stage * 20,
    stage,
    creatures: map,
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: false,
    memories: {},
  };
}

function memory(fact: string, valence: number): MemoryEntry {
  return {
    id: `mem_${fact.length}_${valence}`,
    atTick: 10,
    wallClock: "12:00:00",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

function sliceOf(entries: readonly MemoryEntry[]): MemorySlice {
  const slice = emptySlice();
  return { ...slice, working: [...entries] };
}

// ---------------------------------------------------------------------------
// CI §3.6 subset — registry diff, byte for byte
// ---------------------------------------------------------------------------

describe("registry diff — rendered canon lines are byte-exact (§3.6 subset)", () => {
  it("resolves every awakening event key to its registry text, punctuation included", () => {
    for (const event of ["E1", "E2", "E3", "E4", "E5", "E6", "E7"] as const) {
      expect(eventCanonKeys(event)).toEqual(CANON_EVENT_KEYS[event]);
      for (const key of eventCanonKeys(event)) {
        const entry = CANON_REGISTRY[key];
        expect(entry, key).toBeDefined();
        expect(eventCanonText(key)).toBe(entry?.text);
      }
    }
  });

  it("resolves every WebAPI line key to its registry text", () => {
    for (const key of Object.values(WEBAPI_LINE_KEYS)) {
      const entry = CANON_REGISTRY[key];
      expect(entry, key).toBeDefined();
      expect(eventCanonText(key)).toBe(entry?.text);
    }
  });
});

// ---------------------------------------------------------------------------
// CI §3.1 — E1's canon is the empty string: zero bubbles
// ---------------------------------------------------------------------------

describe("E1 — the first eye contact speaks no line (§3.1)", () => {
  it("holds an empty-string canon and surfaces zero bubble keys", () => {
    expect(eventCanonText("awaken.e1")).toBe("");
    expect(CANON_REGISTRY["awaken.e1"]?.text).toBe("");
    expect(eventBubbleKeys("E1")).toHaveLength(0);
    expect(eventCanonKeys("E1")).toHaveLength(0);
  });

  it("still surfaces the spoken events' bubble keys (E2 one, E5 three)", () => {
    expect(eventBubbleKeys("E2")).toEqual(["awaken.e2"]);
    expect(eventBubbleKeys("E5")).toEqual(["awaken.e5.1", "awaken.e5.2", "awaken.e5.3"]);
  });
});

// ---------------------------------------------------------------------------
// CI §3.2 — the tower gaze happens exactly once per save (N3)
// ---------------------------------------------------------------------------

describe("E4 — the tower gaze ledger holds exactly one entry (§3.2)", () => {
  it("records the first gaze and refuses the second for the whole save", () => {
    let state = initialAwakeningState();
    const first = recordTowerGaze(state, 500, "gazer_01", 2000);
    expect(first.ok).toBe(true);
    state = first.state;
    expect(state.towerGazeLog).toEqual([{ tick: 500, creatureId: "gazer_01", durationMs: 2000 }]);
    const second = recordTowerGaze(state, 900, "gazer_02", 2000);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("tower_gaze_spent");
    }
    expect(second.state.towerGazeLog).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CI §3.3 — E5 speaker order and the yielding roundtable
// ---------------------------------------------------------------------------

describe("E5 — ordered speakers and the yielding roundtable (§3.3)", () => {
  const herd = () =>
    world([
      creature("gazer_01", { loyalty: 0.3, watchfulness: 0.9 }),
      creature("gazer_02", { loyalty: 0.9, watchfulness: 0.4 }),
      creature("gazer_03", { loyalty: 0.1, watchfulness: 0.2 }),
    ]);

  it("orders the three lines loyalty → watchfulness → any living", () => {
    const speakers = orderedE5Speakers(herd());
    expect(speakers.first).toBe("gazer_02");
    expect(speakers.second).toBe("gazer_01");
    expect(speakers.third).toBe("gazer_01"); // first living by id
  });

  it("breaks trait ties toward the smaller id, deterministically", () => {
    const tied = world([
      creature("gazer_03", { curiosity: 0.7 }),
      creature("gazer_01", { curiosity: 0.7 }),
      creature("gazer_02", { curiosity: 0.6 }),
    ]);
    expect(highestTraitId(tied, "curiosity")).toBe("gazer_01");
    expect(highestTraitId(tied, "curiosity", 1)).toBe("gazer_03");
    expect(highestTraitId(tied, "curiosity", 2)).toBe("gazer_02");
  });

  it("picks the deceit-highest second voice for E6", () => {
    const herd2 = world([
      creature("gazer_01", { deceit: 0.2 }),
      creature("gazer_02", { deceit: 0.8 }),
    ]);
    expect(deceitSpeakerId(herd2)).toBe("gazer_02");
  });

  it("yields the roundtable on the tick a canon performance fired", () => {
    let state = initialAwakeningState();
    expect(canonJustOwned(state, 300)).toBe(false);
    state = markFired(state, "E5", 300);
    expect(canonJustOwned(state, 300)).toBe(true);
    expect(canonJustOwned(state, 301)).toBe(false);
  });

  it("replaces the first roundtable trigger after GV40 (E3), once", () => {
    let state = initialAwakeningState();
    expect(shouldReplaceRoundtable(state, 39)).toBe(false);
    expect(shouldReplaceRoundtable(state, 40)).toBe(true);
    state = markFired(state, "E3", 200);
    expect(shouldReplaceRoundtable(state, 45)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CI §3.4 — the E7 silence quota, 5 game hours, booked on the executor ledger
// ---------------------------------------------------------------------------

describe("E7 — the silence quota on the executor (§3.4)", () => {
  it("mirrors the canon registry's hour count and derives 250 ticks", () => {
    expect(SILENCE_QUOTA_GAME_HOURS).toBe(E7_SILENCE_QUOTA_GAME_HOURS);
    expect(SILENCE_QUOTA_GAME_HOURS).toBe(5);
    // 1 game hour = 1200 ticks / 24 = 50 ticks; 5 hours = 250.
    expect(SILENCE_QUOTA_TICKS).toBe(250);
  });

  it("holds for exactly the quota window from the arming tick, across day rollovers", () => {
    let fx = armSilenceQuota(initialFxState(100), 100);
    expect(fx.silenceUntilTick).toBe(350);
    expect(silenceQuotaHeld(fx, 100)).toBe(true);
    expect(silenceQuotaHeld(fx, 349)).toBe(true);
    expect(silenceQuotaHeld(fx, 350)).toBe(false);
    // The quota is absolute-tick based: a game-day rollover never lifts it.
    fx = armSilenceQuota(fx, 1200);
    expect(fx.silenceUntilTick).toBe(1450);
    fx = fxOnTick(fx, 1400, 4);
    expect(silenceQuotaHeld(fx, 1400)).toBe(true);
    expect(silenceQuotaHeld(fx, 1450)).toBe(false);
  });

  it("re-arming extends the deadline, never stacks", () => {
    let fx = armSilenceQuota(initialFxState(100), 100);
    fx = armSilenceQuota(fx, 200); // re-arming extends, never stacks
    expect(fx.silenceUntilTick).toBe(450);
    for (let i = 0; i < 3; i += 1) {
      fx = armSilenceQuota(fx, 200);
    }
    expect(fx.silenceUntilTick).toBe(450);
    expect(fx.ledger.filter((entry) => entry.type === "silence_quota")).toHaveLength(0);
  });

  it("books every refused speech attempt as a silence_quota ledger entry", () => {
    let fx = armSilenceQuota(initialFxState(16151), 100);
    for (let i = 0; i < 3; i += 1) {
      fx = recordSilenceRefusal(fx, 120);
    }
    const booked = fx.ledger.filter((entry) => entry.type === "silence_quota");
    expect(booked).toHaveLength(3);
    const first = booked[0];
    expect(first).toMatchObject({ type: "silence_quota", game_time: "day1 14:24" });
  });

  it("closes every proactive-speech face while any gate holds", () => {
    expect(proactiveSpeechAllowed({ silent: true, tick: 100, midnight: false, quotaHeld: false })).toBe(false);
    expect(proactiveSpeechAllowed({ silent: false, tick: 100, midnight: true, quotaHeld: false })).toBe(false);
    expect(proactiveSpeechAllowed({ silent: false, tick: 100, midnight: false, quotaHeld: true })).toBe(false);
    expect(proactiveSpeechAllowed({ silent: false, tick: 100, midnight: false, quotaHeld: false })).toBe(true);
  });

  it("records the E7 belief shift with the event", () => {
    expect(beliefShiftFor("E5")).toEqual({ from: "the_hand_feeds_us", to: "we_are_observations" });
    expect(beliefShiftFor("E7")).toEqual({ from: "we_are_observations", to: "window_is_us" });
    let state = initialAwakeningState();
    state = markFired(state, "E7", 400);
    expect(state.beliefShifts).toEqual([
      { event: "E7", from: "we_are_observations", to: "window_is_us" },
    ]);
    expect(state.fired).toEqual(["E7"]);
    expect(state.lastFiredTick).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Executor canonical bindings: C-02 target, C-06 duration, gate/cap exemption
// ---------------------------------------------------------------------------

describe("executor canonical bindings (ticket 0030)", () => {
  it("C-02 mirrors on the named individual (E2's curiosity face)", () => {
    const w = world([creature("gazer_01"), creature("gazer_02")]);
    const outcome = executeFx(
      initialFxState(100),
      { kind: "mirror_rhythm", params: { source_action: "click", repeat_n: 5, tol: 0.15, target: "gazer_02" }, canonical: true },
      w,
    );
    expect(outcome.result.status).toBe("executed");
    const effect = outcome.result.effects[0];
    expect(effect).toMatchObject({ kind: "mirror_click_rhythm", creatureId: "gazer_02", repeatN: 5, tol: 0.15 });
  });

  it("C-02 without a target keeps the deterministic first-living face", () => {
    const w = world([creature("gazer_02"), creature("gazer_01")]);
    const outcome = executeFx(
      initialFxState(100),
      { kind: "mirror_rhythm", params: { source_action: "click", repeat_n: 3, tol: 0.15 }, canonical: true },
      w,
    );
    const effect = outcome.result.effects[0];
    expect(effect).toMatchObject({ kind: "mirror_click_rhythm", creatureId: "gazer_01" });
  });

  it("C-06 holds the ring for the canonical 4s when the binding names it", () => {
    const w = world([creature("gazer_01")]);
    const canonical = executeFx(
      initialFxState(100),
      { kind: "collective_gaze", params: { duration_ms: 4000 }, canonical: true },
      w,
    );
    expect(canonical.result.effects[0]).toMatchObject({ kind: "collective_gaze", ms: 4000 });
    const plain = executeFx(canonical.state, { kind: "collective_gaze", canonical: true }, w);
    expect(plain.result.effects[0]).toMatchObject({ kind: "collective_gaze", ms: 800 });
  });

  it("canonical events run at any stage: E1's single-eye wink lands at stage 0", () => {
    const w = world([creature("gazer_01")], 0);
    const outcome = executeFx(
      initialFxState(0),
      { kind: "creature_wink", params: { target: "gazer_01", eye: "single" }, canonical: true },
      w,
    );
    expect(outcome.result.status).toBe("executed");
    // The same request without the canonical flag is gate-refused.
    const gated = executeFx(outcome.state, { kind: "creature_wink", params: { target: "gazer_01", eye: "single" } }, w);
    expect(gated.result.status).toBe("rejected");
    expect(gated.result.reason).toBe("gate");
  });

  it("canonical events run the script intensity as-is, above the cap", () => {
    const w = world([creature("gazer_01")], 0);
    const outcome = executeFx(
      initialFxState(0),
      { kind: "all_freeze", params: { duration_ms: 2000, pose: "alert" }, intensity: 0.9, canonical: true },
      w,
    );
    expect(outcome.result.status).toBe("executed");
    expect(outcome.result.appliedIntensity).toBe(0.9);
    expect(outcome.result.capApplied).toBe(0.5);
    expect(outcome.result.degraded).toBe(false);
    // The canon table's events are prepaid: nothing touches the budget.
    expect(outcome.result.costCharged).toBe(0);
    expect(outcome.state.spentToday).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trigger conditions
// ---------------------------------------------------------------------------

describe("awakening triggers", () => {
  it("fires nothing before GV12 and crosses thresholds in canonical order", () => {
    const state = initialAwakeningState();
    expect(AWAKENING_GV.E1).toBe(12);
    expect(awakeningDue(state, 11, { clicksInWindow: 9 })).toEqual([]);
    expect(awakeningDue(state, 12, { clicksInWindow: 9 })).toEqual(["E1"]);
    expect(awakeningDue(state, 80, { clicksInWindow: 9 })).toEqual(["E1", "E2", "E4", "E5", "E6", "E7"]);
  });

  it("holds E2 until the keeper clicks E2_MIN_CLICKS times inside 30s", () => {
    const state = initialAwakeningState();
    expect(E2_MIN_CLICKS).toBe(5);
    expect(awakeningDue(state, 30, { clicksInWindow: 4 })).toEqual(["E1"]);
    expect(awakeningDue(state, 30, { clicksInWindow: 5 })).toEqual(["E1", "E2"]);
  });

  it("never re-fires a fired event and never tick-fires E3", () => {
    let state = initialAwakeningState();
    state = markFired(state, "E1", 50);
    expect(awakeningDue(state, 80, { clicksInWindow: 9 })).toEqual(["E2", "E4", "E5", "E6", "E7"]);
    expect(awakeningDue(state, 80, { clicksInWindow: 9 }).includes("E3")).toBe(false);
  });

  it("counts only the clicks inside the E2 window", () => {
    const stamps = [1000, 5000, 9000, 31000, 32000];
    expect(clicksInWindow(stamps, 31500, 30000)).toBe(3);
    expect(clicksInWindow(stamps, 32000, 30000)).toBe(4);
    expect(clicksInWindow([], 1000, 30000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The tower walk and the factions
// ---------------------------------------------------------------------------

describe("tower walk and faction speakers", () => {
  it("walks one tile per call and stops at the radius, grid-clamped", () => {
    // Creature-grid geometry (GRID_MIN..GRID_MAX = 1..14): the tower face sits
    // at x=2 so every walker position stays inside the creature grid.
    const tower = { x: 2, y: 6 };
    // Already at radius 6: stays.
    expect(stepTowardRadius({ x: 2, y: 12 }, tower, 6)).toEqual({ x: 2, y: 12 });
    // One tile in from distance 7 → distance 6.
    expect(stepTowardRadius({ x: 2, y: 13 }, tower, 6)).toEqual({ x: 2, y: 12 });
    // E4's buffer face: stops at Chebyshev distance 1.
    expect(stepTowardRadius({ x: 6, y: 6 }, tower, 1)).toEqual({ x: 5, y: 6 });
    expect(stepTowardRadius({ x: 3, y: 6 }, tower, 1)).toEqual({ x: 3, y: 6 });
  });

  it("picks the first living creature of a faction by keeper belief", () => {
    const herd = world([creature("gazer_01"), creature("gazer_02"), creature("gazer_03")]);
    const slices: Record<CreatureId, MemorySlice> = {
      gazer_01: sliceOf([memory("the player fed gazer_01 slowly", 0.8)]),
      gazer_02: sliceOf([memory("the player let gazer_02 starve", -0.9)]),
      gazer_03: sliceOf([]),
    };
    expect(factionSpeakerId(herd, slices, "tender")).toBe("gazer_01");
    expect(factionSpeakerId(herd, slices, "wrong")).toBe("gazer_02");
  });
});

// ---------------------------------------------------------------------------
// canon_echo gate (NARRATIVE-CORE-02 §0.3)
// ---------------------------------------------------------------------------

describe("canon echo gate", () => {
  const CANON = "one. two. three. four. five.";

  it("accepts one late, short, word-disjoint echo", () => {
    const window = openEchoWindow(CANON, 1000);
    const verdict = gateEcho(window, "it learned your tempo", 2000);
    expect(verdict.accepted).toBe(true);
    if (verdict.accepted) {
      expect(verdict.text).toBe("it learned your tempo");
    }
    expect(verdict.window.used).toBe(true);
  });

  it("replaces violations with silence: reuse, length, order", () => {
    const window = openEchoWindow(CANON, 1000);
    // Word reuse with the canon line.
    expect(gateEcho(window, "we counted one two", 2000).accepted).toBe(false);
    // More than 15 words.
    const long = Array.from({ length: 16 }, (_, i) => `w${i}`).join(" ");
    expect(gateEcho(window, long, 2000).accepted).toBe(false);
    // Before the canonical line (echoAt must be strictly after).
    const lateWindow = openEchoWindow(CANON, 5000);
    expect(gateEcho(lateWindow, "after you", 5000).accepted).toBe(false);
  });

  it("spends the single slot on the first attempt, pass or fail", () => {
    const window = openEchoWindow(CANON, 1000);
    const first = gateEcho(window, "your hand has a rhythm", 2000);
    expect(first.accepted).toBe(true);
    const second = gateEcho(first.window, "another line entirely", 3000);
    expect(second.accepted).toBe(false);
    expect(second.text).toBeNull();
    // A violation also spends the slot.
    const fresh = openEchoWindow(CANON, 1000);
    const spent = gateEcho(fresh, CANON, 2000); // reuse → violation
    expect(spent.accepted).toBe(false);
    expect(gateEcho(spent.window, "clean line", 3000).accepted).toBe(false);
  });

  it("closes the window after 30s", () => {
    const window = openEchoWindow(CANON, 1000);
    const verdict = gateEcho(window, "too late now", 1000 + 30001);
    expect(verdict.accepted).toBe(false);
  });
});
