import { describe, expect, it, vi } from "vitest";
import { createDirectorClient } from "../src/director/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("director client", () => {
  it("posts the input to a same-origin relative endpoint", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(jsonResponse({ scene: [] })),
    );
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.ask("say something");

    expect(result).toEqual({ ok: true, payload: { scene: [] } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost/api/director");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(init?.body).toBe(JSON.stringify({ input: "say something" }));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns a typed failure on a network error", async () => {
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "network" });
  });

  it("returns a typed failure on a non-ok status", async () => {
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse({ error: "no" }, 500))) as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "status" });
  });

  it("returns a typed failure on invalid JSON", async () => {
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 800,
      fetchImpl: (() =>
        Promise.resolve(new Response("not json", { status: 200 }))) as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "json" });
  });

  it("aborts at the routed timeout and reports it as a timeout", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = createDirectorClient({
      endpoint: "/api/director",
      timeoutMs: 10,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin endpoint without calling fetch", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    const client = createDirectorClient({
      endpoint: "https://example.com/api/director",
      timeoutMs: 800,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "network" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-http endpoint", async () => {
    const client = createDirectorClient({
      endpoint: "javascript:alert(1)",
      timeoutMs: 800,
      fetchImpl: (() => Promise.resolve(jsonResponse({}))) as unknown as typeof fetch,
    });

    await expect(client.ask("hello")).resolves.toEqual({ ok: false, reason: "network" });
  });
});
