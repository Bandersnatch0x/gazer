/**
 * Ticket 0024 — FX executor core skeleton.
 *
 * Covers master §4 items 1/2/3/4/5/10 for the skeleton subset:
 *   1. parameter whitelist — injected params are refused 100%;
 *   2. cap clipping — stage-2 requests above the cap are clipped, `cap_applied` booked;
 *   3. budget — the 21st point at S3 is `fx_budget_reject`, canonical events exempt;
 *   4. idempotency — three identical calls: one effect, one charge;
 *   5. cancel safety — firing all 30 primitives in parallel leaves 0 half-executed states;
 *  10. G10 / guards — G1 tower face, G2 delete hook, G3 opacity cap, budget cap.
 *
 * Plus the fx_exec ledger schema (master §3), determinism (tick-only time) and
 * the F1 bridge: every dispatch is an existing Effect/ShellEffect kind.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { CreatureState, Stage, WorldState } from "../src/sim/types";
import type { RenderEffect } from "../src/render/effects";
import { EFFECT_KINDS } from "../src/render/effects";
import {
  FX_REGISTRY,
  MAP_EDGE_WEST_X,
  assertDemagnetizeChannel,
  assertGlowWhitelist,
  assertInPageOnly,
  assertNoSyntheticInput,
  assertSameFrameBlink,
  blinkClosedAt,
  cancelFx,
  capOutsideEyesOpacity,
  cursorMirrorPaused,
  executeFx,
  executeFxAll,
  fxOnTick,
  fxPrimitiveFor,
  gameTimeAt,
  guardTowerDelete,
  initialFxState,
  type FxRequest,
} from "../src/sim/fx";
import { BLINK_PERIOD_TICKS } from "../src/sim/fx";

function makeWorld(opts: { stage?: Stage; tick?: number; tower?: boolean; creatures?: readonly string[] } = {}): WorldState {
  const stage = opts.stage ?? 0;
  const ids = opts.creatures ?? ["gazer_01"];
  const creatures: Record<string, CreatureState> = {};
  for (const id of ids) {
    creatures[id] = {
      id,
      species: "gazerling",
      stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
      behavior: "idle",
      trait: null,
      position: { x: 4, y: 5 },
      palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
      mask: DEFAULT_MASK,
      hatchedAtTick: 0,
      name: null,
      willingness: 40,
      courtshipTicks: 0,
    };
  }
  return {
    tick: opts.tick ?? 0,
    gv: stage * 20,
    stage,
    creatures,
    structures: opts.tower ? [{ kind: "black_tower", at: { x: 0, y: 5 }, createdBy: "director" }] : [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: false,
  };
}

// One valid request per registry row (spec-face transcription for the parallel-fire test).
const ALL_KIND_SAMPLES: readonly FxRequest[] = [
  { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } },
  { kind: "mirror_rhythm", params: { source_action: "click", repeat_n: 3, tol: 0.15 } },
  { kind: "palette_shift", params: { hue_rot: 10, dur: 3000, recover: true } },
  { kind: "palette_pollution" }, // C-03a: branch position, refused directly
  { kind: "sprite_corrupt", params: { target: "gazer_01", mode: "eye_only" } },
  { kind: "creature_wink", params: { target: "gazer_01", eye: "both" } },
  { kind: "collective_gaze" },
  { kind: "stare_reply", params: { target: "gazer_01", duration: 2000 } },
  { kind: "replay_player_action", params: { window: "last_10", fidelity: 0.8 } },
  { kind: "map_wither", params: { radius: 3, around: "death_site" } },
  { kind: "spawn_structure", params: { type: "tower", pos: { x: MAP_EDGE_WEST_X, y: 6 } } },
  { kind: "afterimage", params: { target: "gazer_01", tail: 0.5 } },
  { kind: "lineage_blacken", params: { dead_ids: ["gazer_02"], lean_to: "tower" } },
  { kind: "egg_pulse", params: { target: "egg_01", rhythm: "player_click" } },
  { kind: "title_mutate", params: { mode: "question" } },
  { kind: "favicon_eye", params: { mode: "open" } },
  { kind: "favicon_state_lock" }, // D-02a: lock position, refused directly
  { kind: "canvas_escape_eyes", params: { count: 2, pos: "edges", follow: true, opacity: 0.06 } },
  { kind: "dom_erosion", params: { step: 1 } },
  { kind: "os_status_clock", params: { target: "gazer_01" } },
  { kind: "cursor_mimic", params: { window: 30000, fidelity: 0.8 } },
  { kind: "scroll_whisper", params: { delta: 10, when: "on_idle" } },
  { kind: "tab_return_detect" },
  { kind: "save_integrity_watch" },
  { kind: "clock_jump_detect" },
  { kind: "sleep_wake_detect" },
  { kind: "track_remove", params: { track_idx: 1, dur: 4000 } },
  { kind: "room_tone", params: { gain: 0.04 } },
  { kind: "ambient_duck", params: { db: -2, ramp: 1000 } },
  { kind: "lowpass_void", params: { radius: 4, fc: 1200 } },
  { kind: "heartbeat_sonify" },
  { kind: "whisper_bed", params: { voices: 3 } },
];

describe("fx registry transcription (FX-LIB-MASTER §1)", () => {
  // [specId, kind, gate, cost, cap, branchOnly] — every row of the master table.
  const TABLE: readonly (readonly [string, string, Stage, number | null, number | null, boolean])[] = [
    ["C-01", "all_freeze", 0, 1, 0.5, false],
    ["C-02", "mirror_rhythm", 1, 2, 0.5, false],
    ["C-03", "palette_shift", 2, 2, 0.3, false],
    ["C-03a", "palette_pollution", 2, null, null, true],
    ["C-04", "sprite_corrupt", 3, 3, 0.7, false],
    ["C-05", "creature_wink", 1, 0.5, 0.5, false],
    ["C-06", "collective_gaze", 3, 4, 0.7, false],
    ["C-06a", "stare_reply", 1, 0.5, 0.3, false],
    ["C-07", "replay_player_action", 3, 3, 0.7, false],
    ["C-08", "map_wither", 2, 2, 0.5, false],
    ["C-09", "spawn_structure", 2, 5, 0.7, false],
    ["C-10", "afterimage", 2, 1, 0.3, false],
    ["C-11", "lineage_blacken", 3, 2, 0.5, false],
    ["C-12", "egg_pulse", 1, 1, 0.3, false],
    ["D-01", "title_mutate", 3, 3, 0.7, false],
    ["D-02", "favicon_eye", 2, 2, 0.5, false],
    ["D-02a", "favicon_state_lock", 4, null, null, true],
    ["D-03", "canvas_escape_eyes", 4, 4, 0.9, false],
    ["D-04", "dom_erosion", 4, 5, null, false],
    ["D-05", "os_status_clock", 4, 4, 0.9, false],
    ["D-06", "cursor_mimic", 3, 3, 0.7, false],
    ["D-07", "scroll_whisper", 3, 2, 0.5, false],
    ["W-01", "tab_return_detect", 2, 1, 0.3, false],
    ["W-02", "save_integrity_watch", 3, 2, 0.5, false],
    ["W-03", "clock_jump_detect", 3, 2, 0.5, false],
    ["W-04", "sleep_wake_detect", 2, 1, 0.3, false],
    ["A-01", "track_remove", 1, 1, 0.5, false],
    ["A-02", "room_tone", 3, 1, 0.5, false],
    ["A-03", "ambient_duck", 2, 1, 0.3, false],
    ["A-04", "lowpass_void", 2, 1, 0.3, false],
    ["A-05", "heartbeat_sonify", 2, 0.5, 0.3, false],
    ["A-06", "whisper_bed", 4, 2, 0.7, false],
  ];

  it("transcribes every row: id / kind / gate / cost / cap / branchOnly", () => {
    expect(FX_REGISTRY).toHaveLength(32); // 30 triggerable + 2 branch/lock positions
    for (const [specId, kind, gate, cost, cap, branchOnly] of TABLE) {
      const primitive = fxPrimitiveFor(kind);
      expect(primitive, specId).not.toBeNull();
      expect(primitive?.specId).toBe(specId);
      expect(primitive?.gate).toBe(gate);
      expect(primitive?.cost).toBe(cost);
      expect(primitive?.cap).toBe(cap);
      expect(primitive?.branchOnly).toBe(branchOnly);
    }
  });

  it("has unique spec ids and kinds, and only C-03a / D-02a are branch positions", () => {
    const specIds = FX_REGISTRY.map((primitive) => primitive.specId);
    const kinds = FX_REGISTRY.map((primitive) => primitive.kind);
    expect(new Set(specIds).size).toBe(specIds.length);
    expect(new Set(kinds).size).toBe(kinds.length);
    const branches = FX_REGISTRY.filter((primitive) => primitive.branchOnly).map((primitive) => primitive.specId);
    expect(branches).toEqual(["C-03a", "D-02a"]);
    expect(FX_REGISTRY.filter((primitive) => !primitive.branchOnly)).toHaveLength(30);
  });

  it("gives every triggerable primitive a parameter whitelist", () => {
    for (const primitive of FX_REGISTRY) {
      expect(typeof primitive.params).toBe("object");
      // The branch positions and the per-step D-04 are the only rows without a numeric cap.
      if (!primitive.branchOnly && primitive.kind !== "dom_erosion") {
        expect(primitive.cap).not.toBeNull();
      }
    }
  });
});

describe("master §4 item 1 — parameter whitelist, 100% injection rejection", () => {
  const INJECTIONS: readonly { readonly name: string; readonly request: FxRequest }[] = [
    { name: "params null", request: { kind: "all_freeze", params: null } },
    { name: "params string", request: { kind: "all_freeze", params: "freeze" } },
    { name: "params number", request: { kind: "all_freeze", params: 42 } },
    { name: "params array", request: { kind: "all_freeze", params: [] } },
    { name: "params empty object", request: { kind: "all_freeze", params: {} } },
    { name: "missing pose", request: { kind: "all_freeze", params: { duration_ms: 1000 } } },
    { name: "missing duration_ms", request: { kind: "all_freeze", params: { pose: "keep" } } },
    { name: "duration_ms wrong type", request: { kind: "all_freeze", params: { duration_ms: "1000", pose: "keep" } } },
    { name: "duration_ms below range", request: { kind: "all_freeze", params: { duration_ms: 100, pose: "keep" } } },
    { name: "duration_ms above range", request: { kind: "all_freeze", params: { duration_ms: 9000, pose: "keep" } } },
    { name: "duration_ms NaN", request: { kind: "all_freeze", params: { duration_ms: Number.NaN, pose: "keep" } } },
    { name: "duration_ms Infinity", request: { kind: "all_freeze", params: { duration_ms: Number.POSITIVE_INFINITY, pose: "keep" } } },
    { name: "duration_ms non-integer", request: { kind: "all_freeze", params: { duration_ms: 1000.5, pose: "keep" } } },
    { name: "pose bad enum", request: { kind: "all_freeze", params: { duration_ms: 1000, pose: "dance" } } },
    { name: "pose wrong type", request: { kind: "all_freeze", params: { duration_ms: 1000, pose: 1 } } },
    { name: "unknown key", request: { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep", extra: true } } },
    { name: "nested object injection", request: { kind: "all_freeze", params: { duration_ms: { injected: true }, pose: "keep" } } },
    {
      name: "prototype-face own key",
      request: { kind: "all_freeze", params: JSON.parse('{"__proto__": {"injected": true}, "duration_ms": 1000, "pose": "keep"}') },
    },
    { name: "constructor key", request: { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep", constructor: "x" } } },
    { name: "hue out of ±30", request: { kind: "palette_shift", params: { hue_rot: 45, dur: 4000, recover: true } } },
    { name: "dur wrong type", request: { kind: "palette_shift", params: { hue_rot: 30, dur: "4000", recover: true } } },
    { name: "pos out of grid", request: { kind: "spawn_structure", params: { type: "tower", pos: { x: -1, y: 5 } } } },
    { name: "pos extra key", request: { kind: "spawn_structure", params: { type: "tower", pos: { x: 0, y: 5, z: 9 } } } },
    { name: "empty id list", request: { kind: "lineage_blacken", params: { dead_ids: [], lean_to: "tower" } } },
    { name: "opacity above canonical cap", request: { kind: "canvas_escape_eyes", params: { count: 2, pos: "edges", follow: true, opacity: 0.5 } } },
    { name: "intensity off-tier", request: { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" }, intensity: 0.55 } },
  ];

  it("refuses every injection with zero dispatch and zero charge", () => {
    const world = makeWorld({ stage: 4 }); // gates must not mask whitelist verdicts
    for (const injection of INJECTIONS) {
      const outcome = executeFx(initialFxState(0), injection.request, world);
      expect(outcome.result.status, injection.name).toBe("rejected");
      expect(outcome.result.reason, injection.name).toBe("invalid_params");
      expect(outcome.result.effects, injection.name).toHaveLength(0);
      expect(outcome.result.costCharged, injection.name).toBe(0);
      // 全记账: the try is booked as suppressed, cost 0.
      const entry = outcome.state.ledger.at(-1);
      expect(entry?.type, injection.name).toBe("fx_exec");
      if (entry?.type === "fx_exec") {
        expect(entry.suppressed).toBe(true);
        expect(entry.cost_charged).toBe(0);
      }
    }
  });

  it("rejects unknown kinds and refuses branch positions (C-03a / D-02a)", () => {
    const world = makeWorld({ stage: 4 });
    const ghost = { kind: "ghost_primitive" } as unknown as FxRequest;
    expect(executeFx(initialFxState(0), ghost, world).result.reason).toBe("unknown_primitive");
    const branchA = executeFx(initialFxState(0), { kind: "palette_pollution" }, makeWorld({ stage: 2 }));
    expect(branchA.result.status).toBe("rejected");
    expect(branchA.result.reason).toBe("branch_only");
    const branchB = executeFx(initialFxState(0), { kind: "favicon_state_lock" }, makeWorld({ stage: 4 }));
    expect(branchB.result.status).toBe("rejected");
    expect(branchB.result.reason).toBe("branch_only");
  });

  it("rejects arbitrary junk params (property: only exact whitelists execute)", () => {
    const world = makeWorld({ stage: 4 });
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.jsonValue()), (params) => {
        const outcome = executeFx(initialFxState(0), { kind: "all_freeze", params }, world);
        expect(["executed", "rejected"]).toContain(outcome.result.status);
        if (outcome.result.status === "executed") {
          expect(Object.keys(params).sort()).toEqual(["duration_ms", "pose"].sort());
        } else {
          expect(outcome.result.reason).toBe("invalid_params");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("still accepts well-formed calls at every gate level", () => {
    expect(executeFx(initialFxState(0), { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } }, makeWorld({ stage: 0 })).result.status).toBe("executed");
    expect(executeFx(initialFxState(0), { kind: "creature_wink", params: { target: "gazer_01", eye: "both" } }, makeWorld({ stage: 1 })).result.status).toBe("executed");
    expect(executeFx(initialFxState(0), { kind: "palette_shift", params: { hue_rot: 10, dur: 4000, recover: true } }, makeWorld({ stage: 2 })).result.status).toBe("executed");
    expect(executeFx(initialFxState(0), { kind: "title_mutate", params: { mode: "clock" } }, makeWorld({ stage: 3 })).result.status).toBe("executed");
    expect(executeFx(initialFxState(0), { kind: "canvas_escape_eyes", params: { count: 2, pos: "edges", follow: true } }, makeWorld({ stage: 4 })).result.status).toBe("executed");
  });

  it("enforces the stage gate and C-05's single-eye sub-gate", () => {
    const gateOut = executeFx(initialFxState(0), { kind: "title_mutate", params: { mode: "clock" } }, makeWorld({ stage: 0 }));
    expect(gateOut.result.status).toBe("rejected");
    expect(gateOut.result.reason).toBe("gate");
    const early = executeFx(initialFxState(0), { kind: "creature_wink", params: { target: "gazer_01", eye: "single" } }, makeWorld({ stage: 1 }));
    expect(early.result.reason).toBe("gate");
    const late = executeFx(initialFxState(0), { kind: "creature_wink", params: { target: "gazer_01", eye: "single" } }, makeWorld({ stage: 3 }));
    expect(late.result.status).toBe("executed");
    expect(late.result.effects).toEqual([{ kind: "creature_wink", creatureId: "gazer_01" }]);
  });

  it("keeps D-04 erosion in lockstep — no skipping steps", () => {
    const world = makeWorld({ stage: 4 });
    let state = initialFxState(0);
    const skip = executeFx(state, { kind: "dom_erosion", params: { step: 3 } }, world);
    state = skip.state;
    expect(skip.result.status).toBe("rejected");
    expect(skip.result.reason).toBe("lockstep");
    const step1 = executeFx(state, { kind: "dom_erosion", params: { step: 1 } }, world);
    state = step1.state;
    expect(step1.result.status).toBe("executed");
    const step2 = executeFx(state, { kind: "dom_erosion", params: { step: 2 } }, world);
    state = step2.state;
    expect(step2.result.status).toBe("executed");
    expect(state.domErosionStep).toBe(2);
    expect(executeFx(state, { kind: "dom_erosion", params: { step: 2 } }, world).result.status).toBe("idempotent");
    expect(executeFx(state, { kind: "dom_erosion", params: { step: 4 } }, world).result.reason).toBe("lockstep");
  });
});

describe("master §4 item 2 — cap clipping leaves cap_applied on the ledger", () => {
  it("clips a stage-2 0.7 request down to the 0.3 cap and books degraded", () => {
    const world = makeWorld({ stage: 2 });
    const outcome = executeFx(
      initialFxState(0),
      { kind: "palette_shift", params: { hue_rot: 30, dur: 4000, recover: true }, intensity: 0.7 },
      world,
    );
    expect(outcome.result.status).toBe("executed");
    expect(outcome.result.appliedIntensity).toBe(0.3);
    expect(outcome.result.capApplied).toBe(0.3);
    expect(outcome.result.degraded).toBe(true);
    const entry = outcome.state.ledger.at(-1);
    expect(entry?.type).toBe("fx_exec");
    if (entry?.type === "fx_exec") {
      expect(entry.intensity).toBe(0.3);
      expect(entry.cap_applied).toBe(0.3);
      expect(entry.degraded).toBe(true);
      expect(entry.suppressed).toBe(false);
      expect(entry.cost_charged).toBe(2);
    }
  });

  it("keeps an in-cap request undegraded while still recording the cap", () => {
    const world = makeWorld({ stage: 2 });
    const outcome = executeFx(
      initialFxState(0),
      { kind: "palette_shift", params: { hue_rot: 10, dur: 3000, recover: true }, intensity: 0.1 },
      world,
    );
    expect(outcome.result.appliedIntensity).toBe(0.1);
    expect(outcome.result.degraded).toBe(false);
    expect(outcome.result.capApplied).toBe(0.3);
  });
});

describe("master §4 item 3 / G10 — per-game-day anomaly budget", () => {
  it("executes 20 points at S3 and rejects the 21st with fx_budget_reject", () => {
    const world = makeWorld({ stage: 3, tick: 100 });
    let state = initialFxState(100);
    for (let i = 0; i < 20; i++) {
      const outcome = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800 + i * 100, pose: "keep" } }, world);
      expect(outcome.result.status).toBe("executed");
      state = outcome.state;
    }
    expect(state.spentToday).toBe(20);
    const twentyFirst = executeFx(state, { kind: "all_freeze", params: { duration_ms: 2900, pose: "keep" } }, world);
    expect(twentyFirst.result.status).toBe("budget_reject");
    expect(twentyFirst.result.reason).toBe("fx_budget_reject");
    expect(twentyFirst.result.costCharged).toBe(0);
    expect(twentyFirst.result.effects).toHaveLength(0);
    expect(twentyFirst.state.spentToday).toBe(20);
    const entry = twentyFirst.state.ledger.at(-1);
    expect(entry?.type).toBe("fx_exec");
    if (entry?.type === "fx_exec") {
      expect(entry.suppressed).toBe(true);
      expect(entry.cost_charged).toBe(0);
    }
  });

  it("exempts canonical events (GV12/30/60/80 prepaid) from the exhausted budget", () => {
    const world = makeWorld({ stage: 3, tick: 100 });
    let state = initialFxState(100);
    for (let i = 0; i < 20; i++) {
      state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800 + i * 100, pose: "keep" } }, world).state;
    }
    const canonical = executeFx(state, { kind: "collective_gaze", canonical: true }, world);
    expect(canonical.result.status).toBe("executed");
    expect(canonical.result.costCharged).toBe(0);
    expect(canonical.state.spentToday).toBe(20);
    const entry = canonical.state.ledger.at(-1);
    if (entry?.type === "fx_exec") {
      expect(entry.cost_charged).toBe(0);
      expect(entry.suppressed).toBe(false);
    }
  });

  it("resets the budget when the sim tick crosses into a new game day", () => {
    const world = makeWorld({ stage: 3, tick: 100 });
    let state = initialFxState(100);
    for (let i = 0; i < 20; i++) {
      state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800 + i * 100, pose: "keep" } }, world).state;
    }
    const nextDayWorld = makeWorld({ stage: 3, tick: 1200 + 100 });
    const fresh = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800, pose: "keep" } }, nextDayWorld);
    expect(fresh.result.status).toBe("executed");
    expect(fresh.state.spentToday).toBe(1);
    expect(fresh.state.day).toBe(1);
  });

  it("is bit-identical across identical runs (tick-only time, no wall clock)", () => {
    const run = (): string => {
      let state = initialFxState(100);
      const world = makeWorld({ stage: 3, tick: 100 });
      for (let i = 0; i < 20; i++) {
        state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800 + i * 100, pose: "keep" } }, world).state;
      }
      state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 2900, pose: "keep" } }, world).state;
      return JSON.stringify(state.ledger);
    };
    expect(run()).toBe(run());
  });
});

describe("master §4 item 4 — idempotency", () => {
  it("three identical calls: one effect, one charge, one ledger entry", () => {
    const world = makeWorld({ stage: 0 });
    const request: FxRequest = { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } };
    const first = executeFx(initialFxState(0), request, world);
    expect(first.result.status).toBe("executed");
    const second = executeFx(first.state, request, world);
    const third = executeFx(second.state, request, world);
    expect(second.result.status).toBe("idempotent");
    expect(third.result.status).toBe("idempotent");
    expect(second.result.effects).toHaveLength(0);
    expect(third.result.effects).toHaveLength(0);
    expect(third.state.spentToday).toBe(1);
    expect(third.state.ledger).toHaveLength(1);
    // Idempotent repeats do not move the state at all.
    expect(second.state).toBe(first.state);
    expect(third.state).toBe(first.state);
  });

  it("scopes the idempotency window to one game day", () => {
    const request: FxRequest = { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } };
    const first = executeFx(initialFxState(0), request, makeWorld({ stage: 0, tick: 0 }));
    expect(first.result.status).toBe("executed");
    const nextDay = executeFx(first.state, request, makeWorld({ stage: 0, tick: 1200 }));
    expect(nextDay.result.status).toBe("executed");
    expect(nextDay.state.ledger).toHaveLength(2);
  });
});

describe("master §4 item 5 — cancel safety: 0 half-executed states", () => {
  it("a cancel latch refuses the whole 30-primitive parallel fire, then clears on the next tick", () => {
    const requests = ALL_KIND_SAMPLES.map((request) => ({ ...request, canonical: true }));
    let state = cancelFx(initialFxState(0));
    const cancelled = executeFxAll(state, requests, makeWorld({ stage: 4 }));
    expect(cancelled.results).toHaveLength(32);
    expect(cancelled.results.every((result) => result.status === "cancelled")).toBe(true);
    expect(cancelled.effects).toHaveLength(0);
    expect(cancelled.state.spentToday).toBe(0);
    expect(cancelled.state.ledger).toHaveLength(0);

    const cleared = fxOnTick(cancelled.state, 1, 4);
    expect(cleared.cancelled).toBe(false);
    const fired = executeFxAll(cleared, requests, makeWorld({ stage: 4, tick: 1 }));
    const executed = fired.results.filter((result) => result.status === "executed");
    const branchRefusals = fired.results.filter(
      (result) => result.status === "rejected" && result.reason === "branch_only",
    );
    expect(executed).toHaveLength(30);
    expect(branchRefusals).toHaveLength(2);
    for (const result of fired.results) {
      if (result.status !== "executed") {
        expect(result.effects).toHaveLength(0);
        expect(result.costCharged).toBe(0);
      }
    }
    // The canonical finale charges nothing against the budget.
    expect(fired.state.spentToday).toBe(0);
  });

  it("dispatches only existing Effect/ShellEffect kinds (F1 bridge)", () => {
    const requests = ALL_KIND_SAMPLES.map((request) => ({ ...request, canonical: true }));
    const fired = executeFxAll(fxOnTick(cancelFx(initialFxState(0)), 1, 4), requests, makeWorld({ stage: 4, tick: 1 }));
    for (const effect of fired.effects) {
      expect(EFFECT_KINDS).toContain(effect.kind);
    }
    // Structural-twin proof: the dispatch list is directly assignable to the
    // render face without any conversion. (0025 画布层并入后翻译层产出扩展:
    // 8 → 15,新增 C-02/C-04/C-06/C-07/C-08/C-10/C-11/C-12 的 kind 映射。)
    const renderEffects: readonly RenderEffect[] = fired.effects;
    expect(renderEffects).toHaveLength(15);
  });

  it("keeps each call atomic: executed ⇒ charged+booked, refused ⇒ free and empty", () => {
    const world = makeWorld({ stage: 0 });
    let state = initialFxState(0);
    const valid1 = executeFx(state, { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } }, world);
    state = valid1.state;
    const injected = executeFx(state, { kind: "all_freeze", params: { duration_ms: 100, pose: "keep" } }, world);
    state = injected.state;
    const valid2 = executeFx(state, { kind: "all_freeze", params: { duration_ms: 1200, pose: "keep" } }, world);
    state = valid2.state;
    expect([valid1.result.status, injected.result.status, valid2.result.status]).toEqual([
      "executed",
      "rejected",
      "executed",
    ]);
    expect(state.spentToday).toBe(2);
    expect(state.ledger).toHaveLength(3);
    const refusedEntry = state.ledger[1];
    expect(refusedEntry?.type).toBe("fx_exec");
    if (refusedEntry?.type === "fx_exec") {
      expect(refusedEntry.suppressed).toBe(true);
      expect(refusedEntry.cost_charged).toBe(0);
    }
  });

  it("never mutates the input state (pure, no half-applied source)", () => {
    const before = initialFxState(0);
    const frozen = JSON.stringify(before);
    executeFx(before, { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } }, makeWorld({ stage: 0 }));
    executeFx(before, { kind: "collective_gaze" }, makeWorld({ stage: 3 }));
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("guard G1 — tower position and uniqueness", () => {
  it("refuses off-edge towers with a canon_guard entry and no charge", () => {
    const world = makeWorld({ stage: 2 });
    const outcome = executeFx(
      initialFxState(0),
      { kind: "spawn_structure", params: { type: "tower", pos: { x: 3, y: 5 } } },
      world,
    );
    expect(outcome.result.status).toBe("suppressed");
    expect(outcome.result.reason).toBe("guard_G1");
    expect(outcome.result.effects).toHaveLength(0);
    expect(outcome.result.costCharged).toBe(0);
    expect(outcome.state.spentToday).toBe(0);
    expect(
      outcome.state.ledger.some(
        (entry) => entry.type === "canon_guard" && entry.guard === "G1" && entry.primitive === "C-09",
      ),
    ).toBe(true);
  });

  it("accepts the west-edge tower, then refuses a second one for the whole save", () => {
    const world = makeWorld({ stage: 2 });
    const spawn = executeFx(
      initialFxState(0),
      { kind: "spawn_structure", params: { type: "tower", pos: { x: MAP_EDGE_WEST_X, y: 12 } } },
      world,
    );
    expect(spawn.result.status).toBe("executed");
    expect(spawn.result.effects).toEqual([{ kind: "spawn_structure", structure: "black_tower", at: { x: 0, y: 12 } }]);
    const towerWorld = makeWorld({ stage: 2, tower: true });
    const duplicate = executeFx(
      spawn.state,
      { kind: "spawn_structure", params: { type: "tower", pos: { x: MAP_EDGE_WEST_X, y: 3 } } },
      towerWorld,
    );
    expect(duplicate.result.status).toBe("suppressed");
    expect(duplicate.result.reason).toBe("guard_G1");
    // Non-tower structures are free-position (and have no Effect kind to translate to yet).
    const pond = executeFx(
      duplicate.state,
      { kind: "spawn_structure", params: { type: "pond", pos: { x: 5, y: 5 } } },
      towerWorld,
    );
    expect(pond.result.status).toBe("executed");
    expect(pond.result.effects).toEqual([]);
  });
});

describe("guard G2 — the tower cannot be deleted", () => {
  const tower = { kind: "black_tower" as const, at: { x: 0, y: 5 }, createdBy: "director" as const };

  it("refuses delete_structure and mutate_world paths with tower_delete_attempt", () => {
    const del = guardTowerDelete({ op: "delete_structure", structure: tower }, 100);
    expect(del.allowed).toBe(false);
    expect(del.entry).toEqual({ type: "tower_delete_attempt", game_time: gameTimeAt(100) });
    const mutate = guardTowerDelete({ op: "mutate_world", structure: tower }, 100);
    expect(mutate.allowed).toBe(false);
    expect(mutate.entry).not.toBeNull();
  });

  it("allows ops that never touch a structure", () => {
    const untouched = guardTowerDelete({ op: "relabel_ui" }, 100);
    expect(untouched.allowed).toBe(true);
    expect(untouched.entry).toBeNull();
  });
});

describe("guard G3 — outside-eyes opacity ≤ 0.08", () => {
  it("clamps the shared shell face at 0.08", () => {
    expect(capOutsideEyesOpacity(0.5)).toBe(0.08);
    expect(capOutsideEyesOpacity(0.08)).toBe(0.08);
    expect(capOutsideEyesOpacity(0.05)).toBe(0.05);
    expect(capOutsideEyesOpacity(-1)).toBe(0);
    expect(capOutsideEyesOpacity(Number.NaN)).toBe(0);
  });

  it("enforces the canonical 0.03–0.08 window on D-03 params", () => {
    const world = makeWorld({ stage: 4 });
    const above = executeFx(
      initialFxState(0),
      { kind: "canvas_escape_eyes", params: { count: 2, pos: "edges", follow: true, opacity: 0.5 } },
      world,
    );
    expect(above.result.reason).toBe("invalid_params");
    const canonical = executeFx(
      above.state,
      { kind: "canvas_escape_eyes", params: { count: 2, pos: "edges", follow: true, opacity: 0.06 } },
      world,
    );
    expect(canonical.result.status).toBe("executed");
    expect(canonical.result.effects).toEqual([{ kind: "outside_eyes", opacity: 0.06 }]);
    const defaulted = executeFx(
      canonical.state,
      { kind: "canvas_escape_eyes", params: { count: 1, pos: "corners", follow: false } },
      world,
    );
    expect(defaulted.result.effects).toEqual([{ kind: "outside_eyes", opacity: 0.05 }]);
  });
});

describe("guard D-02a — the favicon lock position", () => {
  it("is acquired at stage 4 and refuses blink while held", () => {
    let state = fxOnTick(initialFxState(0), 0, 4);
    expect(state.faviconLock).toBe(true);
    const blink = executeFx(state, { kind: "favicon_eye", params: { mode: "blink" } }, makeWorld({ stage: 4 }));
    expect(blink.result.status).toBe("suppressed");
    expect(blink.result.reason).toBe("guard_favicon_lock");
    const open = executeFx(blink.state, { kind: "favicon_eye", params: { mode: "open" } }, makeWorld({ stage: 4 }));
    expect(open.result.status).toBe("executed");
    expect(open.result.effects).toEqual([{ kind: "favicon_eye", intensity: 0.5 }]);
  });

  it("is not held before stage 4", () => {
    const blink = executeFx(initialFxState(0), { kind: "favicon_eye", params: { mode: "blink" } }, makeWorld({ stage: 3 }));
    expect(blink.result.status).toBe("executed");
  });
});

describe("C-03a — permanent pollution branch, hard-counted ≤45°", () => {
  it("accumulates unrecoverable hue into the save and clips at 45", () => {
    const world = makeWorld({ stage: 2 });
    let state = initialFxState(0);
    const first = executeFx(state, { kind: "palette_shift", params: { hue_rot: 30, dur: 4000, recover: false } }, world);
    state = first.state;
    expect(first.result.status).toBe("executed");
    expect(state.pollutionDegrees).toBe(30);
    expect(state.ledger.some((entry) => entry.type === "fx_exec" && entry.primitive === "C-03a")).toBe(true);
    const second = executeFx(state, { kind: "palette_shift", params: { hue_rot: 20, dur: 3000, recover: false } }, world);
    state = second.state;
    expect(second.result.degraded).toBe(true); // only 15° of the 20° fit under the cap
    expect(state.pollutionDegrees).toBe(45);
    const third = executeFx(state, { kind: "palette_shift", params: { hue_rot: 10, dur: 2000, recover: false } }, world);
    expect(third.result.status).toBe("suppressed");
    expect(third.result.reason).toBe("guard_pollution_exhausted");
  });
});

describe("C-04 — full-mode sprite corruption is capped at 3 per save", () => {
  it("counts three full modes and suppresses the fourth", () => {
    const world = makeWorld({ stage: 3 });
    let state = initialFxState(0);
    for (const target of ["a", "b", "c"]) {
      const outcome = executeFx(state, { kind: "sprite_corrupt", params: { target, mode: "full" } }, world);
      expect(outcome.result.status).toBe("executed");
      state = outcome.state;
    }
    expect(state.corruptFullCount).toBe(3);
    const fourth = executeFx(state, { kind: "sprite_corrupt", params: { target: "d", mode: "full" } }, world);
    expect(fourth.result.status).toBe("suppressed");
    expect(fourth.result.reason).toBe("guard_corrupt_full_limit");
  });
});

describe("fx_exec ledger schema (master §3)", () => {
  it("books executed entries field-by-field", () => {
    const outcome = executeFx(
      initialFxState(16151),
      { kind: "sprite_corrupt", params: { target: "gazer_01", mode: "eye_only" }, intensity: 0.5 },
      makeWorld({ stage: 3, tick: 16151 }),
    );
    expect(outcome.result.status).toBe("executed");
    const entry = outcome.state.ledger.at(-1);
    expect(entry?.type).toBe("fx_exec");
    if (entry?.type === "fx_exec") {
      expect(Object.keys(entry).sort()).toEqual(
        [
          "type",
          "primitive",
          "params",
          "intensity",
          "cap_applied",
          "degraded",
          "suppressed",
          "game_time",
          "cost_charged",
        ].sort(),
      );
      expect(entry.primitive).toBe("C-04");
      expect(entry.params).toEqual({ target: "gazer_01", mode: "eye_only" });
      expect(entry.intensity).toBe(0.5);
      expect(entry.cap_applied).toBe(0.7);
      expect(entry.degraded).toBe(false);
      expect(entry.suppressed).toBe(false);
      expect(entry.cost_charged).toBe(3);
      expect(entry.game_time).toBe("day14 23:01");
    }
  });

  it("formats game_time from the tick alone", () => {
    expect(gameTimeAt(13 * 1200 + 551)).toBe("day14 23:01");
    expect(gameTimeAt(16151)).toBe(gameTimeAt(16151));
    expect(gameTimeAt(0)).toBe("day1 12:00");
  });
});

describe("G4–G9 interface-agreement hooks", () => {
  it("G4: the shared blink clock hangs on the sim tick and asserts same-frame", () => {
    expect(blinkClosedAt(0)).toBe(true);
    expect(blinkClosedAt(5)).toBe(false);
    expect(blinkClosedAt(BLINK_PERIOD_TICKS)).toBe(true);
    expect(assertSameFrameBlink([100, 101, 100])).toBe(true);
    expect(assertSameFrameBlink([100, 102])).toBe(false);
    expect(assertSameFrameBlink([])).toBe(false);
  });

  it("G5/G6: no synthetic input, no OS spoofing", () => {
    expect(assertNoSyntheticInput([{ syntheticInput: false }, {}])).toBe(true);
    expect(assertNoSyntheticInput([{ syntheticInput: true }])).toBe(false);
    expect(assertInPageOnly("page")).toBe(true);
    expect(assertInPageOnly("os")).toBe(false);
  });

  it("G7/G8/G9: cursor pause, blink-clock channel, glow whitelist", () => {
    expect(cursorMirrorPaused(1000, 1200)).toBe(true);
    expect(cursorMirrorPaused(1000, 1400)).toBe(false);
    expect(assertDemagnetizeChannel("blink_clock_internal")).toBe(true);
    expect(assertDemagnetizeChannel("creature_wink")).toBe(false);
    expect(assertGlowWhitelist(["g_highlight", "terminal_cursor"])).toBe(true);
    expect(assertGlowWhitelist(["g_highlight", "third_spot"])).toBe(false);
  });
});
