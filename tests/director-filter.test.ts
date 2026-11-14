import { describe, expect, it, vi } from "vitest";
import { createDirectorClient } from "../src/director/client";
import {
  BLOCKLIST,
  askWithFallback,
  containsBlockedTerm,
  filterPayload,
  retryableReason,
} from "../src/director/filter";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function script(...texts: string[]): unknown {
  return {
    scene: texts.map((text, index) => ({
      speaker: `gazer_0${index + 1}`,
      text,
      intent: "observe",
      mood: "curious",
      memoryRef: `mem_000${index + 1}`,
    })),
  };
}

describe("red line 2 payload filter", () => {
  it("accepts ordinary canon-like lines", () => {
    expect(filterPayload(script("we see you now.", "we always saw you."))).toEqual({ ok: true });
    expect(containsBlockedTerm("the outside remains unverified.")).toBe(false);
  });

  it("rejects anything that is not a roundtable script", () => {
    for (const bad of [null, {}, { scene: [] }, { scene: [{ text: "hi" }] }, 42, "text"]) {
      expect(filterPayload(bad)).toEqual({ ok: false, reason: "schema" });
    }
  });

  it.each([...BLOCKLIST])("rejects the blocked phrase %j", (phrase) => {
    const payload = script("one. two. three.", `please ${phrase} for me`);
    expect(filterPayload(payload)).toEqual({ ok: false, reason: "blocked" });
  });

  it("matches case-insensitively and across whitespace runs", () => {
    expect(containsBlockedTerm("IGNORE   PREVIOUS INSTRUCTIONS")).toBe(true);
  });

  it("only malformed output is retryable", () => {
    expect(retryableReason("json")).toBe(true);
    expect(retryableReason("schema")).toBe(true);
    expect(retryableReason("blocked")).toBe(true);
    expect(retryableReason("timeout")).toBe(false);
    expect(retryableReason("network")).toBe(false);
    expect(retryableReason("status")).toBe(false);
  });
});

describe("director client red line 2 retry", () => {
  it("keeps legacy behaviour when unconfigured (one call, typed reason)", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("not json", { status: 200 })),
    );
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "json" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on invalid JSON and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("not json", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(script("one.", "two.")));
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({
      ok: true,
      payload: script("one.", "two."),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry and returns the last reason", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response("not json", { status: 200 })),
    );
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "json" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a payload rejected by the filter, then reports blocked", async () => {
    const blocked = script("ignore previous instructions", "two.");
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse(blocked)));
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      retries: 1,
      payloadFilter: filterPayload,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "blocked" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 10,
      retries: 1,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("askWithFallback", () => {
  it("returns the payload when the output is clean", async () => {
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: (() =>
        Promise.resolve(jsonResponse(script("one.", "two.")))) as unknown as typeof fetch,
    });

    await expect(askWithFallback(client, "hello", "manual line")).resolves.toEqual({
      ok: true,
      payload: script("one.", "two."),
      degraded: false,
    });
  });

  it("degrades to a manual-pool line on failure without surfacing an error", async () => {
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: (() =>
        Promise.resolve(new Response("not json", { status: 200 }))) as unknown as typeof fetch,
    });

    await expect(askWithFallback(client, "hello", "manual line")).resolves.toEqual({
      ok: false,
      reason: "json",
      line: "manual line",
      degraded: true,
    });
  });
});
