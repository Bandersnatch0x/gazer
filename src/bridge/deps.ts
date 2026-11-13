/**
 * Bridge dependency interfaces, frozen per ticket 0007 so the G stream stays
 * zero-intrusion: the bridge never imports from `src/game.ts`, and the game
 * wires real adapters in one place (`src/bridge/index.ts` re-exports the
 * concrete `createWhisperRewriter` etc. already bound to these shapes).
 */

import type { CreatureId } from "../sim/types";
import type { Effect, TimedEffect } from "../sim/effects";

/** Mirror of `src/sim/ledger.ts`'s event shape, read-only for the bridge. */
export type TelemetryEvent =
  | { readonly kind: "feed"; readonly creatureId: CreatureId; readonly hesitationMs: number }
  | { readonly kind: "clean"; readonly creatureId: CreatureId }
  | { readonly kind: "stare"; readonly creatureId: CreatureId; readonly durationMs: number }
  | { readonly kind: "rapid_click"; readonly creatureId: CreatureId; readonly count: number }
  | { readonly kind: "drag_to_hazard"; readonly creatureId: CreatureId }
  | { readonly kind: "death"; readonly creatureId: CreatureId; readonly cause: "starvation" | "neglect" }
  | { readonly kind: "idle"; readonly durationMs: number }
  | { readonly kind: "session_start"; readonly localHour: number }
  | { readonly kind: "player_answer"; readonly question: string; readonly answer: string };

export interface TelemetryAdapter {
  /** Most recent events, oldest first. Implementations may return fewer. */
  recent(count: number): readonly TelemetryEvent[];
}

export type EffectsSink = (effects: readonly TimedEffect[]) => void;

export type EntityKind = "pet" | "organism" | "observer" | "record" | "substrate";

export interface ReflectionProposal {
  /** Effects to apply. Empty for a purely behavioural conclusion. */
  readonly effects: readonly Effect[];
  /** Undecoded entry lines for the album, in decode order. */
  readonly playerEntry: readonly string[];
  /** The creature's conclusion about the player, never shown raw. */
  readonly belief: EntityKind | null;
}

export interface BridgeDeps {
  readonly telemetry: TelemetryAdapter;
  readonly effects: EffectsSink;
}
