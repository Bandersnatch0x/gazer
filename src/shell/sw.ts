const CACHE_PREFIX = "gazer-shell-";
export const CACHE_NAME = `${CACHE_PREFIX}v2`;
const PRECACHE_URLS: readonly string[] = ["./", "./manifest.webmanifest"];
const API_ROOT = "/api";

/**
 * 0085: the hashed JS/CSS chunks are not in the precache list, so a first visit
 * that then goes offline reloads to a black screen (assets were fetched before
 * the SW controlled the page, and the runtime cache never saw them). Collect
 * the shell's asset URLs from index.html at install time and warm the cache.
 */
export function assetUrlsFromIndex(html: string, base: string): readonly string[] {
  const found = new Set<string>();
  const pattern = /(?:src|href)="([^"]+)"/g;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match !== null) {
    const raw = match[1];
    if (
      raw !== undefined &&
      !raw.startsWith("http") &&
      !raw.startsWith("//") &&
      !raw.startsWith("#") &&
      /\.(?:js|css|woff2?|webmanifest|png|svg)$/.test(raw)
    ) {
      try {
        found.add(new URL(raw, base).href);
      } catch {
        // A malformed reference is skipped; the shell itself still caches.
      }
    }
    match = pattern.exec(html);
  }
  return [...found];
}

/**
 * 0085: Vite emits lazy chunks (Pixi renderers, filters) that index.html never
 * references; they are imported from inside the entry bundle. Read the entry
 * bundle and collect those relative JS references so an offline reload can boot.
 */
export function chunkUrlsFromModule(source: string, moduleUrl: string): readonly string[] {
  const found = new Set<string>();
  const pattern = /["'](\.\/[\w.-]+\.js)["']/g;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match !== null) {
    const rel = match[1];
    if (rel !== undefined) {
      try {
        found.add(new URL(rel, moduleUrl).href);
      } catch {
        // Ignore a malformed reference; the rest still warm.
      }
    }
    match = pattern.exec(source);
  }
  return [...found];
}

/**
 * 0085: Vite's build manifest lists every emitted chunk, including the lazy
 * Pixi renderers index.html never mentions. Warming from it is the reliable
 * way to make an offline reload boot; the HTML scan below is the fallback for
 * builds without a manifest.
 */
export function assetUrlsFromManifest(json: unknown, base: string): readonly string[] {
  if (typeof json !== "object" || json === null) return [];
  const found = new Set<string>();
  const push = (file: unknown): void => {
    if (typeof file !== "string" || file.length === 0) return;
    try {
      found.add(new URL(file.startsWith("/") ? `.${file}` : `./${file}`, base).href);
    } catch {
      // Ignore a malformed entry.
    }
  };
  for (const value of Object.values(json as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const chunk = value as Record<string, unknown>;
    push(chunk["file"]);
    for (const key of ["css", "assets"] as const) {
      const list = chunk[key];
      if (Array.isArray(list)) for (const entry of list) push(entry);
    }
  }
  // Caching the worker itself invites a pointless self-fetch loop.
  found.delete(new URL("./sw.js", base).href);
  return [...found];
}

async function warmShellAssets(scope: ServiceWorkerScope, cache: Cache): Promise<void> {
  // The scope root is the directory containing this worker, not the worker file
  // itself: fetching /sw.js and parsing it yields no asset URLs.
  const base =
    scope.location.href !== undefined
      ? new URL("./", scope.location.href).href
      : `${scope.location.origin}/`;
  try {
    const manifest = await scope.fetch(new Request(new URL("./.vite/manifest.json", base).href));
    if (manifest.ok) {
      const assets = assetUrlsFromManifest(await manifest.json(), base);
      if (assets.length > 0) {
        await cache.addAll(assets);
        return;
      }
    }
  } catch {
    // No manifest (dev server): fall through to the HTML scan.
  }
  const response = await scope.fetch(new Request(base));
  if (!response.ok) return;
  const html = await response.text();
  const assets = assetUrlsFromIndex(html, base);
  if (assets.length > 0) {
    await cache.addAll(assets);
  }
  // Follow lazy imports a few levels deep: Vite chunks import further chunks,
  // so one pass over the entry bundle is not enough to boot offline.
  let frontier = assets.filter((asset) => asset.endsWith(".js"));
  const seen = new Set<string>(assets);
  for (let round = 0; round < 3 && frontier.length > 0; round += 1) {
    const next = new Set<string>();
    for (const url of frontier) {
      try {
        const cached = await cache.match(url);
        const script = cached ?? (await scope.fetch(new Request(url)));
        if (!script.ok) continue;
        for (const chunk of chunkUrlsFromModule(await script.text(), url)) {
          if (!seen.has(chunk)) {
            seen.add(chunk);
            next.add(chunk);
          }
        }
      } catch {
        // A single unreadable chunk must not fail the install.
      }
    }
    if (next.size === 0) break;
    await cache.addAll([...next]);
    frontier = [...next];
  }
}

interface ExtendableEventLike {
  waitUntil(task: Promise<unknown>): void;
}

export interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

export interface ServiceWorkerScope {
  readonly location: { readonly origin: string; readonly href?: string };
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
        .then((cache) =>
          cache
            .addAll(PRECACHE_URLS)
            // Warming the hashed chunks must not fail the install.
            .then(() => warmShellAssets(scope, cache).catch(() => undefined))
            .then(() => cache),
        )
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
    event.respondWith(
      cacheFirst(scope, event.request).catch(async () => {
        // 0085: an offline navigation still gets the cached shell instead of a
        // network error page; if even that is missing, fail honestly.
        if (event.request.mode === "navigate") {
          const cache = await scope.caches.open(CACHE_NAME);
          const shellUrl =
            scope.location.href !== undefined
              ? new URL("./", scope.location.href).href
              : `${scope.location.origin}/`;
          const shell = await cache.match(shellUrl);
          if (shell !== undefined) return shell;
        }
        return Response.error();
      }),
    );
  });
}

const scope = globalThis as unknown as Partial<ServiceWorkerScope>;
if (typeof scope.skipWaiting === "function" && scope.caches !== undefined) {
  installServiceWorker(scope as ServiceWorkerScope);
}
