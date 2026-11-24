import type { SimEvent } from "./engine";
import type { WorldState } from "./types";

export type LifecyclePoint =
  | "sim:tick"
  | "action:pre"
  | "action:post"
  | "ledger:anchor"
  | "gv:cross"
  | "stage:shift"
  | "creature:death"
  | "memory:propagate"
  | "session:start"
  | "session:end"
  | "llm:budget"
  | "llm:fallback";

export const LIFECYCLE_POINTS: readonly LifecyclePoint[] = [
  "sim:tick",
  "action:pre",
  "action:post",
  "ledger:anchor",
  "gv:cross",
  "stage:shift",
  "creature:death",
  "memory:propagate",
  "session:start",
  "session:end",
  "llm:budget",
  "llm:fallback",
];

export interface HookContext {
  readonly point: LifecyclePoint;
  readonly tick: number;
  readonly state: WorldState;
  readonly event: SimEvent | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface HookDef {
  point: LifecyclePoint;
  id: string;
  priority: number;
  sync: boolean;
  guard?: (ctx: HookContext) => boolean;
  handler: (ctx: HookContext) => void | Promise<void>;
  logged: boolean;
  /**
   * Resources this hook declares it may write. A reserved resource can be
   * declared by its named owner only; any other hook is refused at install.
   */
  writes?: readonly string[];
}

/** R7.2: a sync hook over this budget gets an overrun record, not a block. */
export const HOOK_SYNC_BUDGET_MS = 5;

export interface HookOverrun {
  readonly hookId: string;
  readonly point: LifecyclePoint;
  readonly ms: number;
}

export interface HookRegistryOptions {
  /**
   * Injected clock for the 5 ms overrun measurement. Absent means no timing is
   * taken, so the sim layer still reads no clock by default. The game layer
   * injects `performance.now`.
   */
  readonly now?: () => number;
}

export interface HookRegistry {
  register(hook: HookDef): void;
  runPoint(point: LifecyclePoint, ctx: HookContext): readonly string[];
  drainAsync(): Promise<readonly string[]>;
  /** Sync-hook overruns observed after the last `runPoint` pass, newest last. */
  overruns(): readonly HookOverrun[];
}

/** R7.4: single-writer resources, by hook id. */
const RESERVED_WRITES: Readonly<Record<string, string>> = Object.freeze({
  ontology: "ontology_ratchet_check",
});

/** The first registry's declared write scopes. */
const FIRST_WRITES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ontology_ratchet_check: ["ontology"],
});

/** Points whose hooks are enqueued rather than run inside the tick. */
const ASYNC_POINTS: ReadonlySet<LifecyclePoint> = new Set<LifecyclePoint>([
  "stage:shift",
  "memory:propagate",
  "session:start",
  "session:end",
]);

/** Harness section 4, first registry. Data, not code. */
const FIRST_REGISTRY: readonly (readonly [LifecyclePoint, readonly string[]])[] = [
  ["sim:tick", ["gv_accumulator", "ontology_ratchet_check"]],
  ["action:post", ["ledger_writer", "gaze_detector", "hesitation_recorder"]],
  ["gv:cross", ["awakening_events", "stage_gate"]],
  ["creature:death", ["core_memory_mark", "swarm_mourning_queue"]],
  ["session:end", ["drift_consolidation", "genome_persist"]],
];

function compareHooks(a: HookDef, b: HookDef): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function passesGuard(hook: HookDef, ctx: HookContext): boolean {
  if (hook.guard === undefined) {
    return true;
  }
  try {
    return hook.guard(ctx);
  } catch {
    return false;
  }
}

export function createRegistry(options: HookRegistryOptions = {}): HookRegistry {
  const hooks: HookDef[] = [];
  const queue: { readonly hook: HookDef; readonly ctx: HookContext }[] = [];
  const overruns: HookOverrun[] = [];
  const now = options.now;

  const registry: HookRegistry = {
    register(hook: HookDef): void {
      if (!LIFECYCLE_POINTS.includes(hook.point)) {
        throw new Error(`hook ${hook.id} targets unknown lifecycle point ${hook.point}`);
      }
      for (const resource of hook.writes ?? []) {
        const owner = RESERVED_WRITES[resource];
        if (owner !== undefined && owner !== hook.id) {
          throw new Error(`hook ${hook.id} may not write ${resource}; reserved for ${owner}`);
        }
      }
      hooks.push(hook);
    },

    runPoint(point: LifecyclePoint, ctx: HookContext): readonly string[] {
      const ran: string[] = [];
      for (const hook of hooks.filter((entry) => entry.point === point).sort(compareHooks)) {
        if (!passesGuard(hook, ctx)) {
          continue;
        }
        if (!hook.sync) {
          queue.push({ hook, ctx });
          continue;
        }
        ran.push(hook.id);
        const startedAt = now === undefined ? 0 : now();
        try {
          hook.handler(ctx);
        } catch {
          // Recorded by id above; one broken hook never aborts the rest.
        }
        if (now !== undefined) {
          const elapsed = now() - startedAt;
          if (elapsed > HOOK_SYNC_BUDGET_MS) {
            // R7.2: record the overrun; the tick is not blocked further.
            overruns.push({ hookId: hook.id, point, ms: elapsed });
          }
        }
      }
      return ran;
    },

    async drainAsync(): Promise<readonly string[]> {
      const pending = queue.splice(0, queue.length);
      const ran: string[] = [];
      for (const { hook, ctx } of pending) {
        ran.push(hook.id);
        try {
          await hook.handler(ctx);
        } catch {
          // Same rule as sync hooks: recorded, not fatal.
        }
      }
      return ran;
    },
    overruns(): readonly HookOverrun[] {
      return [...overruns];
    },
  };

  for (const [point, ids] of FIRST_REGISTRY) {
    ids.forEach((id, index) => {
      registry.register({
        point,
        id,
        priority: index * 10,
        sync: !ASYNC_POINTS.has(point),
        handler: () => undefined,
        logged: false,
        writes: FIRST_WRITES[id] ?? [],
      });
    });
  }

  return registry;
}
