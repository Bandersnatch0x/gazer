/**
 * G stream — LLM bridge, from `docs/tickets/0007-*.md` and
 * `docs/design/GAME_REVIEW.md` section 11.
 *
 * Public surface of the bridge. One re-export point so `src/game.ts` wires
 * exactly one import and existing files stay untouched (zero-intrusion
 * constraint from the ticket).
 *
 * The five L-points and their fallback ladder:
 *   L1 whisper_rewrite  → resolveWhisper's built-in distorter (always wins)
 *   L2 telemetry_line   → director/manual pool (always wins)
 *   L3/L4 reflect       → deterministic fallbackReflection (always wins)
 *   L6 dreaming         → no dream (a miss is allowed to miss)
 *
 * Budget: 15 calls / 30 minutes, shared across all points via one guard; the
 * guard is soft — exhaustion silently switches every point to its fallback.
 * Cache: successful validated replies, keyed stage|trigger|hash(context);
 * hits re-validate, so a poisoned cache entry cannot promote bad text.
 */

export {
  createBridgeClient,
  type BridgeClient,
  type BridgeClientOptions,
  type BridgeClientResult,
  type BridgeRequest,
  type BridgeTaskKind,
} from "./client";

export {
  createBudgetGuard,
  DEFAULT_BUDGET_CONFIG,
  type BudgetGuard,
  type BudgetGuardConfig,
  type BudgetSnapshot,
} from "./budget";

export { cacheKey, createBridgeCache, type BridgeCache } from "./cache";

export {
  clampSigned,
  containsNumber,
  garble,
  isValidLine,
  singleLine,
  truncate,
  wordCount,
} from "./validate";

export type { TelemetryAdapter, TelemetryEvent } from "./deps";
export type { ReflectionProposal, BridgeDeps } from "./deps";

export {
  createWhisperRewriter,
  WHISPER_SYSTEM_RULES,
  buildWhisperPrompt,
  type WhisperInput,
  type WhisperRewriter,
  type WhisperRewriterDeps,
} from "./whisper";

export {
  createTelemetrySpeaker,
  TELEMETRY_SYSTEM_RULES,
  buildTelemetryPrompt,
  type LineRequest,
  type TelemetrySpeaker,
  type TelemetryLineDeps,
} from "./telemetry";

export {
  createReflector,
  REFLECT_SYSTEM_RULES,
  buildReflectPrompt,
  fallbackReflection,
  MAX_PLAYER_ENTRY_LINES,
  type ReflectionInput,
  type Reflector,
  type ReflectionDeps,
} from "./reflect";

export {
  createDreamer,
  DREAM_SYSTEM_RULES,
  buildDreamPrompt,
  type DreamInput,
  type Dreamer,
  type DreamerDeps,
} from "./dreaming";
