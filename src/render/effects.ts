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
import { clamp01 } from "./palette";
import type { ScreenPos } from "./scene";
import { creatureCenter, tileCenter } from "./scene";

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
] as const;

export const EFFECT_KINDS = [...CANVAS_EFFECT_KINDS, ...SHELL_EFFECT_KINDS] as const;

export type RenderEffectKind = (typeof EFFECT_KINDS)[number];

export interface SpeechAnchor {
  readonly creatureId: CreatureId;
  readonly at: ScreenPos | null;
}

export type CanvasInstruction =
  | { readonly type: "freeze"; readonly ms: number }
  | { readonly type: "gaze"; readonly creatureId: CreatureId; readonly ms: number }
  | { readonly type: "mirror_click_rhythm"; readonly creatureId: CreatureId; readonly durationMs: number }
  | { readonly type: "palette_shift"; readonly amount: number; readonly ms: number }
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
  | { readonly type: "wink"; readonly creatureId: CreatureId; readonly at: ScreenPos | null }
  | {
      readonly type: "cursor_pull";
      readonly creatureId: CreatureId;
      readonly from: ScreenPos | null;
      readonly strength: number;
    };

export type ShellInstruction =
  | { readonly type: "favicon_eye"; readonly intensity: number }
  | { readonly type: "title_mutate"; readonly text: string }
  | { readonly type: "outside_eyes"; readonly opacity: number };

export type RenderInstruction = CanvasInstruction | ShellInstruction;

/** How long a mirrored click rhythm is recorded before it plays back. */
export const MIRROR_WINDOW_MS = 6000;

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

function livingCreatureIds(state: WorldState): CreatureId[] {
  return Object.values(state.creatures)
    .filter((creature) => creature.behavior !== "dead")
    .map((creature) => creature.id)
    .sort((a, b) => a.localeCompare(b));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Pure. Given a valid effect and the world it lands on, returns what to draw.
 * Unknown creature ids still produce an instruction with a null anchor; the
 * host drops those rather than the director crashing the scene.
 */
export function plan(effect: RenderEffect, state: WorldState): readonly RenderInstruction[] {
  switch (effect.kind) {
    case "freeze_all":
      return [{ type: "freeze", ms: nonNegative(effect.ms) }];

    case "gaze_at_player":
      return [{ type: "gaze", creatureId: effect.creatureId, ms: nonNegative(effect.ms) }];

    case "mirror_click_rhythm":
      return [{ type: "mirror_click_rhythm", creatureId: effect.creatureId, durationMs: MIRROR_WINDOW_MS }];

    case "palette_shift":
      return [{ type: "palette_shift", amount: clamp01(effect.amount), ms: nonNegative(effect.ms) }];

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

