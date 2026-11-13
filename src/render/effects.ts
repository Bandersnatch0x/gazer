/**
 * The effect primitive executor.
 *
 * Every effect is split in two:
 *   - `plan(effect, state)` is pure and returns render instructions. It is the
 *     part a test can assert.
 *   - `apply(instructions, host, shell)` performs them. Canvas instructions go
 *     to the Pixi host; the three browser-shell instructions are routed to a
 *     callback the UI supplies, because a favicon, a document title and an
 *     overlay are not canvas objects.
 */

import type { Effect } from "../sim/effects";
import type { CreatureId, CreatureTrait, Mood, TilePos, WorldState } from "../sim/types";
import { DEGAUSS_BLINK_MS } from "../sim/fx";
import { clamp01 } from "./palette";
import type { ScreenPos } from "./scene";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, creatureCenter, tileCenter, witherTiles } from "./scene";

/**
 * Effects that belong to the browser shell rather than the canvas. They are
 * not in the simulation's `Effect` union: the engine never emits them, the
 * director does, and the shell owns their execution.
 */
export type ShellEffect =
  | { readonly kind: "favicon_eye"; readonly intensity: number }
  | { readonly kind: "title_mutate"; readonly text: string }
  | { readonly kind: "outside_eyes"; readonly opacity: number };

export type RenderEffect = Effect | ShellEffect;

export const SHELL_EFFECT_KINDS = ["favicon_eye", "title_mutate", "outside_eyes"] as const;

export const CANVAS_EFFECT_KINDS = [
  "freeze_all",
  "gaze_at_player",
  "mirror_click_rhythm",
  "palette_shift",
  "desaturate",
  "audio_drop_track",
  "spawn_structure",
  "relabel_ui",
  "set_trait",
  "rewrite_sprite",
  "glyph_corrupt",
  "creature_speech",
  "collective_speech",
  "ui_shake",
  "creature_wink",
  "cursor_pull",
  // --- Ticket 0025: the canvas-layer FX kinds (FX-LIB-01a) ---
  "palette_pollution",
  "sprite_corrupt",
  "collective_gaze",
  "replay_player_action",
  "map_wither",
  "afterimage",
  "lineage_blacken",
  "egg_pulse",
  // --- Ticket 0033: E4's one canonical tower gaze (N3) ---
  "gaze_at_tower",
] as const;

export const EFFECT_KINDS = [...CANVAS_EFFECT_KINDS, ...SHELL_EFFECT_KINDS] as const;

export type RenderEffectKind = (typeof EFFECT_KINDS)[number];

export interface SpeechAnchor {
  readonly creatureId: CreatureId;
  readonly at: ScreenPos | null;
}

export type CanvasInstruction =
  | { readonly type: "freeze"; readonly ms: number; readonly pose: "keep" | "alert" }
  | { readonly type: "gaze"; readonly creatureId: CreatureId; readonly ms: number }
  | {
      readonly type: "mirror_click_rhythm";
      readonly creatureId: CreatureId;
      readonly durationMs: number;
      readonly repeatN: number;
      readonly tol: number;
    }
  | {
      readonly type: "palette_shift";
      readonly amount: number;
      readonly ms: number;
      readonly hueRot: number;
      readonly recover: boolean;
    }
  | { readonly type: "desaturate"; readonly amount: number }
  | { readonly type: "audio"; readonly track: string }
  | {
      readonly type: "spawn_structure";
      readonly structure: "black_tower";
      readonly at: TilePos;
      readonly center: ScreenPos;
    }
  | { readonly type: "relabel"; readonly target: string; readonly text: string }
  | { readonly type: "set_trait"; readonly creatureId: CreatureId; readonly trait: CreatureTrait }
  | {
      readonly type: "rewrite_sprite";
      readonly creatureId: CreatureId;
      readonly palette: readonly string[];
      readonly mask: readonly string[];
    }
  | { readonly type: "glyph_corrupt"; readonly amount: number }
  | {
      readonly type: "speech";
      readonly anchors: readonly SpeechAnchor[];
      readonly text: string;
      readonly mood: Mood;
      readonly collective: boolean;
    }
  | { readonly type: "shake"; readonly intensity: number; readonly ms: number }
  | {
      readonly type: "wink";
      readonly creatureId: CreatureId;
      readonly at: ScreenPos | null;
      /** Wink duration; absent = the host's 260ms squeeze (ticket 0047). */
      readonly ms: number;
    }
  | {
      readonly type: "cursor_pull";
      readonly creatureId: CreatureId;
      readonly from: ScreenPos | null;
      readonly strength: number;
    }
  // --- Ticket 0025: the canvas-layer FX instructions (FX-LIB-01a) ---
  | { readonly type: "palette_pollution"; readonly degrees: number }
  | {
      readonly type: "sprite_corrupt";
      readonly creatureIds: readonly CreatureId[];
      readonly mode: "eye_only" | "full";
    }
  | {
      readonly type: "collective_gaze";
      readonly ms: number;
      readonly creatureIds: readonly CreatureId[];
      readonly center: ScreenPos;
    }
  | { readonly type: "replay_player_action"; readonly window: "last_10"; readonly fidelity: number }
  | {
      readonly type: "map_wither";
      readonly radius: number;
      readonly around: "death_site" | "last_click";
      readonly center: ScreenPos | null;
      readonly tiles: readonly TilePos[];
    }
  | { readonly type: "afterimage"; readonly creatureId: CreatureId; readonly at: ScreenPos | null; readonly tailMs: number }
  | {
      readonly type: "lineage_blacken";
      readonly nodes: readonly { readonly creatureId: CreatureId; readonly at: ScreenPos | null }[];
      readonly leanTo: ScreenPos | null;
    }
  | { readonly type: "egg_pulse"; readonly eggId: string; readonly at: ScreenPos | null }
  | {
      readonly type: "gaze_at_tower";
      readonly creatureId: CreatureId;
      readonly at: ScreenPos | null;
      readonly toward: ScreenPos | null;
      readonly ms: number;
    };

