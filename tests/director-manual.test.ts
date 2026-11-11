import { describe, expect, it } from "vitest";
import { manualLine, manualPool } from "../src/director/manual";
import type { Stage } from "../src/sim/types";

const STAGES: readonly Stage[] = [0, 1, 2, 3, 4];

describe("manual dialogue pools", () => {
  it("offers at least twelve lines at every stage", () => {
    for (const stage of STAGES) {
      const pool = manualPool(stage);
      expect(pool.length).toBeGreaterThanOrEqual(12);
      for (const line of pool) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it("picks deterministically by seed", () => {
    for (const stage of STAGES) {
      expect(manualLine(stage, 12345)).toBe(manualLine(stage, 12345));
      expect(manualPool(stage)).toContain(manualLine(stage, 12345));
    }
  });

  it("treats negative and non-finite seeds safely", () => {
    expect(manualLine(2, -5)).toBe(manualLine(2, 5));
    expect(manualLine(2, Number.NaN)).toBe(manualLine(2, 0));
    expect(manualLine(2, Number.POSITIVE_INFINITY)).toBe(manualLine(2, 0));
  });

  it("covers every stage with a stage-appropriate pool", () => {
    const seen = new Set<string>();
    for (const stage of STAGES) {
      seen.add(manualLine(stage, 7));
    }
    expect(seen.size).toBe(STAGES.length);
  });
});
