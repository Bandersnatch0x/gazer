import { describe, expect, it } from "vitest";
import { createBridgeRuntime } from "../src/bridge/runtime";
import { createDirectorClient } from "../src/director/client";
import type { DirectorLike } from "../src/director/filter";
import { resolveRoundtableScene, voiceDegradedFor } from "../src/game";
import { HELP_SECTIONS } from "../src/ui/help";

const NOW = 1_000_000;

function timedOut(): DirectorLike {
  return { ask: async () => ({ ok: false, reason: "timeout" }) };
}

describe("R4.4 · roundtable timeout degrades to the manual pool", () => {
  it("the client reports a timeout when the request is aborted", async () => {
    const client = createDirectorClient({
      endpoint: "/v1/game",
      timeoutMs: 5,
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    await expect(client.ask("ctx")).resolves.toEqual({ ok: false, reason: "timeout" });
  });

  it("a timed-out scene returns a manual line and spends no budget", async () => {
    const runtime = createBridgeRuntime();
    const outcome = await resolveRoundtableScene({
      runtime,
      client: timedOut(),
      contextText: "ctx",
      stage: 0,
      trigger: "test",
      now: NOW,
      manualLine: "manual line",
      memories: {},
      pools: {},
      present: [],
    });

    expect(outcome).toEqual({
      kind: "manual",
      line: "manual line",
      source: "fallback",
      budgetRefused: false,
      inferred: [],
      verified: 0,
    });
    expect(runtime.budget.snapshot(NOW).used).toBe(0);
  });
});

describe("R7.5 · the degraded voice is observable", () => {
  it("a real scene is not degraded; a manual outcome is", () => {
    const scene = {
      kind: "scene" as const,
      script: { scene: [] },
      source: "model" as const,
      budgetRefused: false,
      inferred: [],
      verified: 0,
    };
    const manual = {
      kind: "manual" as const,
      line: "manual line",
      source: "fallback" as const,
      budgetRefused: false,
      inferred: [],
      verified: 0,
    };
    expect(voiceDegradedFor(scene)).toBe(false);
    expect(voiceDegradedFor(manual)).toBe(true);
  });
});

describe("R6.3 · director unavailable is not a loading state", () => {
  it("the only explanation of silence promises no loading spinner", () => {
    const silent = HELP_SECTIONS.find((section) => section.id === "silentRun");
    expect(silent).toBeDefined();
    const text = (silent?.paragraphs ?? []).map((paragraph) => `${paragraph.en}\n${paragraph.zh}`).join("\n");
    expect(text).toContain("no loading spinner");
    expect(text).toContain("加载转圈");
  });
});