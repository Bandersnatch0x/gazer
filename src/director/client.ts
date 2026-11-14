/**
 * Browser-side client for the roundtable endpoint.
 *
 * The endpoint must be same-origin: the director never sends a request to a host
 * other than the page's own. There is no API key in this file, by design — a key
 * shipped to the browser is not a secret.
 *
 * Red line 2 (`docs/design/ARCHITECTURE.md:310,347`): malformed output gets one
 * retry, then the caller degrades to the manual pool. Both the retry count and
 * the payload filter are opt-in, so an unconfigured client keeps its exact
 * legacy behaviour.
 */

export type PayloadVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "schema" | "blocked" };

export interface ClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
  /** Max one retry, only on malformed output. Default 0 (legacy behaviour). */
  readonly retries?: number;
  /** Schema + blocklist gate. Absent = legacy behaviour (any JSON is accepted). */
  readonly payloadFilter?: (payload: unknown) => PayloadVerdict;
}

export type InterpretFailureReason =
  | "timeout"
  | "network"
  | "status"
  | "json"
  | "schema"
  | "blocked";

export type InterpretResult =
  | { readonly ok: true; readonly payload: unknown }
  | { readonly ok: false; readonly reason: InterpretFailureReason };

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

/**
 * 0067: the single source of truth for "malformed output is worth one retry".
 * A timeout, outage or bad status is final. `payloadFilter` verdicts use the
 * same reasons, so the filter layer re-exports this predicate instead of
 * keeping a second copy.
 */
export function retryableReason(reason: InterpretFailureReason): boolean {
  return reason === "json" || reason === "schema" || reason === "blocked";
}

export function createDirectorClient(options: ClientOptions): {
  ask(input: string): Promise<InterpretResult>;
} {
  const fetchFn: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const target = resolveTarget(options.endpoint);
  const retryCount = Number.isInteger(options.retries)
    ? Math.max(0, Math.min(1, options.retries ?? 0))
    : 0;

  async function attempt(input: string): Promise<InterpretResult> {
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

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, reason: "json" };
      }

      if (options.payloadFilter !== undefined) {
        const verdict = options.payloadFilter(payload);
        if (!verdict.ok) {
          return { ok: false, reason: verdict.reason };
        }
      }
      return { ok: true, payload };
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
  }

  return {
    async ask(input: string): Promise<InterpretResult> {
      let last: InterpretResult = { ok: false, reason: "network" };
      for (let attemptIndex = 0; attemptIndex <= retryCount; attemptIndex += 1) {
        last = await attempt(input);
        if (last.ok || !retryableReason(last.reason)) {
          return last;
        }
      }
      return last;
    },
  };
}
