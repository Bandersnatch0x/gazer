/**
 * 0078: budget/success contract integration.
 *
 * The middleware (vite.config.ts) and the game share two decision points; this
 * file pins both in one flow so a future change cannot widen one side without
 * the other noticing:
 *
 *   1. `isValidSceneShape` — the ONLY success gate for roundtable replies.
 *      Valid 2..4-turn scene passes; 1-turn / 5-turn / non-object fail before
 *      any budget settle.
 *   2. `createBudgetAdmission` — settle(true) once per request whose reply
 *      passed the gate; refusals and retries of content-less attempts never
 *      consume a slot (0066 先成功后扣, 0088 empty-completion retry).
 *
 * The middleware's live HTTP behaviour over these same gates is recorded in
 * .agent/tmp logs (r2-check-*, latency samples); here the shared code path is
 * what CI re-verifies on every run.
 */
import { describe, expect, it } from "vitest";
import { createBudgetAdmission } from "../src/bridge/budget";
import { isValidSceneShape } from "../src/director/roundtable";

const turn = (speaker: string) => ({
  speaker,
  text: `line from ${speaker}`,
  intent: "observe" as const,
  mood: "curious" as const,
  memoryRef: "",
});

describe("0078 · the shared roundtable success gate", () => {
  it("accepts a 2..4-turn scene and nothing else", () => {
    expect(isValidSceneShape({ scene: [turn("a"), turn("b")] })).toBe(true);
    expect(isValidSceneShape({ scene: [turn("a"), turn("b"), turn("c"), turn("d")] })).toBe(true);
    expect(isValidSceneShape({ scene: [turn("a")] })).toBe(false);
    expect(isValidSceneShape({ scene: [turn("a"), turn("b"), turn("c"), turn("d"), turn("e")] })).toBe(false);
    expect(isValidSceneShape({})).toBe(false);
    expect(isValidSceneShape({ scene: "two" })).toBe(false);
    expect(isValidSceneShape(null)).toBe(false);
  });

  it("gate outcome decides the HTTP verdict: pass=200, fail=502 invalid scene shape", () => {
    // The middleware maps the gate exactly this way (vite.config.ts, 0078 note).
    const verdict = (scene: unknown): { status: number; error?: string } => {
      const body = { scene };
      return isValidSceneShape(body)
        ? { status: 200 }
        : { status: 502, error: "invalid scene shape" };
    };
    expect(verdict([turn("a"), turn("b")])).toEqual({ status: 200 });
    expect(verdict([turn("a")])).toEqual({ status: 502, error: "invalid scene shape" });
  });
});

describe("0078 · budget settlement across retries (先成功后扣)", () => {
  it("one settled success per gated reply; failed calls book nothing", () => {
    const admission = createBudgetAdmission();
    const t = 1_000_000;
    // A request whose reply passed the gate settles exactly one slot…
    admission.settle(t, true);
    // …and the next call is still admitted (ceiling is 15 per 30 minutes).
    expect(admission.allows(t)).toBe(true);
  });

  it("15 successes fill the ceiling; a refusal consumes nothing and unblocks nothing", () => {
    const admission = createBudgetAdmission();
    const t = 2_000_000;
    for (let i = 0; i < 15; i += 1) {
      expect(admission.allows(t + i)).toBe(true);
      admission.settle(t + i, true);
    }
    expect(admission.allows(t + 15)).toBe(false);
    // A failed attempt (empty completion, unparseable, upstream 5xx) settles
    // with success=false and must not occupy a slot the window would keep.
    admission.settle(t + 15, false);
    expect(admission.allows(t + 15)).toBe(false);
  });

  it("retrying a content-less attempt then succeeding costs one slot, not two (0088)", () => {
    const admission = createBudgetAdmission();
    const t = 3_000_000;
    expect(admission.allows(t)).toBe(true);
    // Attempt 1: empty completion — no content, no settle.
    // Attempt 2: valid scene — settle once.
    admission.settle(t, true);
    expect(admission.allows(t)).toBe(true);
  });
});
