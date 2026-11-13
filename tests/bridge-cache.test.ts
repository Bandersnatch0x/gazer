import { describe, expect, it } from "vitest";
import { cacheKey, createBridgeCache } from "../src/bridge/cache";

describe("cache key", () => {
  it("is deterministic for the same stage, trigger and context", () => {
    const first = cacheKey(2, "telemetry", "stare 6200ms");
    const second = cacheKey(2, "telemetry", "stare 6200ms");
    expect(first).toBe(second);
  });

  it("separates stage, trigger and context", () => {
    const base = cacheKey(2, "telemetry", "ctx");
    expect(cacheKey(3, "telemetry", "ctx")).not.toBe(base);
    expect(cacheKey(2, "whisper", "ctx")).not.toBe(base);
    expect(cacheKey(2, "telemetry", "ctx2")).not.toBe(base);
  });
});

describe("bridge cache", () => {
  it("stores and returns validated replies", () => {
    const cache = createBridgeCache();
    cache.set("a", "one");
    expect(cache.get("a")).toBe("one");
    expect(cache.get("missing")).toBeNull();
    expect(cache.size).toBe(1);
  });

  it("evicts the oldest entry beyond capacity", () => {
    const cache = createBridgeCache(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.size).toBe(2);
  });

  it("refreshes recency on re-set so a hot key survives", () => {
    const cache = createBridgeCache(2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("a", "1-refreshed"); // a becomes newest; b is evicted next
    cache.set("c", "3");
    expect(cache.get("a")).toBe("1-refreshed");
    expect(cache.get("b")).toBeNull();
    expect(cache.get("c")).toBe("3");
  });

  it("falls back to the default capacity for invalid input", () => {
    const cache = createBridgeCache(Number.NaN);
    for (let index = 0; index < 70; index += 1) {
      cache.set(`k${index}`, "v");
    }
    expect(cache.size).toBeLessThanOrEqual(64);
  });
});
