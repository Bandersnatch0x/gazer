/**
 * Per-call model routing, from `docs/design/HARNESS.md` section 5.
 *
 * Five routes, each with a preferred, secondary, and fallback target. Routing is
 * chosen per call, not per session, so one slow route never degrades another.
 * `timeoutMs` is the latency budget for that call; 0 means the route is local and
 * has no network deadline.
 *
 * 0079 honesty note: this table is the CONTRACT target. The current deployment
 * provisions a single upstream model; there is no separate smaller-model
 * endpoint, so `secondary` is not selected at runtime yet. `fallback` is real
 * (manualPool / scripted table / seeded PRNG / keep-original-turn). The HARNESS
 * §5 table is annotated to match. Do not cite this table as proof of five
 * independent network capabilities.
 */

export type TaskKind =
  | "roundtable"
  | "ontology_staging"
  | "consolidation"
  | "level_b"
  | "tts";

export interface Route {
  readonly primary: string;
  readonly secondary: string;
  readonly fallback: string;
  readonly timeoutMs: number;
}

/**
 * `ontology_staging` and `consolidation` are off the critical path: their budget
 * is a ceiling on a background call, not a scene deadline.
 */
const OFF_CRITICAL_PATH: ReadonlySet<TaskKind> = new Set(["ontology_staging", "consolidation"]);

/** Latency budgets are transcribed from `HARNESS.md` §5 (ticket 0069). */
const ROUTES: Readonly<Record<TaskKind, Route>> = Object.freeze({
  roundtable: Object.freeze({
    primary: "primary_hosted",
    secondary: "smaller_hosted",
    fallback: "manual_pool",
    // 0023 (2026-11-15) supersedes 0019's 800ms: the live jam endpoint answers a
    // full scene in ~3.4–3.9s, so 800ms aborted every real call into the manual
    // pool and the model's lines effectively never appeared. 4000ms keeps the
    // real path viable; failures still fall back and are absorbed by the
    // voice_degraded narration (HARNESS §6).
    timeoutMs: 4000,
  }),
  ontology_staging: Object.freeze({
    primary: "primary_hosted_effect_schema",
    secondary: "smaller_hosted",
    fallback: "scripted_shift_table",
    timeoutMs: 1200,
  }),
  consolidation: Object.freeze({
    primary: "primary_hosted",
    secondary: "smaller_hosted",
    fallback: "seeded_prng_drift",
    timeoutMs: 2000,
  }),
  level_b: Object.freeze({
    primary: "primary_hosted_single_creature",
    secondary: "smaller_hosted",
    fallback: "keep_original_turn",
    // HARNESS §5: 600 ms for the single-creature verification call.
    timeoutMs: 600,
  }),
  tts: Object.freeze({
    primary: "browser_speech_synthesis",
    secondary: "text_bubbles",
    fallback: "text_bubbles",
    timeoutMs: 0,
  }),
});

export function routeTask(kind: TaskKind): Route {
  // A runtime caller can hand us a string outside the union; the roundtable route
  // is the safe default because it is the one path the game cannot run without.
  return ROUTES[kind] ?? ROUTES.roundtable;
}

/** 0078: the latency budget a caller (incl. the dev/preview middleware) should
 *  enforce for a task. Single source so client and server do not drift. */
export function routeTimeoutMs(kind: TaskKind): number {
  return routeTask(kind).timeoutMs;
}

export function isAsyncTask(kind: TaskKind): boolean {
  return OFF_CRITICAL_PATH.has(kind);
}
