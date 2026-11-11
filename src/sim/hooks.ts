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
}

export interface HookRegistry {
  register(hook: HookDef): void;
  runPoint(point: LifecyclePoint, ctx: HookContext): readonly string[];
  drainAsync(): Promise<readonly string[]>;
}

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

export function createRegistry(): HookRegistry {
  const hooks: HookDef[] = [];
  const queue: { readonly hook: HookDef; readonly ctx: HookContext }[] = [];

  const registry: HookRegistry = {
    register(hook: HookDef): void {
      if (!LIFECYCLE_POINTS.includes(hook.point)) {
        throw new Error(`hook ${hook.id} targets unknown lifecycle point ${hook.point}`);
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
        try {
          hook.handler(ctx);
        } catch {
          // Recorded by id above; one broken hook never aborts the rest.
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
      });
    });
  }

  return registry;
}
