/**
 * Per-call model routing, from `docs/design/HARNESS.md` section 5.
 *
 * Five routes, each with a preferred, secondary, and fallback target. Routing is
 * chosen per call, not per session, so one slow route never degrades another.
 * `timeoutMs` is the latency budget for that call; 0 means the route is local and
 * has no network deadline.
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

const ROUTES: Readonly<Record<TaskKind, Route>> = Object.freeze({
  roundtable: Object.freeze({
    primary: "primary_hosted",
    secondary: "smaller_hosted",
    fallback: "manual_pool",
    timeoutMs: 800,
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
    timeoutMs: 1500,
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

export function isAsyncTask(kind: TaskKind): boolean {
  return OFF_CRITICAL_PATH.has(kind);
}
