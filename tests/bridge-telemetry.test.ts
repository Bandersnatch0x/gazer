import { describe, expect, it } from "vitest";
import { manualLine } from "../src/director/manual";
import { createTelemetrySpeaker, type TelemetryLineDeps } from "../src/bridge/telemetry";
import type { BridgeClient, BridgeRequest } from "../src/bridge/client";
import { createBudgetGuard } from "../src/bridge/budget";
import { createBridgeCache } from "../src/bridge/cache";
import type { TelemetryAdapter, TelemetryEvent } from "../src/bridge/deps";

const FACTS: readonly TelemetryEvent[] = [
  { kind: "stare", creatureId: "02", durationMs: 6200 },
  { kind: "feed", creatureId: "01", hesitationMs: 1400 },
];

function adapter(events: readonly TelemetryEvent[]): TelemetryAdapter {
  return { recent: () => events };
}

interface SpyClient {
  readonly client: BridgeClient;
  readonly requests: BridgeRequest[];
}

function spyClient(reply: { ok: true; text: string } | { ok: false; reason: "timeout" }): SpyClient {
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
  events: readonly TelemetryEvent[] = FACTS,
  budget = createBudgetGuard(),
  cache?: ReturnType<typeof createBridgeCache>,
): TelemetryLineDeps {
  return { client, budget, telemetry: adapter(events), ...(cache ? { cache } : {}) };
}

describe("telemetry speaker (L2)", () => {
  it("uses the manual pool below stage 2 and never calls the model", async () => {
    const spy = spyClient({ ok: true, text: "would have been used" });
    const speaker = createTelemetrySpeaker(deps(spy.client));

    const line = await speaker.line({ stage: 1, seed: 3 });

    expect(line).toBe(manualLine(1, 3));
    expect(spy.requests).toHaveLength(0);
  });

  it("quotes real telemetry through the model at stage 2 and above", async () => {
    const spy = spyClient({ ok: true, text: "you stared at 02 for 6200ms. we kept it" });
    const speaker = createTelemetrySpeaker(deps(spy.client));

    const line = await speaker.line({ stage: 2, seed: 3 });

    expect(line).toBe("you stared at 02 for 6200ms. we kept it");
    expect(spy.requests).toHaveLength(1);
    expect(spy.requests[0]?.kind).toBe("telemetry_line");
    expect(spy.requests[0]?.prompt).toContain("6200ms");
    expect(spy.requests[0]?.prompt).toContain("1400ms");
  });

  it("falls back to the manual pool when the model invents a number-free line", async () => {
    const spy = spyClient({ ok: true, text: "the glass was cold and we were awake" });
    const speaker = createTelemetrySpeaker(deps(spy.client));

    expect(await speaker.line({ stage: 3, seed: 5 })).toBe(manualLine(3, 5));
  });

  it("falls back on timeout, oversized and empty model output", async () => {
    const timedOut = spyClient({ ok: false, reason: "timeout" });
    const speakerA = createTelemetrySpeaker(deps(timedOut.client));
    expect(await speakerA.line({ stage: 2, seed: 7 })).toBe(manualLine(2, 7));

    const oversized = spyClient({ ok: true, text: "word ".repeat(40).trim() });
    const speakerB = createTelemetrySpeaker(deps(oversized.client));
    expect(await speakerB.line({ stage: 2, seed: 7 })).toBe(manualLine(2, 7));

    const empty = spyClient({ ok: true, text: "" });
    const speakerC = createTelemetrySpeaker(deps(empty.client));
    expect(await speakerC.line({ stage: 2, seed: 7 })).toBe(manualLine(2, 7));
  });

  it("falls back without a call when the ledger has no speakable facts", async () => {
    const spy = spyClient({ ok: true, text: "unused" });
    const speaker = createTelemetrySpeaker(deps(spy.client, []));

    expect(await speaker.line({ stage: 4, seed: 1 })).toBe(manualLine(4, 1));
    expect(spy.requests).toHaveLength(0);
  });

  it("falls back without calling the model when the budget is spent", async () => {
    const spy = spyClient({ ok: true, text: "unused" });
    const speaker = createTelemetrySpeaker(
      deps(spy.client, FACTS, createBudgetGuard({ maxCalls: 0 })),
    );

    expect(await speaker.line({ stage: 2, seed: 9 })).toBe(manualLine(2, 9));
    expect(spy.requests).toHaveLength(0);
  });

  it("serves a repeated telemetry context from cache", async () => {
    const spy = spyClient({ ok: true, text: "6200ms of staring. we counted" });
    const cache = createBridgeCache();
    const speaker = createTelemetrySpeaker(deps(spy.client, FACTS, createBudgetGuard(), cache));

    const first = await speaker.line({ stage: 2, seed: 3 });
    const second = await speaker.line({ stage: 2, seed: 3 });

    expect(first).toBe("6200ms of staring. we counted");
    expect(second).toBe(first);
    expect(spy.requests).toHaveLength(1);
  });
});
