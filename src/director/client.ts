/**
 * Browser-side client for the roundtable endpoint.
 *
 * The endpoint must be same-origin: the director never sends a request to a host
 * other than the page's own. There is no API key in this file, by design — a key
 * shipped to the browser is not a secret.
 */

export interface ClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

export type InterpretResult =
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly reason: "timeout" | "network" | "status" | "json" };

/** Used only to parse relative endpoints when no page origin exists (tests, Node). */
const OFFLINE_BASE = "http://localhost/";

function pageOrigin(): string | null {
  const location = (globalThis as { location?: { readonly origin?: string } }).location;
  const origin = location?.origin;
  if (origin === undefined || origin === "null" || origin.length === 0) {
    return null;
  }
  return origin;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Relative endpoints are same-origin by construction. Absolute endpoints are
 * accepted only when a page origin exists and matches exactly. Anything that is
 * not http(s) is refused.
 */
function resolveTarget(endpoint: string): string | null {
  try {
    const origin = pageOrigin();
    const url = new URL(endpoint, origin ?? OFFLINE_BASE);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (origin === null) {
      return isAbsoluteUrl(endpoint) ? null : url.href;
    }
    return url.origin === origin ? url.href : null;
  } catch {
    return null;
  }
}

function timeoutIsFinite(timeoutMs: number): boolean {
  return Number.isFinite(timeoutMs) && timeoutMs > 0;
}

export function createDirectorClient(options: ClientOptions): {
  ask(input: string): Promise<InterpretResult>;
} {
  const fetchFn: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const target = resolveTarget(options.endpoint);

  return {
    async ask(input: string): Promise<InterpretResult> {
      if (target === null) {
        return { ok: false, reason: "network" };
      }

      const controller = new AbortController();
      const timer = timeoutIsFinite(options.timeoutMs)
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : null;

      try {
        const response = await fetchFn(target, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ input }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return { ok: false, reason: "status" };
        }

        try {
          const payload: unknown = await response.json();
          return { ok: true, payload };
        } catch {
          return { ok: false, reason: "json" };
        }
      } catch {
        return {
          ok: false,
          reason: controller.signal.aborted ? "timeout" : "network",
        };
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
        }
      }
    },
  };
}
