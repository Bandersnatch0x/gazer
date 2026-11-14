/**
 * Pure wiring contract for `src/game.ts` (ticket 0066, decision 0018 ③).
 *
 * The bridge layer used to be reachable only through tests: `src/game.ts`
 * imported nothing from `src/bridge/`. This factory is the single object the
 * game needs — one import, no game-side reimplementation of budget/cache:
 *
 * ```ts
 * import { createBridgeRuntime } from "./bridge";
 * const runtime = createBridgeRuntime();
 *
 * // Level A (roundtable) — see 0066 Log "game.ts 侧接线契约":
 * const spec = { stage: world.stage, trigger: "roundtable",
 *                serialisedContext: context.text, now: Date.now() };
 * const out = await runtime.call(spec, {
 *   ask:       () => client.ask(context.text).then(r => r.ok ? r.text : null),
 *   validate:  (text) => parseRoundtable(text) !== null,   // or isValidLine
 *   fallback:  () => manualLine(world.stage, seed, telemetry),
 * });
 * playScene(out.text);   // out.source === "cache" | "model" | "fallback"
 *
 * // Level B — at most one verification per scene, stage>=3, another present:
 * if (runtime.levelB.shouldVerify(turn, world.stage, present, verified)) {
 *   const verdict = await verifyTurn(turn);                 // LevelBVerdict
 *   const { turn: settled, inferred } =
 *     runtime.levelB.applyVerdict(turn, verdict, world.memories ?? {});
 *   // `inferred` (witnessed: "inferred") is appended by the caller.
 * }
 * ```
 *
 * Everything here is pure except the injected `ask`; the runtime itself does no
 * fetch, no clock read and no DOM access. `vite.config.ts` shares the very same
 * `createBudgetAdmission` so the dev/preview middleware and the game-side
 * budget cannot drift apart.
 */

import type { Stage } from "../sim/types";
import {
  DEFAULT_BUDGET_CONFIG,
  createBudgetAdmission,
  type BudgetAdmission,
} from "./budget";
import { cacheKey, createBridgeCache, type BridgeCache } from "./cache";
import {
  LEVEL_B_MIN_STAGE,
  applyVerdict,
  shouldVerify,
} from "../director/verify";

export interface BridgeRuntimeOptions {
  /** Hard ceiling per sliding window; defaults to 15. */
  readonly maxCalls?: number;
  /** Sliding window in ms; defaults to 30 minutes. */
  readonly windowMs?: number;
  /** LRU capacity; defaults to DEFAULT_CACHE_CAPACITY (64). */
  readonly cacheCapacity?: number;
}

/** One LLM call's identity. `serialisedContext` is the assembled prompt text. */
export interface BridgeCallSpec {
  readonly stage: Stage;
  readonly trigger: string;
  readonly serialisedContext: string;
  /** Supplied by the caller (Date.now()); the runtime never reads a clock. */
  readonly now: number;
}

export type BridgeCallSource = "cache" | "model" | "fallback";

export interface BridgeCallResult {
  readonly text: string;
  readonly source: BridgeCallSource;
  /** true when `llm:budget` refused before any upstream call. */
  readonly budgetRefused: boolean;
}

export interface BridgeCallDeps {
  /** One upstream call. Resolve `null` on network/timeout/shape failure. */
  readonly ask: (spec: BridgeCallSpec) => Promise<string | null>;
  /** Applied to model text AND to cache hits (poisoned entries cannot pass). */
  readonly validate: (text: string) => boolean;
  /** manualPool line used when the budget refuses or the call fails. */
  readonly fallback: (spec: BridgeCallSpec) => string;
}

export interface BridgeLevelB {
  readonly minStage: Stage;
  readonly shouldVerify: typeof shouldVerify;
  readonly applyVerdict: typeof applyVerdict;
}

export interface BridgeRuntime {
  /** Two-phase hard budget: `allows` reserves, `settle` spends on success. */
  readonly budget: BudgetAdmission;
  readonly cache: BridgeCache;
  readonly levelB: BridgeLevelB;
  /** `stage|trigger|hash(serialised context)` per `src/bridge/cache.ts:26`. */
  keyFor(spec: BridgeCallSpec): string;
  /**
   * cache hit → budget refusal → ask → settle → cache set. Only a validated
   * success spends quota; a failure falls back to manualPool without spending.
   */
  call(spec: BridgeCallSpec, deps: BridgeCallDeps): Promise<BridgeCallResult>;
}

export function createBridgeRuntime(options: BridgeRuntimeOptions = {}): BridgeRuntime {
  const budget = createBudgetAdmission({
    maxCalls: options.maxCalls ?? DEFAULT_BUDGET_CONFIG.maxCalls,
    windowMs: options.windowMs ?? DEFAULT_BUDGET_CONFIG.windowMs,
  });
  const cache = createBridgeCache(options.cacheCapacity);
  const levelB: BridgeLevelB = {
    minStage: LEVEL_B_MIN_STAGE,
    shouldVerify,
    applyVerdict,
  };

  const keyFor = (spec: BridgeCallSpec): string =>
    cacheKey(spec.stage, spec.trigger, spec.serialisedContext);

  const call = async (spec: BridgeCallSpec, deps: BridgeCallDeps): Promise<BridgeCallResult> => {
    const key = keyFor(spec);
    const hit = cache.get(key);
    if (hit !== null && deps.validate(hit)) {
      return { text: hit, source: "cache", budgetRefused: false };
    }
    if (!budget.allows(spec.now)) {
      // `llm:budget` refuses the call; the route falls back to manual pools.
      return { text: deps.fallback(spec), source: "fallback", budgetRefused: true };
    }
    let text: string | null = null;
    try {
      const raw = await deps.ask(spec);
      if (raw !== null && deps.validate(raw)) {
        text = raw;
      }
    } catch {
      text = null;
    }
    // 先成功后扣: failures / timeouts / invalid output never spend a slot.
    budget.settle(spec.now, text !== null);
    if (text !== null) {
      cache.set(key, text);
      return { text, source: "model", budgetRefused: false };
    }
    return { text: deps.fallback(spec), source: "fallback", budgetRefused: false };
  };

  return { budget, cache, levelB, keyFor, call };
}
