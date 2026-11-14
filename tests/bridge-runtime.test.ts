/**
 * Ticket 0066 — the bridge runtime is the pure wiring contract prepared for
 * `src/game.ts` (code-auditor wires it serially). These tests pin the contract
 * without importing game.ts: budget refusal → manualPool, cache hit, poisoned
 * cache re-validation, success-only spend, and Level B verdict:no.
 */
import { describe, expect, it } from "vitest";
import {
  createBridgeRuntime,
  type BridgeCallSpec,
} from "../src/bridge/runtime";
import { cacheKey } from "../src/bridge/cache";
import type { RoundtableTurn } from "../src/sim/roundtable";
import type { CreatureId } from "../src/sim/types";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";

const T0 = 1_000_000;

function spec(overrides: Partial<BridgeCallSpec> = {}): BridgeCallSpec {
  return {
    stage: 3,
    trigger: "roundtable",
    serialisedContext: "ctx-A",
    now: T0,
    ...overrides,
  };
}

describe("createBridgeRuntime — game.ts wiring contract (ticket 0066)", () => {
  it("exposes budget / cache / levelB and the canonical stage|trigger|hash key", () => {
    const runtime = createBridgeRuntime();
    expect(runtime.budget.snapshot(T0)).toEqual({ used: 0, limit: 15, resetsInMs: 0 });
    expect(runtime.cache.size).toBe(0);
    expect(runtime.levelB.minStage).toBe(3);
    const s = spec();
    expect(runtime.keyFor(s)).toBe(cacheKey(s.stage, s.trigger, s.serialisedContext));
    expect(runtime.keyFor(spec({ serialisedContext: "ctx-B" }))).not.toBe(runtime.keyFor(s));
    expect(runtime.keyFor(spec({ stage: 4 }))).not.toBe(runtime.keyFor(s));
  });

  it("a hard-budget refusal falls back to manualPool and never calls ask", async () => {
    const runtime = createBridgeRuntime({ maxCalls: 1, windowMs: 1000 });
    let askCalls = 0;
    let fallbackCalls = 0;
    const ask = async (_s: BridgeCallSpec): Promise<string | null> => {
      askCalls += 1;
      return "model line";
    };
    const fallback = (_s: BridgeCallSpec): string => {
      fallbackCalls += 1;
      return "manual pool line";
    };
    const deps = { ask, validate: (text: string) => text.length > 0, fallback };

    const first = await runtime.call(spec(), deps);
    expect(first).toEqual({ text: "model line", source: "model", budgetRefused: false });

    const refused = await runtime.call(spec({ trigger: "roundtable2", now: T0 + 1 }), deps);
    expect(refused).toEqual({ text: "manual pool line", source: "fallback", budgetRefused: true });
    expect(askCalls).toBe(1); // `llm:budget` refused before any upstream call
    expect(fallbackCalls).toBe(1);
  });

  it("a cache hit short-circuits both budget and ask", async () => {
    const runtime = createBridgeRuntime({ maxCalls: 1, windowMs: 1000 });
    let askCalls = 0;
    const deps = {
      ask: async (_s: BridgeCallSpec): Promise<string | null> => {
        askCalls += 1;
        return "model line";
      },
      validate: (text: string) => text.length > 0,
      fallback: () => "manual pool line",
    };
    const s = spec();
    const first = await runtime.call(s, deps);
    expect(first.source).toBe("model");

    const hit = await runtime.call(s, deps);
    expect(hit).toEqual({ text: "model line", source: "cache", budgetRefused: false });
    expect(askCalls).toBe(1);
    expect(runtime.budget.snapshot(T0).used).toBe(1); // hit never spends
  });

  it("re-validates cache hits: a poisoned entry cannot promote bad text", async () => {
    const runtime = createBridgeRuntime();
    const s = spec();
    runtime.cache.set(runtime.keyFor(s), "POISON");
    let askCalls = 0;
    const out = await runtime.call(s, {
      ask: async (_s: BridgeCallSpec): Promise<string | null> => {
        askCalls += 1;
        return "clean line";
      },
      validate: (text: string) => text !== "POISON",
      fallback: () => "manual pool line",
    });
    expect(out).toEqual({ text: "clean line", source: "model", budgetRefused: false });
    expect(askCalls).toBe(1);
  });

  it("failed / timed-out calls never spend a slot (先成功后扣)", async () => {
    const runtime = createBridgeRuntime({ maxCalls: 1, windowMs: 1000 });
    let calls = 0;
    const deps = {
      ask: async (_s: BridgeCallSpec): Promise<string | null> => {
        calls += 1;
        return calls === 1 ? null : "ok"; // first = network/timeout shape failure
      },
      validate: () => true,
      fallback: () => "manual pool line",
    };
    const failed = await runtime.call(spec({ trigger: "a" }), deps);
    expect(failed).toEqual({ text: "manual pool line", source: "fallback", budgetRefused: false });
    expect(runtime.budget.snapshot(T0).used).toBe(0);

    const ok = await runtime.call(spec({ trigger: "b", now: T0 + 1 }), deps);
    expect(ok.source).toBe("model");
    expect(runtime.budget.snapshot(T0 + 1).used).toBe(1);
  });

  it("a thrown upstream error falls back without spending", async () => {
    const runtime = createBridgeRuntime();
    const out = await runtime.call(spec(), {
      ask: async (_s: BridgeCallSpec): Promise<string | null> => {
        throw new Error("network");
      },
      validate: () => true,
      fallback: () => "manual pool line",
    });
    expect(out).toEqual({ text: "manual pool line", source: "fallback", budgetRefused: false });
    expect(runtime.budget.snapshot(T0).used).toBe(0);
  });
});

describe("Level B through the runtime contract", () => {
  const turn: RoundtableTurn = {
    speaker: "01",
    text: "you let 02 starve",
    intent: "accuse",
    mood: "wrong",
    memoryRef: "mem_1042",
  };

  function slices(): Readonly<Record<CreatureId, MemorySlice>> {
    const entry: MemoryEntry = {
      id: "mem_1042",
      atTick: 3100,
      wallClock: "03:12",
      fact: "02 starved while you watched",
      witnessed: "witnessed",
      source: null,
      distortion: null,
      salience: 0.8,
      valence: -0.9,
    };
    return { "01": { working: [entry], consolidated: [] } };
  }

  it("verdict:no swaps in the replacement and the original lands as inferred", () => {
    const runtime = createBridgeRuntime();
    expect(runtime.levelB.shouldVerify(turn, 3, ["01", "02"], 0)).toBe(true);
    expect(runtime.levelB.shouldVerify(turn, 2, ["01", "02"], 0)).toBe(false);
    expect(runtime.levelB.shouldVerify(turn, 3, ["01", "02"], 1)).toBe(false);

    const { turn: settled, inferred } = runtime.levelB.applyVerdict(
      turn,
      { verdict: "no", replacement: "  i saw nothing  " },
      slices(),
    );
    expect(settled.text).toBe("i saw nothing");
    expect(inferred).not.toBeNull();
    expect(inferred?.id).toBe("mem_1043");
    expect(inferred?.witnessed).toBe("inferred");
    expect(inferred?.fact).toContain("you let 02 starve");
    expect(inferred?.fact.startsWith("heard another say")).toBe(true);
  });

  it("verdict:yes keeps the original turn and records nothing", () => {
    const runtime = createBridgeRuntime();
    const result = runtime.levelB.applyVerdict(
      turn,
      { verdict: "yes", replacement: "something else" },
      slices(),
    );
    expect(result.turn).toBe(turn);
    expect(result.inferred).toBeNull();
  });
});
