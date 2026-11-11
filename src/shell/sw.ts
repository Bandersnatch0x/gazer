const CACHE_PREFIX = "gazer-shell-";
export const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PRECACHE_URLS: readonly string[] = ["./", "./manifest.webmanifest"];
const API_ROOT = "/api";

interface ExtendableEventLike {
  waitUntil(task: Promise<unknown>): void;
}

export interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

export interface ServiceWorkerScope {
  readonly location: { readonly origin: string };
  readonly caches: CacheStorage;
  readonly clients: { claim(): Promise<void> };
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  fetch(request: Request): Promise<Response>;
  skipWaiting(): Promise<void>;
}

export function isCacheable(request: Request, origin: string): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== origin) return false;
  return url.pathname !== API_ROOT && !url.pathname.startsWith(`${API_ROOT}/`);
}

async function cacheFirst(scope: ServiceWorkerScope, request: Request): Promise<Response> {
  const cache = await scope.caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;
  const response = await scope.fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

export function installServiceWorker(scope: ServiceWorkerScope): void {
  scope.addEventListener("install", (event) => {
    event.waitUntil(
      scope.caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(PRECACHE_URLS))
        .then(() => scope.skipWaiting()),
    );
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      scope.caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
              .map((name) => scope.caches.delete(name)),
          ),
        )
        .then(() => scope.clients.claim()),
    );
  });

  scope.addEventListener("fetch", (event) => {
    if (!isCacheable(event.request, scope.location.origin)) return;
    event.respondWith(cacheFirst(scope, event.request));
  });
}

const scope = globalThis as unknown as Partial<ServiceWorkerScope>;
if (typeof scope.skipWaiting === "function" && scope.caches !== undefined) {
  installServiceWorker(scope as ServiceWorkerScope);
}
