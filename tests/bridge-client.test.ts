import { describe, expect, it, vi } from "vitest";
import { createBridgeClient } from "../src/bridge/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("bridge client", () => {
  it("posts the typed request to a same-origin relative endpoint", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ text: "the room remembers" })),
    );
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.ask({ kind: "whisper_rewrite", prompt: "rewrite this" });

    expect(result).toEqual({ ok: true, text: "the room remembers" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost/api/bridge");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(init?.body).toBe(
      JSON.stringify({ kind: "whisper_rewrite", prompt: "rewrite this" }),
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports a shape failure when the payload carries no text field", async () => {
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse({ answer: 42 }))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "shape",
    });
  });

  it("reports a shape failure for a non-object payload", async () => {
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse("just words"))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "shape",
    });
  });

  it("returns a typed failure on a network error", async () => {
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "telemetry_line", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "network",
    });
  });

  it("returns a typed failure on a non-ok status", async () => {
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse({}, 503))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "status",
    });
  });

  it("returns a typed failure on invalid JSON", async () => {
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(new Response("not json", { status: 200 }))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "json",
    });
  });

  it("aborts at the routed timeout and reports it as a timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = createBridgeClient({
      endpoint: "/api/bridge",
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "whisper_rewrite", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "timeout",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin endpoint without calling fetch", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ text: "x" })));
    const client = createBridgeClient({
      endpoint: "https://example.com/api/bridge",
      timeoutMs: 800,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "network",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-http endpoint", async () => {
    const client = createBridgeClient({
      endpoint: "javascript:alert(1)",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse({ text: "x" }))) as unknown as typeof fetch,
    });

    await expect(client.ask({ kind: "reflect", prompt: "x" })).resolves.toEqual({
      ok: false,
      reason: "network",
    });
  });
});
