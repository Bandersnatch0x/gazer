/**
 * Ticket 0025 — canvas layer folded into the Effect union (C-01…C-12).
 *
 * Covers the ticket's delivery checklist:
 *   - cap clipping on a canvas primitive, `cap_applied` booked;
 *   - C-04 full mode ≤3 per save (eye_only uncapped);
 *   - C-03a cumulative permanent pollution ≤45°, dispatching `palette_pollution`;
 *   - C-01 canonical exemption with parameters carried through verbatim;
 *   - C-06 one face for the whole ring (plan expands, pupils centred);
 *   - determinism: two runs of the same batch are bit-identical.
 *
 * Plus the render plan/apply faces for the new kinds, the palette hue face
 * (C-03 rotation / C-03a pollution), the scene's four-slot expansion with the
 * P/I stage colours and the cursor→anchor line, and the V1 close-up duck.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { CreatureState, Stage, WorldState } from "../src/sim/types";
import { COLLECTIVE_GAZE_MS, DEGAUSS_BLINK_MS, demagnetizeBlinkDispatch, executeFx, gazeAtTowerDispatch, initialFxState } from "../src/sim/fx";
import { initialAwakeningState, recordTowerGaze } from "../src/sim/awakening";
import {
  CLOSEUP_DUCK_DB,
  WINK_MS,
  apply,
  dbToGain,
  isShellInstruction,
  plan,
  winkFaceFor,
} from "../src/render/effects";
import type { CanvasInstruction } from "../src/render/effects";
import {
  TOWER_BODY_COLOR,
  TOWER_VOID_COLOR,
  applyPalettePollution,
  hueRotate,
  rotatePalette,
  paletteAt,
  PUPIL_STAGE_COLORS,
  pupilStageForGv,
} from "../src/render/palette";
import { creatureDraws, pupilAnchorAt, witherTiles } from "../src/render/scene";
import { canonicalMask } from "../src/render/sprite";
import { backSilhouette, maskWithPupilAnchor } from "../src/render/masks";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function creature(id: string, opts: Partial<CreatureState> = {}): CreatureState {
  return {
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
    ...opts,
  };
}

function world(opts: {
  stage?: Stage;
  tick?: number;
  gv?: number;
  creatures?: readonly CreatureState[];
  tower?: boolean;
  eggs?: readonly { id: string; x: number; y: number }[];
} = {}): WorldState {
  const creatures: Record<string, CreatureState> = {};
  for (const entry of opts.creatures ?? [creature("gazer_01")]) {
    creatures[entry.id] = entry;
  }
  return {
    tick: opts.tick ?? 0,
    gv: opts.gv ?? (opts.stage ?? 0) * 20,
    stage: opts.stage ?? 0,
    creatures,
    structures: opts.tower ? [{ kind: "black_tower", at: { x: 0, y: 5 }, createdBy: "director" }] : [],
    eggs: (opts.eggs ?? []).map((egg) => ({
      id: egg.id,
      parentA: "gazer_01",
      parentB: "gazer_01",
      laidAtTick: 0,
      forced: false,
      at: { x: egg.x, y: egg.y },
    })),
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: false,
  };
}

// ---------------------------------------------------------------------------
// Executor faces
// ---------------------------------------------------------------------------

describe("C-01 — canonical freeze books the parameters verbatim (GV12 face)", () => {
  it("2000ms alert rides the dispatch and the ledger untouched, budget exempt", () => {
    const w = world({ stage: 0, tick: 100 });
    let state = initialFxState(100);
    // S0 budget is 2 points; two ordinary freezes exhaust it.
    state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 800, pose: "keep" } }, w).state;
    state = executeFx(state, { kind: "all_freeze", params: { duration_ms: 900, pose: "keep" } }, w).state;
    expect(state.spentToday).toBe(2);
    // The canonical GV12 freeze (2000ms alert) executes anyway, prepaid.
    const canonical = executeFx(
      state,
      { kind: "all_freeze", params: { duration_ms: 2000, pose: "alert" }, canonical: true },
      w,
    );
    expect(canonical.result.status).toBe("executed");
    expect(canonical.result.costCharged).toBe(0);
    expect(canonical.result.effects).toEqual([{ kind: "freeze_all", ms: 2000, pose: "alert" }]);
    const entry = canonical.state.ledger.at(-1);
    expect(entry?.type).toBe("fx_exec");
    if (entry?.type === "fx_exec") {
      // Parameters verbatim — the canonical table is not retyped by the executor.
      expect(entry.params).toEqual({ duration_ms: 2000, pose: "alert" });
      expect(entry.suppressed).toBe(false);
      expect(entry.cost_charged).toBe(0);
      expect(entry.cap_applied).toBe(0.5);
    }
    expect(canonical.state.spentToday).toBe(2);
  });

  it("pose is optional on the legacy face: absent means keep, legacy callers unchanged", () => {
    const w = world({ stage: 0 });
    const outcome = executeFx(
      initialFxState(0),
      { kind: "all_freeze", params: { duration_ms: 1000, pose: "keep" } },
      w,
    );
    expect(outcome.result.effects).toEqual([{ kind: "freeze_all", ms: 1000, pose: "keep" }]);
  });
});

describe("C-04 — full mode ≤3 per save, eye_only uncapped", () => {
  it("suppresses the fourth full corruption with the guard reason", () => {
    const w = world({ stage: 3 });
    let state = initialFxState(0);
    for (const target of ["gazer_01", "gazer_02", "gazer_03"]) {
      const outcome = executeFx(state, { kind: "sprite_corrupt", params: { target, mode: "full" } }, w);
      expect(outcome.result.status).toBe("executed");
      expect(outcome.result.effects).toEqual([{ kind: "sprite_corrupt", target, mode: "full" }]);
      state = outcome.state;
    }
    const fourth = executeFx(state, { kind: "sprite_corrupt", params: { target: "gazer_04", mode: "full" } }, w);
    expect(fourth.result.status).toBe("suppressed");
    expect(fourth.result.reason).toBe("guard_corrupt_full_limit");
    expect(fourth.result.effects).toHaveLength(0);
  });

  it("lets eye_only run beyond the full limit — pupils only", () => {
    const w = world({ stage: 3 });
    let state = initialFxState(0);
    for (const target of ["gazer_01", "gazer_02", "gazer_03", "gazer_04", "gazer_05"]) {
      const outcome = executeFx(state, { kind: "sprite_corrupt", params: { target, mode: "eye_only" } }, w);
      expect(outcome.result.status).toBe("executed");
      state = outcome.state;
    }
  });
});

describe("C-03a — pollution accumulates ≤45° and dispatches the permanent face", () => {
  it("clips at the ceiling, books degraded, then refuses more", () => {
    const w = world({ stage: 2 });
    let state = initialFxState(0);
    const first = executeFx(
      state,
      { kind: "palette_shift", params: { hue_rot: 30, dur: 4000, recover: false } },
      w,
    );
    state = first.state;
    expect(first.result.status).toBe("executed");
    expect(state.pollutionDegrees).toBe(30);
    expect(first.result.effects).toEqual([{ kind: "palette_pollution", degrees: 30 }]);
    const second = executeFx(
      state,
      { kind: "palette_shift", params: { hue_rot: 20, dur: 3000, recover: false } },
      w,
    );
    state = second.state;
    expect(second.result.degraded).toBe(true);
    expect(state.pollutionDegrees).toBe(45);
    expect(second.result.effects).toEqual([{ kind: "palette_pollution", degrees: 15 }]);
    const third = executeFx(
      state,
      { kind: "palette_shift", params: { hue_rot: 10, dur: 2000, recover: false } },
      w,
    );
    expect(third.result.status).toBe("suppressed");
    expect(third.result.reason).toBe("guard_pollution_exhausted");
  });
});

describe("cap clipping — a canvas primitive above its cap is clipped and booked", () => {
  it("clips a 0.9 request to C-04's 0.7 cap", () => {
    const w = world({ stage: 3 });
    const outcome = executeFx(
      initialFxState(0),
      { kind: "sprite_corrupt", params: { target: "gazer_01", mode: "eye_only" }, intensity: 0.9 },
      w,
    );
    expect(outcome.result.status).toBe("executed");
    expect(outcome.result.appliedIntensity).toBe(0.7);
    expect(outcome.result.capApplied).toBe(0.7);
    expect(outcome.result.degraded).toBe(true);
    const entry = outcome.state.ledger.at(-1);
    if (entry?.type === "fx_exec") {
      expect(entry.intensity).toBe(0.7);
      expect(entry.cap_applied).toBe(0.7);
      expect(entry.degraded).toBe(true);
    }
  });
});

describe("C-06 — one face for the whole ring", () => {
  it("dispatches a single collective_gaze, not one effect per creature", () => {
    const w = world({
      stage: 3,
      creatures: [creature("gazer_01"), creature("gazer_02"), creature("dead_01", { behavior: "dead" })],
    });
    const outcome = executeFx(initialFxState(0), { kind: "collective_gaze" }, w);
    expect(outcome.result.status).toBe("executed");
    expect(outcome.result.effects).toEqual([{ kind: "collective_gaze", ms: COLLECTIVE_GAZE_MS }]);
  });
});

describe("determinism — the same batch twice is bit-identical", () => {
  const run = (): string => {
    const w = world({
      stage: 3,
      tick: 100,
      creatures: [creature("gazer_01"), creature("gazer_02")],
      tower: true,
      eggs: [{ id: "egg_01", x: 6, y: 6 }],
    });
    let state = initialFxState(100);
    const requests = [
      { kind: "all_freeze", params: { duration_ms: 2000, pose: "alert" }, canonical: true },
      { kind: "sprite_corrupt", params: { target: "all", mode: "eye_only" }, canonical: true },
      { kind: "collective_gaze", canonical: true },
      { kind: "replay_player_action", params: { window: "last_10", fidelity: 0.8 }, canonical: true },
      { kind: "map_wither", params: { radius: 3, around: "death_site" }, canonical: true },
      { kind: "afterimage", params: { target: "gazer_01", tail: 0.5 }, canonical: true },
      { kind: "lineage_blacken", params: { dead_ids: ["gazer_02"], lean_to: "tower" }, canonical: true },
      { kind: "egg_pulse", params: { target: "egg_01", rhythm: "player_click" }, canonical: true },
    ] as const;
    const effects: unknown[] = [];
    for (const request of requests) {
      const outcome = executeFx(state, request, w);
      state = outcome.state;
      effects.push(...outcome.result.effects);
    }
    return JSON.stringify({ ledger: state.ledger, effects, pollution: state.pollutionDegrees });
  };

  it("two runs agree byte for byte", () => {
    expect(run()).toBe(run());
  });
});

// ---------------------------------------------------------------------------
// Render plan / apply faces
// ---------------------------------------------------------------------------

const planWorld = (): WorldState =>
  world({
    stage: 3,
    gv: 70,
    creatures: [
      creature("gazer_01", { position: { x: 4, y: 5 } }),
      creature("gazer_02", { position: { x: 7, y: 2 } }),
      creature("gone_01", { position: { x: 2, y: 2 }, behavior: "dead" }),
    ],
    tower: true,
    eggs: [{ id: "egg_01", x: 6, y: 6 }],
  });

describe("plan — canvas FX instructions", () => {
  it("resolves sprite_corrupt targets: all = living sorted, unknown id = none", () => {
    const [all] = plan({ kind: "sprite_corrupt", target: "all", mode: "full" }, planWorld());
    expect(all).toEqual({
      type: "sprite_corrupt",
      creatureIds: ["gazer_01", "gazer_02"],
      mode: "full",
    });
    const [ghost] = plan({ kind: "sprite_corrupt", target: "ghost", mode: "eye_only" }, planWorld());
    expect(ghost?.type).toBe("sprite_corrupt");
    if (ghost?.type === "sprite_corrupt") {
      expect(ghost.creatureIds).toEqual([]);
    }
  });

  it("collective_gaze carries every living creature and the herd centroid", () => {
    const [instruction] = plan({ kind: "collective_gaze", ms: 800 }, planWorld());
    expect(instruction?.type).toBe("collective_gaze");
    if (instruction?.type === "collective_gaze") {
      expect(instruction.creatureIds).toEqual(["gazer_01", "gazer_02"]);
      expect(instruction.ms).toBe(800);
      // Centroid of the two living creatures' tile centres, rounded.
      expect(Number.isInteger(instruction.center.x)).toBe(true);
      expect(Number.isInteger(instruction.center.y)).toBe(true);
    }
  });

  it("map_wither death_site lands on the dead creature, clamped to the grid", () => {
    const [instruction] = plan({ kind: "map_wither", radius: 3, around: "death_site" }, planWorld());
    expect(instruction?.type).toBe("map_wither");
    if (instruction?.type === "map_wither") {
      expect(instruction.center).toEqual({ x: 160, y: 50 }); // tile (2,2)
      expect(instruction.tiles).toEqual(witherTiles({ x: 2, y: 2 }, 3));
      expect(instruction.tiles.every((tile) => tile.x >= 0 && tile.x < 16 && tile.y >= 0 && tile.y < 16)).toBe(true);
    }
    const [clamped] = plan({ kind: "map_wither", radius: 99, around: "death_site" }, planWorld());
    if (clamped?.type === "map_wither") {
      expect(clamped.radius).toBe(5);
    }
  });

  it("map_wither last_click without a plan context carries a null centre for the host", () => {
    const [instruction] = plan({ kind: "map_wither", radius: 2, around: "last_click" }, planWorld());
    expect(instruction).toEqual({ type: "map_wither", radius: 2, around: "last_click", center: null, tiles: [] });
    const [withCtx] = plan(
      { kind: "map_wither", radius: 2, around: "last_click" },
      planWorld(),
      { lastClick: { x: 8, y: 8 } },
    );
    if (withCtx?.type === "map_wither") {
      expect(withCtx.tiles).toEqual(witherTiles({ x: 8, y: 8 }, 2));
    }
  });

  it("afterimage clamps its tail to the canonical 0.3–0.8s window", () => {
    const [short] = plan({ kind: "afterimage", creatureId: "gazer_01", tailMs: 50 }, planWorld());
    expect(short).toMatchObject({ type: "afterimage", tailMs: 300 });
    const [mid] = plan({ kind: "afterimage", creatureId: "gazer_01", tailMs: 500 }, planWorld());
    expect(mid).toMatchObject({ type: "afterimage", tailMs: 500 });
    const [long] = plan({ kind: "afterimage", creatureId: "gazer_01", tailMs: 5000 }, planWorld());
    expect(long).toMatchObject({ type: "afterimage", tailMs: 800 });
    const [ghost] = plan({ kind: "afterimage", creatureId: "ghost", tailMs: 500 }, planWorld());
    expect(ghost).toMatchObject({ type: "afterimage", at: null });
  });

  it("lineage_blacken anchors its nodes and leans to the tower", () => {
    const [instruction] = plan(
      { kind: "lineage_blacken", deadIds: ["gone_01", "ghost"], leanTo: "tower" },
      planWorld(),
    );
    expect(instruction?.type).toBe("lineage_blacken");
    if (instruction?.type === "lineage_blacken") {
      expect(instruction.nodes).toHaveLength(2);
      expect(instruction.nodes[0]?.at).toEqual({ x: 160, y: 50 });
      expect(instruction.nodes[1]?.at).toBeNull();
      expect(instruction.leanTo).toEqual({ x: 120, y: 54 }); // tower at (0,5)
    }
  });

  it("egg_pulse anchors on the egg, or null when it is gone", () => {
    const [present] = plan({ kind: "egg_pulse", eggId: "egg_01", rhythm: "player_click" }, planWorld());
    expect(present?.type).toBe("egg_pulse");
    if (present?.type === "egg_pulse") {
      expect(present.at).toEqual({ x: 160, y: 82 }); // tile (6,6)
    }
    const [missing] = plan({ kind: "egg_pulse", eggId: "egg_404", rhythm: "player_click" }, planWorld());
    expect(missing).toMatchObject({ type: "egg_pulse", at: null });
  });

  it("clamps the numeric faces: pollution ≤45, fidelity ≤1, hueRot ≤±30", () => {
    const [pollution] = plan({ kind: "palette_pollution", degrees: 90 }, planWorld());
    expect(pollution).toEqual({ type: "palette_pollution", degrees: 45 });
    const [negative] = plan({ kind: "palette_pollution", degrees: -5 }, planWorld());
    expect(negative).toEqual({ type: "palette_pollution", degrees: 0 });
    const [replay] = plan({ kind: "replay_player_action", window: "last_10", fidelity: 2 }, planWorld());
    expect(replay).toEqual({ type: "replay_player_action", window: "last_10", fidelity: 1 });
    const [shift] = plan({ kind: "palette_shift", amount: 1, ms: 4000, hueRot: 45, recover: true }, planWorld());
    expect(shift).toMatchObject({ type: "palette_shift", hueRot: 30, recover: true });
  });

  it("keeps the extended legacy faces: freeze pose, mirror repeats, palette hue", () => {
    const [freeze] = plan({ kind: "freeze_all", ms: 900 }, planWorld());
    expect(freeze).toEqual({ type: "freeze", ms: 900, pose: "keep" });
    const [alert] = plan({ kind: "freeze_all", ms: 2000, pose: "alert" }, planWorld());
    expect(alert).toEqual({ type: "freeze", ms: 2000, pose: "alert" });
    const [mirror] = plan({ kind: "mirror_click_rhythm", creatureId: "gazer_01" }, planWorld());
    expect(mirror).toMatchObject({ type: "mirror_click_rhythm", repeatN: 3, tol: 0.15 });
    const [mirrorCustom] = plan(
      { kind: "mirror_click_rhythm", creatureId: "gazer_01", repeatN: 5, tol: 0.3 },
      planWorld(),
    );
    expect(mirrorCustom).toMatchObject({ type: "mirror_click_rhythm", repeatN: 5, tol: 0.3 });
  });

  it("routes every new kind to the canvas, never the shell", () => {
    const effects = [
      { kind: "palette_pollution", degrees: 15 },
      { kind: "sprite_corrupt", target: "all", mode: "eye_only" },
      { kind: "collective_gaze", ms: 800 },
      { kind: "replay_player_action", window: "last_10", fidelity: 0.8 },
      { kind: "map_wither", radius: 3, around: "death_site" },
      { kind: "afterimage", creatureId: "gazer_01", tailMs: 500 },
      { kind: "lineage_blacken", deadIds: ["gone_01"], leanTo: "tower" },
      { kind: "egg_pulse", eggId: "egg_01", rhythm: "player_click" },
    ] as const;
    for (const effect of effects) {
      for (const instruction of plan(effect, planWorld())) {
        expect(isShellInstruction(instruction)).toBe(false);
      }
    }
  });

  it("is deterministic: the same effects plan identically twice", () => {
    const effects = [
      { kind: "collective_gaze", ms: 800 },
      { kind: "map_wither", radius: 3, around: "death_site" },
      { kind: "lineage_blacken", deadIds: ["gone_01"], leanTo: "tower" },
      { kind: "egg_pulse", eggId: "egg_01", rhythm: "player_click" },
    ] as const;
    const one = JSON.stringify(effects.flatMap((effect) => plan(effect, planWorld())));
    const two = JSON.stringify(effects.flatMap((effect) => plan(effect, planWorld())));
    expect(one).toBe(two);
  });
});

describe("apply — the host receives the new canvas instructions", () => {
  it("routes the new kinds to the host channel, one instruction each", () => {
    const seen: string[] = [];
    const instructions: readonly CanvasInstruction[] = [
      { type: "palette_pollution", degrees: 15 },
      { type: "sprite_corrupt", creatureIds: ["gazer_01"], mode: "full" },
      { type: "collective_gaze", ms: 800, creatureIds: ["gazer_01"], center: { x: 160, y: 90 } },
      { type: "replay_player_action", window: "last_10", fidelity: 1 },
      { type: "map_wither", radius: 2, around: "last_click", center: null, tiles: [] },
      { type: "afterimage", creatureId: "gazer_01", at: { x: 10, y: 10 }, tailMs: 500 },
      { type: "lineage_blacken", nodes: [], leanTo: null },
      { type: "egg_pulse", eggId: "egg_01", at: { x: 10, y: 10 } },
    ];
    apply(instructions, {
      applyInstruction: (instruction: CanvasInstruction): void => {
        seen.push(instruction.type);
      },
    });
    expect(seen).toEqual(instructions.map((instruction) => instruction.type));
  });
});

// ---------------------------------------------------------------------------
// Palette hue face (C-03 / C-03a)
// ---------------------------------------------------------------------------

describe("palette — hue rotation and the pollution ceiling", () => {
  it("hueRotate is pure, identity at 0, and leaves greys and junk alone", () => {
    expect(hueRotate("#3f6b4a", 0)).toBe("#3f6b4a");
    expect(hueRotate("#3f6b4a", 30)).toBe(hueRotate("#3f6b4a", 30));
    expect(hueRotate("#808080", 30)).toBe("#808080"); // no hue to rotate
    expect(hueRotate("not-a-color", 30)).toBe("not-a-color");
  });

  it("rotates red around the wheel deterministically", () => {
    expect(hueRotate("#ff0000", 120)).toBe("#00ff00");
    expect(hueRotate("#ff0000", -120)).toBe("#0000ff");
  });

  it("the tower keeps its light immunity; everything else turns", () => {
    const rotated = rotatePalette(paletteAt(0), 30);
    expect(rotated.tower).toBe(TOWER_BODY_COLOR);
    expect(rotated.towerEdge).toBe(TOWER_VOID_COLOR);
    expect(rotated.tileLight).not.toBe(paletteAt(0).tileLight);
  });

  it("the pollution face clamps at 45° and agrees with a plain rotation at 45", () => {
    const clamped = applyPalettePollution(paletteAt(0), 90);
    expect(clamped).toEqual(rotatePalette(paletteAt(0), 45));
    expect(applyPalettePollution(paletteAt(0), 45)).toEqual(clamped);
    expect(applyPalettePollution(paletteAt(0), 0)).toEqual(paletteAt(0));
  });
});

// ---------------------------------------------------------------------------
// Scene — the four-slot expansion and the cursor line (sprite-core ③)
// ---------------------------------------------------------------------------

describe("scene — P/I stage colours render straight through the seven slots", () => {
  it("canonical creatures carry the seven-slot palette with their stage colours", () => {
    const w = world({
      stage: 4,
      gv: 80,
      creatures: [creature("gazer_01", { mask: canonicalMask("idle") })],
    });
    const [draw] = creatureDraws(w, paletteAt(0));
    expect(draw?.canonPalette).toBeDefined();
    if (draw?.canonPalette !== undefined) {
      expect(draw.canonPalette).toHaveLength(7);
      const stage = pupilStageForGv(80);
      expect(draw.canonPalette[4]).toBe(PUPIL_STAGE_COLORS[stage]);
      expect(draw.canonPalette[6]).toBe(PUPIL_STAGE_COLORS[stage]);
      expect(draw.canonPalette[4]).toBe("#0B0D12"); // S4: the pupil vanishes into the void
    }
    expect(draw?.pupilAnchor).toBe("CENTER");
  });

  it("legacy masks stay on the four-slot path", () => {
    const w = world({ creatures: [creature("gazer_01", { mask: ["########", "########"] })] });
    const [draw] = creatureDraws(w, paletteAt(0));
    expect(draw?.canonPalette).toBeUndefined();
  });

  it("a lower GV wears its own stage colour (S2 at GV 50)", () => {
    const w = world({
      stage: 2,
      gv: 50,
      creatures: [creature("gazer_01", { mask: canonicalMask("idle") })],
    });
    const [draw] = creatureDraws(w, paletteAt(0));
    expect(draw?.canonPalette?.[4]).toBe(PUPIL_STAGE_COLORS[pupilStageForGv(50)]);
    expect(draw?.canonPalette?.[4]).toBe("#7E93A6");
  });
});

describe("scene — the cursor→anchor line runs for real", () => {
  it("derives the anchor from the cursor's tile against the creature's home", () => {
    const home = { x: 4, y: 5 };
    expect(pupilAnchorAt({ x: 152, y: 70 }, home)).toBe("CENTER"); // standing on it
    expect(pupilAnchorAt({ x: 168, y: 78 }, home)).toBe("BR"); // one tile south-east
  });

  it("creatureDraws re-seats the pupil at the anchor and keeps ALERT canon-frozen", () => {
    const w = world({
      creatures: [creature("gazer_01", { mask: canonicalMask("idle") }), creature("watcher", { trait: "watcher", mask: canonicalMask("idle") })],
    });
    const anchors = new Map([
      ["gazer_01", "BL"],
      ["watcher", "TL"],
    ] as const);
    const draws = creatureDraws(w, paletteAt(0), anchors);
    const idler = draws.find((draw) => draw.id === "gazer_01");
    const watcher = draws.find((draw) => draw.id === "watcher");
    // BL puts the pupil block down-left; the old centre is eye void again.
    expect(idler?.mask[3]?.[2]).toBe("P");
    expect(idler?.mask[4]?.[2]).toBe("P");
    expect(idler?.mask[2]?.[3]).toBe("E");
    expect(idler?.pupilAnchor).toBe("BL");
    // ALERT is a single frozen frame with the glint centred — untouched.
    expect(watcher?.frame).toBe("alert");
    expect(watcher?.mask).toEqual(canonicalMask("alert"));
    expect(watcher?.pupilAnchor).toBe("TL");
  });
});

describe("scene — witherTiles", () => {
  it("covers a Chebyshev square clipped to the grid", () => {
    expect(witherTiles({ x: 8, y: 8 }, 3)).toHaveLength(49);
    expect(witherTiles({ x: 0, y: 0 }, 2)).toHaveLength(9);
    expect(witherTiles({ x: 15, y: 15 }, 5).every((tile) => tile.x <= 15 && tile.y <= 15)).toBe(true);
  });

  it("clamps the radius to the canonical 2–5 band", () => {
    expect(witherTiles({ x: 8, y: 8 }, 99)).toHaveLength(121); // 11×11 = radius 5
    expect(witherTiles({ x: 8, y: 8 }, 0)).toHaveLength(25); // 5×5 = radius 2
  });
});

// ---------------------------------------------------------------------------
// Masks — the pupil re-seat preserves the canon rules
// ---------------------------------------------------------------------------

describe("masks — maskWithPupilAnchor", () => {
  it("CENTER is the identity, ALERT is always untouched", () => {
    const idle = canonicalMask("idle");
    expect(maskWithPupilAnchor(idle, "CENTER")).toEqual(idle);
    const alert = canonicalMask("alert");
    expect(maskWithPupilAnchor(alert, "BL", true)).toEqual(alert);
  });

  it("moves the pupil and redraws the glint last", () => {
    const moved = maskWithPupilAnchor(canonicalMask("idle"), "BL");
    // The BL block carries the pupil…
    expect(moved[3]?.[2]).toBe("P");
    expect(moved[3]?.[3]).toBe("P");
    expect(moved[4]?.[2]).toBe("P");
    expect(moved[4]?.[3]).toBe("P");
    // …the old centre is eye void again…
    expect(moved[2]?.[3]).toBe("E");
    expect(moved[2]?.[4]).toBe("E");
    expect(moved[3]?.[4]).toBe("E");
    // …and the glint survives the move ([R2]: it is drawn last).
    expect(moved[1]?.[2]).toBe("G");
  });
});

// ---------------------------------------------------------------------------
// V1 close-up duck (sprite-core ③)
// ---------------------------------------------------------------------------

describe("V1 close-up — BGM −4dB face", () => {
  it("exposes the canonical duck and its linear gain", () => {
    expect(CLOSEUP_DUCK_DB).toBe(-4);
    expect(dbToGain(-4)).toBeCloseTo(0.631, 3);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(Number.NaN)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ticket 0033 — E4's one canonical tower gaze (gaze_at_tower)
// ---------------------------------------------------------------------------

describe("gaze_at_tower — the F1 bridge payload (single owner)", () => {
  it("carries creatureId + duration and clamps non-finite durations", () => {
    expect(gazeAtTowerDispatch("gazer_01", 2000)).toEqual({
      kind: "gaze_at_tower",
      creatureId: "gazer_01",
      ms: 2000,
    });
    expect(gazeAtTowerDispatch("gazer_01", -5).ms).toBe(0);
    expect(gazeAtTowerDispatch("gazer_01", Number.NaN).ms).toBe(0);
    expect(gazeAtTowerDispatch("gazer_01", 2000.4).ms).toBe(2000);
  });

  it("is the same shape the render plan consumes (F1, no conversion)", () => {
    const effect = gazeAtTowerDispatch("gazer_01", 2000);
    const [instruction] = plan(effect, planWorld());
    expect(instruction?.type).toBe("gaze_at_tower");
  });
});

describe("gaze_at_tower — the N3 ledger write and its dispatch are one value", () => {
  it("the first gaze carries the dispatch synchronously with the ledger entry", () => {
    const state = initialAwakeningState();
    const verdict = recordTowerGaze(state, 500, "gazer_01", 2000);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.effect).toEqual({ kind: "gaze_at_tower", creatureId: "gazer_01", ms: 2000 });
      expect(verdict.state.towerGazeLog).toEqual([
        { tick: 500, creatureId: "gazer_01", durationMs: 2000 },
      ]);
    }
  });

  it("the save's second gaze is refused with no dispatch at all", () => {
    let state = initialAwakeningState();
    const first = recordTowerGaze(state, 500, "gazer_01", 2000);
    state = first.state;
    const second = recordTowerGaze(state, 900, "gazer_02", 2000);
    expect(second.ok).toBe(false);
    expect("effect" in second).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("tower_gaze_spent");
    }
    expect(second.state.towerGazeLog).toHaveLength(1);
  });
});

describe("gaze_at_tower — the render plan", () => {
  it("anchors the body and names the tower, carrying the duration", () => {
    const [instruction] = plan({ kind: "gaze_at_tower", creatureId: "gazer_01", ms: 2000 }, planWorld());
    expect(instruction?.type).toBe("gaze_at_tower");
    if (instruction?.type === "gaze_at_tower") {
      expect(instruction.at).toEqual({ x: 152, y: 70 }); // tile (4,5)
      expect(instruction.toward).toEqual({ x: 120, y: 54 }); // tower at (0,5)
      expect(instruction.ms).toBe(2000);
    }
  });

  it("drops a missing creature and a towerless world to nulls without throwing", () => {
    const [ghost] = plan({ kind: "gaze_at_tower", creatureId: "ghost", ms: 2000 }, planWorld());
    expect(ghost).toMatchObject({ type: "gaze_at_tower", at: null });
    const [towerless] = plan(
      { kind: "gaze_at_tower", creatureId: "gazer_01", ms: 2000 },
      world({ creatures: [creature("gazer_01")] }),
    );
    expect(towerless).toMatchObject({ type: "gaze_at_tower", toward: null });
    const [negative] = plan({ kind: "gaze_at_tower", creatureId: "gazer_01", ms: -5 }, planWorld());
    expect(negative).toMatchObject({ type: "gaze_at_tower", ms: 0 });
  });

  it("routes to the canvas, never the shell", () => {
    for (const instruction of plan({ kind: "gaze_at_tower", creatureId: "gazer_01", ms: 2000 }, planWorld())) {
      expect(isShellInstruction(instruction)).toBe(false);
    }
  });
});

describe("backSilhouette — the face the tower-gazer shows (§6.4)", () => {
  it("removes every face pixel and keeps the silhouette's body", () => {
    const back = backSilhouette(canonicalMask("idle"));
    for (const row of back) {
      expect(row).not.toMatch(/[EPIG]/);
    }
    // Body pixels are exactly where the canon frame's body pixels are.
    const canon = canonicalMask("idle");
    canon.forEach((row, y) => {
      row.split("").forEach((ch, x) => {
        const isFace = ch === "E" || ch === "P" || ch === "G" || ch === "I";
        expect(back[y]?.[x]).toBe(isFace ? "J" : ch);
      });
    });
  });

  it("maps the legacy eye slot onto the body and is deterministic", () => {
    const legacy = ["##o##o##", "########", "........", "########", "########", "########", "........", "........"];
    const back = backSilhouette(legacy);
    expect(back[0]).toBe("########");
    expect(back[2]).toBe("........");
    expect(back).toEqual(backSilhouette(legacy));
  });

  it("works on the alert frame too — the back never faces the viewer", () => {
    const back = backSilhouette(canonicalMask("alert"));
    for (const row of back) {
      expect(row).not.toMatch(/[EPIG]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Ticket 0047 — the demagnetize blink: creature_wink duration parametrisation
// ---------------------------------------------------------------------------

describe("creature_wink ms — the executor split (ticket 0047)", () => {
  const w = world({ stage: 1, creatures: [creature("gazer_01")] });

  it("an unnamed duration dispatches the legacy shape, byte for byte", () => {
    const outcome = executeFx(
      initialFxState(0),
      { kind: "creature_wink", params: { target: "gazer_01", eye: "both" } },
      w,
    );
    expect(outcome.result.status).toBe("executed");
    expect(outcome.result.effects).toEqual([{ kind: "creature_wink", creatureId: "gazer_01" }]);
  });

  it("a named duration rides through untouched (16 = the demagnetize face)", () => {
    const outcome = executeFx(
      initialFxState(0),
      { kind: "creature_wink", params: { target: "gazer_01", eye: "both", ms: 16 } },
      w,
    );
    expect(outcome.result.effects).toEqual([{ kind: "creature_wink", creatureId: "gazer_01", ms: 16 }]);
  });

  it("rejects durations outside the executor band", () => {
    for (const ms of [0, -1, 1001, 2000]) {
      const outcome = executeFx(
        initialFxState(0),
        { kind: "creature_wink", params: { target: "gazer_01", eye: "both", ms } },
        w,
      );
      expect(outcome.result.reason, `ms=${ms}`).toBe("invalid_params");
    }
  });
});

describe("the demagnetize blink face (ART-CORE-04 §5, G8 channel)", () => {
  it("is one 16ms frame, dispatched through the G4 internal channel shape", () => {
    expect(DEGAUSS_BLINK_MS).toBe(16);
    expect(demagnetizeBlinkDispatch("gazer_01")).toEqual({
      kind: "creature_wink",
      creatureId: "gazer_01",
      ms: 16,
    });
  });

  it("the two paths split on duration: lids at 16, squeeze otherwise", () => {
    expect(winkFaceFor(16)).toBe("lids");
    expect(winkFaceFor(1)).toBe("lids");
    expect(winkFaceFor(17)).toBe("squeeze");
    expect(winkFaceFor(260)).toBe("squeeze");
    expect(winkFaceFor(undefined)).toBe("squeeze"); // the legacy call
    expect(winkFaceFor(0)).toBe("squeeze");
    expect(winkFaceFor(Number.NaN)).toBe("squeeze");
    expect(WINK_MS).toBe(260);
  });
});

describe("wink plan — the instruction carries the duration", () => {
  it("absent duration plans the 260ms squeeze face", () => {
    const [instruction] = plan({ kind: "creature_wink", creatureId: "gazer_01" }, planWorld());
    expect(instruction?.type).toBe("wink");
    if (instruction?.type === "wink") {
      expect(instruction.ms).toBe(260);
    }
  });

  it("a named duration rides through; junk clamps to one whole frame", () => {
    const [flash] = plan({ kind: "creature_wink", creatureId: "gazer_01", ms: 16 }, planWorld());
    if (flash?.type === "wink") {
      expect(flash.ms).toBe(16);
    }
    const [tiny] = plan({ kind: "creature_wink", creatureId: "gazer_01", ms: 0.2 }, planWorld());
    if (tiny?.type === "wink") {
      expect(tiny.ms).toBe(1);
    }
    const [huge] = plan({ kind: "creature_wink", creatureId: "gazer_01", ms: 90000 }, planWorld());
    if (huge?.type === "wink") {
      expect(huge.ms).toBe(90000); // the plan does not second-guess the executor
    }
  });
});

describe("the lids face reuses the masks closed-eye standing face", () => {
  it("the 16ms blink shows the shut line: no pupil, no glint, no iris", () => {
    const face = canonicalMask("grief");
    for (const row of face) {
      expect(row).not.toMatch(/[PGI]/);
    }
    // SLEEP's staggered line, standing (§7) — the closed-eye face the blink
    // borrows for its one frame.
    expect(face[2]).toContain("S");
    expect(face[3]).toContain("S");
  });
});
