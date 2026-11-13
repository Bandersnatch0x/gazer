import { describe, expect, it } from "vitest";
import type { MemoryEntry } from "../src/sim/memory";
import { resolveWhisper } from "../src/sim/gossip";
import type { CreatureState } from "../src/sim/types";
import { createWhisperRewriter, type WhisperInput } from "../src/bridge/whisper";
import type { BridgeClient, BridgeRequest } from "../src/bridge/client";
import { createBudgetGuard } from "../src/bridge/budget";
import { createBridgeCache } from "../src/bridge/cache";

function creature(id: string, x: number, y: number, distortionBias = 0): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x, y },
    palette: [],
    mask: [],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 0,
      lineage: [id],
      base: "you are a small thing",
      traits: { curiosity: 0.5, loyalty: 0.5, deceit: 0.5, clinging: 0.5, watchfulness: 0.5 },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias,
    },
  };
}

function entry(id: string, fact = "the player fed you at night"): MemoryEntry {
  return {
    id,
    atTick: 4,
    wallClock: "tick_4",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.6,
    valence: -0.3,
  };
}

function whisperInput(seed = 11): WhisperInput {
  // distortionBias 1 drives retention to zero: every in-range hop distorts,
  // so the model path is always reached deterministically.
  return {
    sender: creature("s1", 0, 0),
    receiver: creature("r1", 1, 1, 1),
    entry: entry("evt_0001"),
    worldSeed: seed,
  };
}

interface SpyClient {
  readonly client: BridgeClient;
  readonly requests: BridgeRequest[];
  setReply(reply: BridgeClientReply): void;
}

type BridgeClientReply =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "timeout" | "network" | "status" | "json" | "shape" };

function spyClient(initial: BridgeClientReply): SpyClient {
  const requests: BridgeRequest[] = [];
  let reply = initial;
  const client: BridgeClient = {
    async ask(request: BridgeRequest) {
      requests.push(request);
      return reply;
    },
  };
  return {
    client,
    requests,
    setReply(next: BridgeClientReply): void {
      reply = next;
    },
  };
}

describe("whisper rewriter (L1)", () => {
  it("returns null beyond whisper range without calling the model", async () => {
    const spy = spyClient({ ok: true, text: "irrelevant" });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    const input: WhisperInput = {
      sender: creature("s1", 0, 0),
      receiver: creature("r1", 9, 9, 1),
      entry: entry("evt_0001"),
      worldSeed: 11,
    };

    await expect(rewriter.rewrite(input)).resolves.toBeNull();
    expect(spy.requests).toHaveLength(0);
  });

  it("skips the model when the memory survives intact", async () => {
    const spy = spyClient({ ok: true, text: "irrelevant" });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    // Find a seed whose retention roll succeeds (no distortion).
    let seed = 0;
    const input = {
      sender: creature("s1", 0, 0),
      receiver: creature("r1", 1, 0, 0),
      entry: entry("evt_0007", "the player fed you at night"),
      worldSeed: seed,
    };
    for (; seed < 256; seed += 1) {
      const probe = { ...input, worldSeed: seed };
      const resolved = resolveWhisper(probe);
      if (resolved !== null && resolved.distortion === null) {
        break;
      }
    }
    expect(seed).toBeLessThan(256);

    const result = await rewriter.rewrite({ ...input, worldSeed: seed });
    expect(result?.fact).toBe("the player fed you at night");
    expect(result?.witnessed).toBe("heard");
    expect(spy.requests).toHaveLength(0);
  });

  it("rewrites a failed-retention memory through the model as a heard fact", async () => {
    const spy = spyClient({ ok: true, text: "the hand came twice that night" });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    const result = await rewriter.rewrite(whisperInput());

    expect(result?.fact).toBe("the hand came twice that night");
    expect(result?.witnessed).toBe("heard");
    expect(result?.source).toBe("s1");
    expect(result?.distortion).toBeNull();
    expect(spy.requests).toHaveLength(1);
    expect(spy.requests[0]?.kind).toBe("whisper_rewrite");
    expect(spy.requests[0]?.prompt).toContain("the player fed you at night");
  });

  it("falls back to the manual distorter on timeout", async () => {
    const spy = spyClient({ ok: false, reason: "timeout" });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    const input = whisperInput();
    const result = await rewriter.rewrite(input);
    expect(result).toEqual(resolveWhisper(input));
    expect(spy.requests).toHaveLength(1);
  });

  it("falls back when the model answers with an oversized line", async () => {
    const spy = spyClient({ ok: true, text: "word ".repeat(40).trim() });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    const input = whisperInput();
    const result = await rewriter.rewrite(input);
    expect(result).toEqual(resolveWhisper(input));
  });

  it("falls back when the model answers with an empty line", async () => {
    const spy = spyClient({ ok: true, text: "   " });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
    });

    const input = whisperInput();
    expect(await rewriter.rewrite(input)).toEqual(resolveWhisper(input));
  });

  it("falls back without calling the model when the budget is spent", async () => {
    const spy = spyClient({ ok: true, text: "would have been used" });
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard({ maxCalls: 0 }),
    });

    const input = whisperInput();
    expect(await rewriter.rewrite(input)).toEqual(resolveWhisper(input));
    expect(spy.requests).toHaveLength(0);
  });

  it("serves a repeat whisper from cache without a second call", async () => {
    const spy = spyClient({ ok: true, text: "the hand came twice that night" });
    const cache = createBridgeCache();
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
      cache,
    });

    const first = await rewriter.rewrite(whisperInput());
    const second = await rewriter.rewrite(whisperInput());

    expect(first?.fact).toBe("the hand came twice that night");
    expect(second?.fact).toBe("the hand came twice that night");
    expect(spy.requests).toHaveLength(1);
  });

  it("does not cache a fallback reply", async () => {
    const spy = spyClient({ ok: false, reason: "network" });
    const cache = createBridgeCache();
    const rewriter = createWhisperRewriter({
      client: spy.client,
      budget: createBudgetGuard(),
      cache,
    });

    await rewriter.rewrite(whisperInput());
    expect(cache.size).toBe(0);
    expect(spy.requests).toHaveLength(1);
  });
});
