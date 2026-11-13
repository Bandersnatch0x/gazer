import { describe, expect, it } from "vitest";
import type { ConsolidatedEntry, MemorySlice } from "../src/sim/memory";
import {
  createReflector,
  fallbackReflection,
  type ReflectionDeps,
  type ReflectionInput,
} from "../src/bridge/reflect";
import type { BridgeClient, BridgeRequest } from "../src/bridge/client";
import { createBudgetGuard } from "../src/bridge/budget";
import { createBridgeCache } from "../src/bridge/cache";

interface SpyClient {
  readonly client: BridgeClient;
  readonly requests: BridgeRequest[];
}

function spyClient(
  reply: { ok: true; text: string } | { ok: false; reason: "timeout" | "network" },
): SpyClient {
  const requests: BridgeRequest[] = [];
  const client: BridgeClient = {
    async ask(request: BridgeRequest) {
      requests.push(request);
      return reply;
    },
  };
  return { client, requests };
}

function consolidated(id: string, content: string): ConsolidatedEntry {
  return {
    id,
    content,
    derivedFrom: [],
    consolidatedAt: "tick_10",
    perspectiveNote: null,
  };
}

function slice(
  consolidatedEntries: readonly ConsolidatedEntry[] = [],
  workingFacts: readonly string[] = [],
): MemorySlice {
  return {
    consolidated: consolidatedEntries,
    working: workingFacts.map((fact, index) => ({
      id: `mem_${index + 1}`,
      atTick: index + 1,
      wallClock: `tick_${index + 1}`,
      fact,
      witnessed: "witnessed" as const,
      source: null,
      distortion: null,
      salience: 0.5,
      valence: 0,
    })),
  };
}

function deps(client: BridgeClient, cache?: ReturnType<typeof createBridgeCache>): ReflectionDeps {
  return { client, budget: createBudgetGuard(), ...(cache ? { cache } : {}) };
}

function input(
  sliceValue: MemorySlice,
  overrides?: Partial<Pick<ReflectionInput, "stage" | "worldSeed" | "creatureId">>,
): ReflectionInput {
  return {
    stage: 2,
    creatureId: "01",
    slice: sliceValue,
    worldSeed: 42,
    ...overrides,
  };
}

const GOOD_PAYLOAD = JSON.stringify({
  belief: "observer",
  entry: ["you count our breaths", "the hand is a cursor"],
  effects: [{ kind: "palette_shift", amount: 0.1 }],
});

describe("reflector (L3/L4)", () => {
  it("parses a valid reply into proposals and garbled album lines", async () => {
    const spy = spyClient({ ok: true, text: GOOD_PAYLOAD });
    const reflector = createReflector(deps(spy.client));

    const result = await reflector.reflect(input(slice([consolidated("c1", "the keeper feeds us")])));

    expect(result.belief).toBe("observer");
    expect(result.effects).toEqual([{ kind: "palette_shift", amount: 0.1, ms: 4000 }]);
    expect(result.playerEntry).toHaveLength(2);
    // Undecoded lines are garbled, deterministic per seed.
    expect(result.playerEntry[0]).not.toBe("you count our breaths");
    expect(result.playerEntry).toEqual(result.playerEntry);
    expect(spy.requests[0]?.kind).toBe("reflect");
  });

  it("caps album lines at three and drops malformed ones", async () => {
    const spy = spyClient({
      ok: true,
      text: JSON.stringify({
        belief: "record",
        entry: ["one", "two", "three", "four", 42, ""],
        effects: [],
      }),
    });
    const reflector = createReflector(deps(spy.client));

    const result = await reflector.reflect(input(slice([], ["kept memory"])));
    expect(result.playerEntry).toHaveLength(3);
    expect(result.belief).toBe("record");
  });

  it("rejects effect amounts above the engine ceiling", async () => {
    const spy = spyClient({
      ok: true,
      text: JSON.stringify({
        belief: "pet",
        entry: [],
        effects: [{ kind: "desaturate", amount: 0.9 }],
      }),
    });
    const reflector = createReflector(deps(spy.client));

    const result = await reflector.reflect(input(slice([], ["kept memory"])));
    expect(result.effects).toEqual([]);
    expect(result.belief).toBe("pet");
  });

  it("falls back deterministically on a timeout", async () => {
    const spy = spyClient({ ok: false, reason: "timeout" });
    const reflector = createReflector(deps(spy.client));
    const sliceValue = slice([consolidated("c1", "the keeper feeds us")]);

    const result = await reflector.reflect(input(sliceValue));
    expect(result).toEqual(fallbackReflection("01", sliceValue, 42));
    expect(result.effects).toEqual([]);
    expect(result.playerEntry.length).toBeGreaterThan(0);
  });

  it("falls back without a call on an empty memory slice", async () => {
    const spy = spyClient({ ok: true, text: GOOD_PAYLOAD });
    const reflector = createReflector(deps(spy.client));

    const result = await reflector.reflect(input(slice()));
    expect(result).toEqual(fallbackReflection("01", slice(), 42));
    expect(result.belief).toBe("pet");
    expect(result.playerEntry).toEqual([]);
    expect(spy.requests).toHaveLength(0);
  });

  it("falls back without calling the model when the budget is spent", async () => {
    const spy = spyClient({ ok: true, text: GOOD_PAYLOAD });
    const reflector = createReflector({
      client: spy.client,
      budget: createBudgetGuard({ maxCalls: 0 }),
    });
    const sliceValue = slice([consolidated("c1", "the keeper feeds us")]);

    expect(await reflector.reflect(input(sliceValue))).toEqual(
      fallbackReflection("01", sliceValue, 42),
    );
    expect(spy.requests).toHaveLength(0);
  });

  it("falls back when the payload is not JSON", async () => {
    const spy = spyClient({ ok: true, text: "i have concluded things. trust me" });
    const reflector = createReflector(deps(spy.client));
    const sliceValue = slice([consolidated("c1", "the keeper feeds us")]);

    expect(await reflector.reflect(input(sliceValue))).toEqual(
      fallbackReflection("01", sliceValue, 42),
    );
  });

  it("serves a repeated reflection from cache", async () => {
    const spy = spyClient({ ok: true, text: GOOD_PAYLOAD });
    const cache = createBridgeCache();
    const reflector = createReflector(deps(spy.client, cache));
    const sliceValue = slice([consolidated("c1", "the keeper feeds us")]);

    const first = await reflector.reflect(input(sliceValue));
    const second = await reflector.reflect(input(sliceValue));

    expect(second).toEqual(first);
    expect(spy.requests).toHaveLength(1);
  });

  it("garbles the fallback album lines deterministically", () => {
    const sliceValue = slice([consolidated("c1", "the keeper feeds us at night")]);
    const first = fallbackReflection("01", sliceValue, 7);
    const second = fallbackReflection("01", sliceValue, 7);
    expect(first.playerEntry).toEqual(second.playerEntry);
    expect(first.playerEntry[0]).not.toBe("the keeper feeds us at night");
  });
});
