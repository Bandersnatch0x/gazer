import { describe, expect, it } from "vitest";
import { createDreamer, type DreamerDeps } from "../src/bridge/dreaming";
import type { BridgeClient, BridgeRequest } from "../src/bridge/client";
import { createBudgetGuard } from "../src/bridge/budget";

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

function deps(
  client: BridgeClient,
  budget = createBudgetGuard(),
): DreamerDeps {
  return { client, budget };
}

describe("dreamer (L6)", () => {
  it("stamps a valid dream as a weak inferred memory", async () => {
    const spy = spyClient({ ok: true, text: "the tower was made of hands" });
    const dreamer = createDreamer(deps(spy.client));

    const dream = await dreamer.dream({ creatureId: "02", stage: 2, worldSeed: 9 });

    expect(dream).not.toBeNull();
    expect(dream?.witnessed).toBe("inferred");
    expect(dream?.source).toBeNull();
    expect(dream?.distortion).toBeNull();
    expect(dream?.salience).toBe(0.2);
    expect(dream?.id.startsWith("dream_")).toBe(true);
    expect(dream?.fact.length).toBeGreaterThan(0);
    // The dream text is garbled: the creature never saw itself dream it.
    expect(dream?.fact).not.toBe("the tower was made of hands");
    expect(spy.requests[0]?.kind).toBe("reflect");
    expect(spy.requests[0]?.prompt).toContain("dream");
  });

  it("does not spend a budget slot's reply on an oversized dream", async () => {
    const spy = spyClient({ ok: true, text: "word ".repeat(40).trim() });
    const dreamer = createDreamer(deps(spy.client));

    expect(await dreamer.dream({ creatureId: "02", stage: 2, worldSeed: 9 })).toBeNull();
  });

  it("returns null on timeout without throwing", async () => {
    const spy = spyClient({ ok: false, reason: "timeout" });
    const dreamer = createDreamer(deps(spy.client));

    expect(await dreamer.dream({ creatureId: "02", stage: 3, worldSeed: 9 })).toBeNull();
  });

  it("spends no budget and makes no call when the budget is exhausted", async () => {
    const spy = spyClient({ ok: true, text: "a dream we never had" });
    const dreamer = createDreamer(deps(spy.client, createBudgetGuard({ maxCalls: 0 })));

    expect(await dreamer.dream({ creatureId: "02", stage: 3, worldSeed: 9 })).toBeNull();
    expect(spy.requests).toHaveLength(0);
  });

  it("is deterministic for the same seed", async () => {
    const spyA = spyClient({ ok: true, text: "the tower was made of hands" });
    const spyB = spyClient({ ok: true, text: "the tower was made of hands" });
    const dreamerA = createDreamer(deps(spyA.client));
    const dreamerB = createDreamer(deps(spyB.client));

    const first = await dreamerA.dream({ creatureId: "02", stage: 2, worldSeed: 31 });
    const second = await dreamerB.dream({ creatureId: "02", stage: 2, worldSeed: 31 });

    expect(second?.fact).toBe(first?.fact);
    expect(second?.valence).toBe(first?.valence);
  });
});
