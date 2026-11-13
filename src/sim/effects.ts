import type { CreatureId, Mood, TilePos } from "./types";

/**
 * Ticket 0025 — canvas-layer FX kinds folded into the union (ruling F1).
 *
 * The 16 legacy kinds keep their exact semantics. Three of them grow optional
 * fields so the FX executor can carry its canvas payload through the existing
 * face (an absent field means the legacy behaviour, byte for byte):
 *   - `freeze_all.pose` (C-01): freeze in the current pose or in ALERT;
 *   - `mirror_click_rhythm.repeatN/tol` (C-02): how many clicks the mirror
 *     answers and the rhythm tolerance it copies;
 *   - `palette_shift.hueRot/recover` (C-03): a signed hue rotation in degrees
 *     and whether it recovers (recover=false never reaches this kind — it is
 *     the C-03a branch and dispatches `palette_pollution`).
 * The eight kinds with no legacy counterpart are new: they are only emitted
 * through the FX executor (`src/sim/fx.ts`), never by the engine.
 */
export type Effect =
  | { readonly kind: "freeze_all"; readonly ms: number; readonly pose?: "keep" | "alert" }
  | { readonly kind: "gaze_at_player"; readonly creatureId: CreatureId; readonly ms: number }
  | {
      readonly kind: "mirror_click_rhythm";
      readonly creatureId: CreatureId;
      readonly repeatN?: number;
      readonly tol?: number;
    }
  | { readonly kind: "palette_shift"; readonly amount: number; readonly ms: number; readonly hueRot?: number; readonly recover?: boolean }
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
  | {
      readonly kind: "creature_wink";
      readonly creatureId: CreatureId;
      /**
       * Wink duration in ms (ticket 0047). Absent = the 260ms horizontal
       * squeeze — the ordinary C-05 face, byte for byte as before. The
       * demagnetize linkage passes 16: one frame, both eyelids closed
       * (ART-CORE-04 §5), rendered through the masks closed-eye face.
       */
      readonly ms?: number;
    }
  | { readonly kind: "cursor_pull"; readonly creatureId: CreatureId; readonly strength: number }
  // --- Ticket 0025: the canvas-layer FX kinds (C-01a…C-12 faces with no
  // legacy counterpart). Emitted only by the FX executor. ---
  /** C-03a: permanent hue pollution in degrees; the executor hard-counts ≤45. */
  | { readonly kind: "palette_pollution"; readonly degrees: number }
  /** C-04: pupils borrow the tower black (`eye_only`) or the whole sprite does (`full`). */
  | { readonly kind: "sprite_corrupt"; readonly target: "all" | CreatureId; readonly mode: "eye_only" | "full" }
  /** C-06: every living creature closes into the watching ring, ALERT, pupils centred. */
  | { readonly kind: "collective_gaze"; readonly ms: number }
  /** C-07: the last ten keeper actions replay from the Ledger; low fidelity = remembered wrong. */
  | { readonly kind: "replay_player_action"; readonly window: "last_10"; readonly fidelity: number }
  /** C-08: local withering, overlaid on the world's own mood, never replacing it. */
  | { readonly kind: "map_wither"; readonly radius: number; readonly around: "death_site" | "last_click" }
  /** C-10: a fading tail trails a moving creature — the timing is wrong. */
  | { readonly kind: "afterimage"; readonly creatureId: CreatureId; readonly tailMs: number }
  /** C-11: lineage nodes that died turn black and the tree leans toward the tower. */
  | { readonly kind: "lineage_blacken"; readonly deadIds: readonly CreatureId[]; readonly leanTo: "tower" }
  /** C-12: an unhatched egg quivers in the rhythm of the keeper's clicks. */
  | { readonly kind: "egg_pulse"; readonly eggId: string; readonly rhythm: "player_click" }
  /**
   * E4's one canonical exception (ticket 0033, NARRATIVE-CORE-02 E4 + N3, ruling
   * 0012-6): a creature turns its body to the tower and holds the gaze. The
   * pupil rules never see the tower (ART-CORE-03 §6.4 — in the pupil's rules it
   * does not exist): the render face shows the back silhouette, so there is no
   * pupil to move. Engine-owned, N3-gated (exactly one per save); not a
   * master-table FX primitive.
   */
  | { readonly kind: "gaze_at_tower"; readonly creatureId: CreatureId; readonly ms: number };

export interface TimedEffect {
  readonly atMs: number;
  readonly effect: Effect;
}

export const MAX_TIMED_EFFECTS = 8;
export const MAX_EFFECT_WINDOW_MS = 15000;

export type EffectKind = Effect["kind"];

/**
 * FX bridge (ticket 0024, architecture ruling F1; extended by ticket 0025).
 * The FX executor (`src/sim/fx.ts`) is the sole gatekeeper for the 30-primitive
 * FX library (spec IDs C-01…A-06, `docs/design/fx/FX-LIB-MASTER.md`). It
 * validates the parameter whitelist, gates and caps, charges the per-game-day
 * anomaly budget, enforces the canon guards (master §2), books `fx_exec` ledger
 * entries — and only then dispatches, by translating into the kinds of this
 * union (e.g. FX `all_freeze` → `freeze_all`) or into the structural twin of
 * the render-side shell kinds (`favicon_eye`, `outside_eyes`). Ticket 0025
 * folds the canvas layer in: the executor's canvas primitives land on the new
 * kinds above, while the 16 legacy kinds keep their exact semantics (their
 * three optional-field extensions default to the legacy behaviour). Unknown FX
 * kinds never reach this union.
 */
