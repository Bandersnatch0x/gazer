/**
 * Browser-side client for the LLM bridge endpoint.
 *
 * This is a deliberate mirror of `src/director/client.ts` (same-source fetch,
 * AbortController timeout, typed failures, no key in the browser). The director
 * module's internals are not exported, and the G stream is zero-intrusion — it
 * may not touch existing files — so the pattern is duplicated here rather than
 * shared. If the director's transport rules ever change, change both.
 *
 * The bridge never talks to a free-form chat endpoint: every request carries a
 * `kind` from a closed set and a prompt assembled inside this module, and every
 * reply is validated by the caller before the engine may act on it.
 */

export type BridgeTaskKind = "whisper_rewrite" | "telemetry_line" | "reflect";

export interface BridgeRequest {
  readonly kind: BridgeTaskKind;
  readonly prompt: string;
}

export type BridgeClientResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false;
      readonly reason: "timeout" | "network" | "status" | "json" | "shape";
    };

export interface BridgeClient {
  ask(request: BridgeRequest): Promise<BridgeClientResult>;
}

export interface BridgeClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

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
 * The endpoint answers `{ "text": string }`. Anything else — missing field,
 * non-string, empty — is reported as `shape` so the caller falls back instead
 * of trying to repair model output.
 */
function extractText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const text = (payload as { readonly text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

export function createBridgeClient(options: BridgeClientOptions): BridgeClient {
  const fetchFn: typeof fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const target = resolveTarget(options.endpoint);

  return {
    async ask(request: BridgeRequest): Promise<BridgeClientResult> {
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
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          return { ok: false, reason: "status" };
        }

        try {
          const payload: unknown = await response.json();
          const text = extractText(payload);
          return text === null
            ? { ok: false, reason: "shape" }
            : { ok: true, text };
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
