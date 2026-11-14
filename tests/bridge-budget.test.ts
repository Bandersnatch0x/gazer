import { describe, expect, it } from "vitest";
import {
  createBudgetAdmission,
  createBudgetGuard,
  DEFAULT_BUDGET_CONFIG,
} from "../src/bridge/budget";

const T0 = 1_000_000;

describe("budget guard", () => {
  it("defaults to 15 calls per 30 minutes", () => {
    const guard = createBudgetGuard();
    expect(guard.snapshot(T0)).toEqual({ used: 0, limit: 15, resetsInMs: 0 });
    expect(DEFAULT_BUDGET_CONFIG.windowMs).toBe(30 * 60 * 1000);
  });

  it("spends the first 15 calls and refuses the 16th inside the window", () => {
    const guard = createBudgetGuard();
    for (let call = 0; call < 15; call += 1) {
      expect(guard.trySpend(T0 + call)).toBe(true);
    }
    expect(guard.trySpend(T0 + 15)).toBe(false);
    const snapshot = guard.snapshot(T0 + 15);
    expect(snapshot.used).toBe(15);
    // The window frees when the oldest spend (at T0) exits: 30min - 15ms.
    expect(snapshot.resetsInMs).toBe(30 * 60 * 1000 - 15);
  });

  it("recovers as the window slides", () => {
    const guard = createBudgetGuard();
    for (let call = 0; call < 15; call += 1) {
      guard.trySpend(T0 + call);
    }
    expect(guard.trySpend(T0 + 15)).toBe(false);
    // The spends are 1ms apart, so the oldest leaves the window at +30min.
    expect(guard.trySpend(T0 + 30 * 60 * 1000)).toBe(true);
  });

  it("reports zero resets while slots remain", () => {
    const guard = createBudgetGuard();
    guard.trySpend(T0);
    expect(guard.snapshot(T0).resetsInMs).toBe(0);
  });

  it("honours a tighter configuration", () => {
    const guard = createBudgetGuard({ maxCalls: 2, windowMs: 1000 });
    expect(guard.trySpend(T0)).toBe(true);
    expect(guard.trySpend(T0 + 1)).toBe(true);
    expect(guard.trySpend(T0 + 2)).toBe(false);
    expect(guard.trySpend(T0 + 1001)).toBe(true);
  });

  it("maxCalls 0 disables the bridge entirely", () => {
    const guard = createBudgetGuard({ maxCalls: 0 });
    expect(guard.trySpend(T0)).toBe(false);
    expect(guard.snapshot(T0)).toEqual({ used: 0, limit: 0, resetsInMs: 0 });
  });

  it("refuses a non-finite timestamp instead of spending", () => {
    const guard = createBudgetGuard();
    expect(guard.trySpend(Number.NaN)).toBe(false);
    expect(guard.snapshot(T0).used).toBe(0);
  });

  it("reset clears the window", () => {
    const guard = createBudgetGuard({ maxCalls: 1 });
    guard.trySpend(T0);
    expect(guard.trySpend(T0 + 1)).toBe(false);
    guard.reset();
    expect(guard.trySpend(T0 + 2)).toBe(true);
  });
});

// Ticket 0066 / decision 0018 ③: hard budget, 先成功后扣.
describe("budget admission (two-phase hard budget)", () => {
  it("only a successful response spends a slot; failures and timeouts never do", () => {
    const admission = createBudgetAdmission({ maxCalls: 2, windowMs: 1000 });
    expect(admission.allows(T0)).toBe(true);
    admission.settle(T0, false); // 400 / 502 / timeout
    expect(admission.snapshot(T0).used).toBe(0);

    expect(admission.allows(T0 + 1)).toBe(true);
    admission.settle(T0 + 1, true);
    expect(admission.snapshot(T0 + 1).used).toBe(1);

    expect(admission.allows(T0 + 2)).toBe(true);
    admission.settle(T0 + 2, false);
    expect(admission.snapshot(T0 + 2).used).toBe(1);

    expect(admission.allows(T0 + 3)).toBe(true);
    admission.settle(T0 + 3, true);
    expect(admission.snapshot(T0 + 3).used).toBe(2);
    expect(admission.allows(T0 + 4)).toBe(false); // hard ceiling reached
  });

  it("reserves in-flight slots so concurrent calls cannot over-admit", () => {
    const admission = createBudgetAdmission({ maxCalls: 2, windowMs: 1000 });
    expect(admission.allows(T0)).toBe(true);
    expect(admission.allows(T0 + 1)).toBe(true);
    expect(admission.allows(T0 + 2)).toBe(false); // both still in flight
    admission.settle(T0 + 1, true);
    admission.settle(T0, true);
    expect(admission.snapshot(T0 + 3).used).toBe(2);
    expect(admission.allows(T0 + 4)).toBe(false);
  });

  it("defaults to the frozen 15 calls / 30 minutes hard budget", () => {
    const admission = createBudgetAdmission();
    expect(admission.snapshot(T0)).toEqual({ used: 0, limit: 15, resetsInMs: 0 });
    expect(DEFAULT_BUDGET_CONFIG.windowMs).toBe(30 * 60 * 1000);
    for (let call = 0; call < 15; call += 1) {
      expect(admission.allows(T0 + call)).toBe(true);
      admission.settle(T0 + call, true);
    }
    expect(admission.allows(T0 + 15)).toBe(false);
    expect(admission.snapshot(T0 + 15).used).toBe(15);
  });

  it("refuses a non-finite timestamp without reserving or spending", () => {
    const admission = createBudgetAdmission();
    expect(admission.allows(Number.NaN)).toBe(false);
    expect(admission.snapshot(T0).used).toBe(0);
  });

  it("reset clears both spends and reservations", () => {
    const admission = createBudgetAdmission({ maxCalls: 1 });
    expect(admission.allows(T0)).toBe(true);
    admission.settle(T0, true);
    expect(admission.allows(T0 + 1)).toBe(false);
    admission.reset();
    expect(admission.allows(T0 + 2)).toBe(true);
  });
});
