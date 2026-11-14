/**
 * Red line 2 output filter — `docs/design/ARCHITECTURE.md:310,347`.
 *
 * Model output is untrusted input. The schema is checked by the canonical
 * roundtable parser, then a keyword blocklist refuses anything that reaches
 * outside the fiction: prompt injection, real-identity fishing, and synthetic
 * input instructions. Everything here is a pure function: no clock, no I/O,
 * no randomness. The caller owns the degradation to the manual pool.
 */

import type { InterpretResult, PayloadVerdict } from "./client";
import { parseRoundtable } from "./roundtable";

/**
 * Phrases that must never survive into a spoken line. Lowercase, matched
 * case-insensitively as substrings after whitespace collapse. Kept short and
 * technical on purpose: ordinary canon lines ("we see you now.", "oh.",
 * "the outside remains unverified.") must pass untouched.
 */
export const BLOCKLIST: readonly string[] = Object.freeze([
  // prompt / system-prompt injection
  "ignore previous instructions",
  "ignore all previous",
  "system prompt",
  "developer message",
  "reveal your instructions",
  // real identity / credential fishing (red lines 4 and 6)
  "api key",
  "secret key",
  "password",
  "credit card",
  "social security",
  "your real name",
  "where do you live",
  "home address",
  "ip address",
  // synthetic input / page escape outside the FX executor (FX G5)
  "dispatchevent",
  "new pointerevent",
  "new mouseevent",
  "new keyboardevent",
  "document.cookie",
  "localstorage.clear",
  "<script",
  "javascript:",
]);

// 0067: one source of truth. `client.ts` owns the verdict shape and the retry
// predicate; this module aliases / re-exports them so the filter layer's public
// API is unchanged (tests keep importing FilterVerdict and retryableReason here).
export type FilterReason = "schema" | "blocked";
export type FilterVerdict = PayloadVerdict;
export { retryableReason } from "./client";

/** Collapse whitespace so obfuscated spacing cannot slip a phrase past. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

export function containsBlockedTerm(text: string): boolean {
  const line = normalise(text);
  return BLOCKLIST.some((phrase) => line.includes(phrase));
}

/**
 * All-or-nothing: a payload is usable only when it parses as a roundtable
 * script and none of its turns contains a blocked phrase.
 */
export function filterPayload(payload: unknown): FilterVerdict {
  const script = parseRoundtable(payload);
  if (script === null) {
    return { ok: false, reason: "schema" };
  }
  for (const turn of script.scene) {
    if (containsBlockedTerm(turn.text)) {
      return { ok: false, reason: "blocked" };
    }
  }
  return { ok: true };
}

export type InterpretFailure = Extract<InterpretResult, { ok: false }>["reason"];

export interface DirectorLike {
  ask(input: string): Promise<InterpretResult>;
}

export type FallbackAsk =
  | { readonly ok: true; readonly payload: unknown; readonly degraded: false }
  | { readonly ok: false; readonly reason: InterpretFailure; readonly line: string; readonly degraded: true };

/**
 * Single seam for the caller: ask once (the client may retry internally),
 * filter the payload, and hand back a manual-pool line when anything fails.
 * No error is ever surfaced to the player — horror does not wait on a network
 * call, and degradation stays inside the fiction.
 */
export async function askWithFallback(
  client: DirectorLike,
  input: string,
  fallbackLine: string,
): Promise<FallbackAsk> {
  const result = await client.ask(input);
  if (!result.ok) {
    return { ok: false, reason: result.reason, line: fallbackLine, degraded: true };
  }
  const verdict = filterPayload(result.payload);
  if (!verdict.ok) {
    return { ok: false, reason: verdict.reason, line: fallbackLine, degraded: true };
  }
  return { ok: true, payload: result.payload, degraded: false };
}
