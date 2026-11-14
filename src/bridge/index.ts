/**
 * G stream — LLM bridge, from `docs/tickets/0007-*.md` and
 * `docs/design/GAME_REVIEW.md` section 11.
 *
 * Public surface of the bridge: a re-export point only. As of ticket 0066
 * `src/game.ts` DOES import from here — the single wiring point is
 * `createBridgeRuntime()` (see ./runtime.ts), used by the Level A roundtable,
 * the Level B verification gate and the `llm:budget` hook. The earlier claim
 * "game.ts wires exactly one import" was false while the layer was untested
 * dead code, and the later "game.ts does NOT import from here yet" note is now
 * retired: the wiring is live.
 *
 * The five L-points and their fallback ladder:
 *   L1 whisper_rewrite  → resolveWhisper's built-in distorter (always wins)
 *   L2 telemetry_line   → director/manual pool (always wins)
 *   L3/L4 reflect       → deterministic fallbackReflection (always wins)
 *   L6 dreaming         → no dream (a miss is allowed to miss)
 *
 * Budget: a HARD ceiling of 15 calls / 30 minutes
 * (`docs/design/ARCHITECTURE.md` §Cost / decision 0018 ③). `llm:budget`
 * refuses the call at the ceiling and the route falls back to manualPool.
 * Exhaustion is silent for the player (no error UI), but the limit is NOT
 * relaxable — the older "guard is soft" wording was inaccurate and is removed.
 * Only successful, validated responses spend a slot; failures and timeouts
 * never do (ticket 0066, 先成功后扣).
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
  createBudgetAdmission,
  DEFAULT_BUDGET_CONFIG,
  type BudgetGuard,
  type BudgetGuardConfig,
  type BudgetSnapshot,
  type BudgetAdmission,
} from "./budget";

export {
  createBridgeRuntime,
  type BridgeRuntime,
  type BridgeRuntimeOptions,
  type BridgeCallSpec,
  type BridgeCallResult,
  type BridgeCallSource,
  type BridgeCallDeps,
  type BridgeLevelB,
} from "./runtime";

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
