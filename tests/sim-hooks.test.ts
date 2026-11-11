import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { createRegistry, LIFECYCLE_POINTS } from "../src/sim/hooks";
import type { HookContext, HookDef, LifecyclePoint } from "../src/sim/hooks";
import type { WorldState } from "../src/sim/types";

function world(): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures: {},
    structures: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1,
    silent: false,
  };
}

function ctx(point: LifecyclePoint): HookContext {
  return { point, tick: 0, state: world(), event: null, payload: {} };
}

function hook(id: string, priority: number, point: LifecyclePoint = "llm:budget"): HookDef {
  return { point, id, priority, sync: true, handler: () => undefined, logged: false };
}

describe("hook registry", () => {
  it("runs sync hooks by ascending priority, ties broken by id", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -50, max: 50 }), { minLength: 1, maxLength: 8 }),
        (priorities) => {
          const registry = createRegistry();
          const ids = priorities.map((_, index) => `h${index}`);
          ids.forEach((id, index) => registry.register(hook(id, priorities[index] ?? 0)));

          const expected = [...ids].sort((left, right) => {
            const leftPriority = priorities[ids.indexOf(left)] ?? 0;
            const rightPriority = priorities[ids.indexOf(right)] ?? 0;
            if (leftPriority !== rightPriority) {
              return leftPriority - rightPriority;
            }
            return left < right ? -1 : left > right ? 1 : 0;
          });

          expect(registry.runPoint("llm:budget", ctx("llm:budget"))).toEqual(expected);
        },
      ),
    );
  });

  it("records a throwing hook and keeps running the rest", () => {
    const registry = createRegistry();
    const calls: string[] = [];
    registry.register({
      ...hook("boom", 10),
      handler: () => {
        calls.push("boom");
        throw new Error("handler exploded");
      },
    });
    registry.register({
      ...hook("after", 20),
      handler: () => {
        calls.push("after");
      },
    });

    expect(registry.runPoint("llm:budget", ctx("llm:budget"))).toEqual(["boom", "after"]);
    expect(calls).toEqual(["boom", "after"]);
  });

  it("skips a hook whose guard returns false", () => {
    const registry = createRegistry();
    registry.register({ ...hook("gated", 10), guard: () => false });
    registry.register(hook("open", 20));

    expect(registry.runPoint("llm:budget", ctx("llm:budget"))).toEqual(["open"]);
  });

  it("queues async hooks until drainAsync", async () => {
    const registry = createRegistry();
    const calls: string[] = [];
    registry.register({
      point: "memory:propagate",
      id: "later",
      priority: 10,
      sync: false,
      handler: async () => {
        calls.push("later");
      },
      logged: false,
    });

    expect(registry.runPoint("memory:propagate", ctx("memory:propagate"))).toEqual([]);
    expect(calls).toEqual([]);
    await expect(registry.drainAsync()).resolves.toEqual(["later"]);
    expect(calls).toEqual(["later"]);
  });

  it("registers the first table from the harness document", async () => {
    const registry = createRegistry();

    expect(registry.runPoint("sim:tick", ctx("sim:tick"))).toEqual([
      "gv_accumulator",
      "ontology_ratchet_check",
    ]);
    expect(registry.runPoint("action:post", ctx("action:post"))).toEqual([
      "ledger_writer",
      "gaze_detector",
      "hesitation_recorder",
    ]);
    expect(registry.runPoint("gv:cross", ctx("gv:cross"))).toEqual(["awakening_events", "stage_gate"]);
    expect(registry.runPoint("creature:death", ctx("creature:death"))).toEqual([
      "core_memory_mark",
      "swarm_mourning_queue",
    ]);
    expect(registry.runPoint("session:end", ctx("session:end"))).toEqual([]);
    await expect(registry.drainAsync()).resolves.toEqual(["drift_consolidation", "genome_persist"]);
  });

  it("rejects a hook on an unknown lifecycle point", () => {
    const registry = createRegistry();
    expect(() =>
      registry.register(hook("stray", 0, "nowhere" as unknown as LifecyclePoint)),
    ).toThrow(/unknown lifecycle point/);
    expect(LIFECYCLE_POINTS).toHaveLength(12);
  });
});