export type ShellInstruction =
  | { readonly type: "favicon_eye"; readonly intensity: number }
  | { readonly type: "title_mutate"; readonly text: string }
  | { readonly type: "outside_eyes"; readonly opacity: number };

export type RenderInstruction = CanvasInstruction | ShellInstruction;

/** How long a mirrored click rhythm is recorded before it plays back. */
export const MIRROR_WINDOW_MS = 6000;
/** C-02 defaults when a legacy `mirror_click_rhythm` carries no parameters. */
export const MIRROR_REPEAT_N = 3;
export const MIRROR_TOL = 0.15;
/** The ordinary C-05 wink: a 260ms horizontal squeeze (ticket 0047). */
export const WINK_MS = 260;

/**
 * Which face a wink of `ms` wears (ticket 0047): the demagnetize linkage's
 * 16ms one-frame blink closes both eyelids through the masks closed-eye face;
 * everything else — including the absent-duration legacy call — keeps the
 * 260ms horizontal squeeze. Pure, so the two-path split is testable.
 */
export function winkFaceFor(ms: number | undefined): "lids" | "squeeze" {
  return ms !== undefined && Number.isFinite(ms) && ms > 0 && ms <= DEGAUSS_BLINK_MS ? "lids" : "squeeze";
}
/**
 * Plan-time context the host may supply for effects that reference the
 * keeper's own input (C-08's `last_click`). Optional: every consumer that
 * plans without it keeps working, the instruction just carries a null centre
 * and the host resolves the spot itself.
 */
export interface PlanContext {
  readonly lastClick?: TilePos | null;
}

// --- V1 close-up duck (sprite-core ruling ③, ticket 0025) ---------------------

/** The V1 close-up ducks the soundtrack by exactly −4 dB while it plays. */
export const CLOSEUP_DUCK_DB = -4;

/** dB → linear gain, clamped to the audible band; pure and deterministic. */
export function dbToGain(db: number): number {
  if (!Number.isFinite(db)) {
    return 1;
  }
  return Math.min(1, Math.max(0, Math.pow(10, db / 20)));
}

export function isShellInstruction(instruction: RenderInstruction): instruction is ShellInstruction {
  return (
    instruction.type === "favicon_eye" ||
    instruction.type === "title_mutate" ||
    instruction.type === "outside_eyes"
  );
}

function anchorOf(state: WorldState, id: CreatureId): ScreenPos | null {
  return creatureCenter(state, id);
}

