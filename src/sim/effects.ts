import type { CreatureId, Mood, TilePos } from "./types";

export type Effect =
  | { readonly kind: "freeze_all"; readonly ms: number }
  | { readonly kind: "gaze_at_player"; readonly creatureId: CreatureId; readonly ms: number }
  | { readonly kind: "mirror_click_rhythm"; readonly creatureId: CreatureId }
  | { readonly kind: "palette_shift"; readonly amount: number; readonly ms: number }
  | { readonly kind: "desaturate"; readonly amount: number }
  | { readonly kind: "audio_drop_track"; readonly track: string }
  | { readonly kind: "spawn_structure"; readonly structure: "black_tower"; readonly at: TilePos }
  | { readonly kind: "relabel_ui"; readonly target: string; readonly text: string }
  | { readonly kind: "set_trait"; readonly creatureId: CreatureId; readonly trait: import("./types").CreatureTrait }
  | {
      readonly kind: "rewrite_sprite";
      readonly creatureId: CreatureId;
      readonly palette: readonly string[];
      readonly mask: readonly string[];
    }
  | { readonly kind: "glyph_corrupt"; readonly amount: number }
  | { readonly kind: "creature_speech"; readonly creatureId: CreatureId; readonly text: string; readonly mood: Mood }
  | { readonly kind: "collective_speech"; readonly text: string; readonly mood: Mood }
  | { readonly kind: "ui_shake"; readonly intensity: number; readonly ms: number }
  | { readonly kind: "creature_wink"; readonly creatureId: CreatureId }
  | { readonly kind: "cursor_pull"; readonly creatureId: CreatureId; readonly strength: number };

export interface TimedEffect {
  readonly atMs: number;
  readonly effect: Effect;
}

export const MAX_TIMED_EFFECTS = 8;
export const MAX_EFFECT_WINDOW_MS = 15000;

export type EffectKind = Effect["kind"];
