import { describe, expect, it } from "vitest";
import {
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