/** Living creatures sorted by id; the deterministic face of "everyone". */
function sortedLivingIds(state: WorldState): CreatureId[] {
  return Object.values(state.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The legacy speech-order face (kept exactly as it was for `collective_speech`). */
function livingCreatureIds(state: WorldState): CreatureId[] {
  return Object.values(state.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort((a, b) => a.localeCompare(b));
}

/** The centroid of the living herd, rounded to whole pixels; screen centre when empty. */
function herdCenter(state: WorldState): ScreenPos {
  const living = sortedLivingIds(state);
  if (living.length === 0) {
    return { x: Math.round(LOGICAL_WIDTH / 2), y: Math.round(LOGICAL_HEIGHT / 2) };
  }
  let sumX = 0;
  let sumY = 0;
  for (const id of living) {
    const at = creatureCenter(state, id);
    if (at !== null) {
      sumX += at.x;
      sumY += at.y;
    }
  }
  return { x: Math.round(sumX / living.length), y: Math.round(sumY / living.length) };
}

/** C-08's `death_site`: the deterministic dead creature (last id) that died latest by id order. */
function deathSiteTile(state: WorldState): TilePos | null {
  const dead = Object.values(state.creatures)
    .filter((creature) => creature.behavior === "dead")
    .map((creature) => creature.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const last = dead[dead.length - 1];
  const creature = last === undefined ? undefined : state.creatures[last];
  return creature === undefined ? null : creature.position;
}

/** C-11's `lean_to: tower`: where the black tower stands, or null when it does not. */
function towerAnchorOf(state: WorldState): ScreenPos | null {
  const tower = state.structures.find((structure) => structure.kind === "black_tower");
  return tower === undefined ? null : tileCenter(tower.at);
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Pure. Given a valid effect and the world it lands on, returns what to draw.
 * Unknown creature ids still produce an instruction with a null anchor; the
 * host drops those rather than the director crashing the scene.
 */
export function plan(effect: RenderEffect, state: WorldState, ctx: PlanContext = {}): readonly RenderInstruction[] {
  switch (effect.kind) {
    case "freeze_all":
      return [{ type: "freeze", ms: nonNegative(effect.ms), pose: effect.pose ?? "keep" }];

    case "gaze_at_player":
      return [{ type: "gaze", creatureId: effect.creatureId, ms: nonNegative(effect.ms) }];

    case "mirror_click_rhythm":
      return [
        {
          type: "mirror_click_rhythm",
          creatureId: effect.creatureId,
          durationMs: MIRROR_WINDOW_MS,
          repeatN: Math.max(1, Math.floor(effect.repeatN ?? MIRROR_REPEAT_N)),
          tol: clamp01(effect.tol ?? MIRROR_TOL),
        },
      ];

    case "palette_shift":
      return [
        {
          type: "palette_shift",
          amount: clamp01(effect.amount),
          ms: nonNegative(effect.ms),
          hueRot: Number.isFinite(effect.hueRot) ? Math.min(30, Math.max(-30, effect.hueRot ?? 0)) : 0,
          recover: effect.recover ?? true,
        },
      ];

    case "desaturate":
      return [{ type: "desaturate", amount: clamp01(effect.amount) }];

    case "audio_drop_track":
      return [{ type: "audio", track: effect.track }];

    case "spawn_structure":
      return [
        {
          type: "spawn_structure",
          structure: effect.structure,
          at: effect.at,
          center: tileCenter(effect.at),
        },
      ];

    case "relabel_ui":
      return [{ type: "relabel", target: effect.target, text: effect.text }];

    case "set_trait":
      return [{ type: "set_trait", creatureId: effect.creatureId, trait: effect.trait }];

    case "rewrite_sprite":
      return [
        {
          type: "rewrite_sprite",
          creatureId: effect.creatureId,
          palette: effect.palette,
          mask: effect.mask,
        },
      ];

    case "glyph_corrupt":
      return [{ type: "glyph_corrupt", amount: clamp01(effect.amount) }];

    case "creature_speech":
      return [
        {
          type: "speech",
          anchors: [{ creatureId: effect.creatureId, at: anchorOf(state, effect.creatureId) }],
          text: effect.text,
          mood: effect.mood,
          collective: false,
        },
      ];

    case "collective_speech":
      return [
        {
          type: "speech",
          anchors: livingCreatureIds(state).map((id) => ({ creatureId: id, at: anchorOf(state, id) })),
          text: effect.text,
          mood: effect.mood,
          collective: true,
        },
      ];

    case "ui_shake":
      return [{ type: "shake", intensity: clamp01(effect.intensity), ms: nonNegative(effect.ms) }];

    case "creature_wink":
      return [
        {
          type: "wink",
          creatureId: effect.creatureId,
          at: anchorOf(state, effect.creatureId),
          // Absent = the ordinary 260ms face; 16 (the demagnetize linkage)
          // rides through untouched.
          ms: effect.ms === undefined ? WINK_MS : Math.max(1, Math.round(effect.ms)),
        },
      ];

    case "cursor_pull":
      return [
        {
          type: "cursor_pull",
          creatureId: effect.creatureId,
          from: anchorOf(state, effect.creatureId),
          strength: clamp01(effect.strength),
        },
      ];

    // --- Ticket 0025: canvas-layer FX kinds (FX-LIB-01a) ---

    case "palette_pollution":
      return [
        {
          type: "palette_pollution",
          degrees: Number.isFinite(effect.degrees)
            ? Math.min(45, Math.max(0, effect.degrees))
            : 0,
        },
      ];

    case "sprite_corrupt": {
      const ids =
        effect.target === "all"
          ? sortedLivingIds(state)
          : state.creatures[effect.target] !== undefined
            ? [effect.target]
            : [];
      return [{ type: "sprite_corrupt", creatureIds: ids, mode: effect.mode }];
    }

    case "collective_gaze":
      return [
        {
          type: "collective_gaze",
          ms: nonNegative(effect.ms),
          creatureIds: sortedLivingIds(state),
          center: herdCenter(state),
        },
      ];

    case "replay_player_action":
      return [
        { type: "replay_player_action", window: effect.window, fidelity: clamp01(effect.fidelity) },
      ];

    case "map_wither": {
      const site =
        effect.around === "death_site"
          ? deathSiteTile(state)
          : (ctx.lastClick ?? null);
      if (site === null) {
        return [{ type: "map_wither", radius: effect.radius, around: effect.around, center: null, tiles: [] }];
      }
      const radius = Math.min(5, Math.max(2, Math.floor(effect.radius)));
      return [
        {
          type: "map_wither",
          radius,
          around: effect.around,
          center: tileCenter(site),
          tiles: witherTiles(site, radius),
        },
      ];
    }

    case "afterimage":
      return [
        {
          type: "afterimage",
          creatureId: effect.creatureId,
          at: anchorOf(state, effect.creatureId),
          tailMs: Math.min(800, Math.max(300, Math.round(effect.tailMs))),
        },
      ];

    case "lineage_blacken":
      return [
        {
          type: "lineage_blacken",
          nodes: effect.deadIds.map((creatureId) => ({ creatureId, at: anchorOf(state, creatureId) })),
          leanTo: towerAnchorOf(state),
        },
      ];

    case "egg_pulse": {
      const egg = state.eggs.find((candidate) => candidate.id === effect.eggId);
      return [{ type: "egg_pulse", eggId: effect.eggId, at: egg === undefined ? null : tileCenter(egg.at) }];
    }

    case "gaze_at_tower":
      // E4's one canonical gaze: the plan anchors the body and names where the
      // tower stands; the face itself is the back silhouette (§6.4 — the
      // pupil's rules never see the tower), so no anchor travels to the eyes.
      return [
        {
          type: "gaze_at_tower",
          creatureId: effect.creatureId,
          at: anchorOf(state, effect.creatureId),
          toward: towerAnchorOf(state),
          ms: nonNegative(effect.ms),
        },
      ];

    case "favicon_eye":
      return [{ type: "favicon_eye", intensity: clamp01(effect.intensity) }];

    case "title_mutate":
      return [{ type: "title_mutate", text: effect.text }];

    case "outside_eyes":
      return [{ type: "outside_eyes", opacity: clamp01(effect.opacity) }];

    default:
      // Runtime input is JSON from the director; an unknown kind draws nothing,
      // the same way the engine leaves the world unchanged.
      return [];
  }
}

/** The Pixi side. Implemented by `app.ts`; absent in tests. */
export interface RenderHost {
  applyInstruction(instruction: CanvasInstruction): void;
}

export type ShellHandler = (instruction: ShellInstruction) => void;

/**
 * Executes planned instructions. Canvas work goes to the host; shell work goes
 * to the UI callback. A missing shell handler is not an error: a run without
 * a browser shell simply has no favicon to blink.
 */
export function apply(
  instructions: readonly RenderInstruction[],
  host: RenderHost,
  shell?: ShellHandler,
): void {
  for (const instruction of instructions) {
    if (isShellInstruction(instruction)) {
      shell?.(instruction);
    } else {
      host.applyInstruction(instruction);
    }
  }
}

