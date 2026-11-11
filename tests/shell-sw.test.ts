import { describe, expect, it } from "vitest";
import { registerServiceWorker } from "../src/shell/register";
import { CACHE_NAME, installServiceWorker, isCacheable, type ServiceWorkerScope } from "../src/shell/sw";

const ORIGIN = "https://gazer.test";

class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url);
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response);
  }

  async addAll(urls: readonly string[]): Promise<void> {
    for (const url of urls) this.entries.set(new URL(url, ORIGIN).href, new Response("precached"));
  }
}

class FakeCaches {
  readonly caches = new Map<string, FakeCache>();
  readonly deleted: string[] = [];

  open(name: string): Promise<FakeCache> {
    const existing = this.caches.get(name) ?? new FakeCache();
    this.caches.set(name, existing);
    return Promise.resolve(existing);
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.caches.keys()]);
  }

  delete(name: string): Promise<boolean> {
    this.deleted.push(name);
    return Promise.resolve(this.caches.delete(name));
  }
}

type Handler = (event: { [key: string]: unknown }) => void;

function makeScope() {
  const listeners = new Map<string, Handler[]>();
  const requests: string[] = [];
  const caches = new FakeCaches();
  const scope = {
    location: { origin: ORIGIN },
    caches,
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
    fetch: (request: Request) => {
      requests.push(request.url);
      return Promise.resolve(new Response(`network:${request.url}`, { status: 200 }));
    },
    addEventListener(type: string, handler: Handler) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
  };
  const emit = (type: string, event: { [key: string]: unknown }): unknown => {
    const handler = listeners.get(type)?.[0];
    if (handler === undefined) throw new Error(`no listener for ${type}`);
    return handler(event);
  };
  return { scope: scope as unknown as ServiceWorkerScope, caches, requests, emit };
}

function fetchEvent(request: Request) {
  const responses: Promise<Response>[] = [];
  return {
    event: {
      request,
      respondWith: (response: Promise<Response>) => responses.push(response),
      waitUntil: () => undefined,
    },
    responses,
  };
}

describe("registerServiceWorker", () => {
  it("registers the given path exactly once", async () => {
    const paths: string[] = [];
    registerServiceWorker("sw.js", {
      serviceWorker: {
        register: (path: string) => {
          paths.push(path);
          return Promise.resolve();
        },
      },
    });
    await Promise.resolve();
    expect(paths).toEqual(["sw.js"]);
  });

  it("never throws without a service worker, or when registration rejects", async () => {
    expect(() => registerServiceWorker("sw.js", {})).not.toThrow();
    expect(() =>
      registerServiceWorker("sw.js", {
        serviceWorker: { register: () => Promise.reject(new Error("blocked")) },
      }),
    ).not.toThrow();
    await Promise.resolve();
  });
});

describe("isCacheable", () => {
  it("rejects API calls so /api/ always reaches the network", () => {
    expect(isCacheable(new Request(`${ORIGIN}/api/lines`), ORIGIN)).toBe(false);
    expect(isCacheable(new Request(`${ORIGIN}/api`), ORIGIN)).toBe(false);
  });

  it("rejects non-GET and cross-origin requests", () => {
    expect(isCacheable(new Request(`${ORIGIN}/main.js`), ORIGIN)).toBe(true);
    expect(isCacheable(new Request(`${ORIGIN}/api/lines`, { method: "POST" }), ORIGIN)).toBe(false);
    expect(isCacheable(new Request("https://cdn.example/x.js"), ORIGIN)).toBe(false);
  });
});

describe("installServiceWorker", () => {
  it("precaches the shell under the versioned cache name and activates it", async () => {
    const { scope, caches, emit } = makeScope();
    installServiceWorker(scope);
    caches.caches.set("gazer-shell-v0", new FakeCache());

    let installTask: Promise<unknown> | undefined;
    emit("install", { waitUntil: (task: Promise<unknown>) => (installTask = task) });
    await installTask;

    expect(caches.caches.has(CACHE_NAME)).toBe(true);
    expect(CACHE_NAME).not.toBe("gazer-shell-v0");
    expect(caches.caches.get(CACHE_NAME)?.entries.has(new URL("./", ORIGIN).href)).toBe(true);

    let activateTask: Promise<unknown> | undefined;
    emit("activate", { waitUntil: (task: Promise<unknown>) => (activateTask = task) });
    await activateTask;
    expect(caches.deleted).toContain("gazer-shell-v0");
  });

  it("serves cached assets first and leaves API requests to the network", async () => {
    const { scope, caches, requests, emit } = makeScope();
    installServiceWorker(scope);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(new Request(`${ORIGIN}/main.js`), new Response("cached-main"));

    const cached = fetchEvent(new Request(`${ORIGIN}/main.js`));
    emit("fetch", cached.event);
    expect(await cached.responses[0]).toBeDefined();
    expect(await (await cached.responses[0])?.text()).toBe("cached-main");
    expect(requests).toHaveLength(0);

    const api = fetchEvent(new Request(`${ORIGIN}/api/lines`));
    emit("fetch", api.event);
    expect(api.responses).toHaveLength(0);

    const miss = fetchEvent(new Request(`${ORIGIN}/fresh.js`));
    emit("fetch", miss.event);
    expect(await (await miss.responses[0])?.text()).toBe(`network:${ORIGIN}/fresh.js`);
    expect(requests).toEqual([`${ORIGIN}/fresh.js`]);
    expect(await cache.match(new Request(`${ORIGIN}/fresh.js`))).toBeDefined();
  });
});
