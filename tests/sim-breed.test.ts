import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { BREED_DRIFT_CAP, hybridize, MANUAL_POOL_CAP, SECRET_INHERIT_CHANCE } from "../src/sim/breed";
import type { GenomeTraits, PromptGenome } from "../src/sim/genome";

const TRAIT_KEYS: readonly (keyof GenomeTraits)[] = [
  "curiosity",
  "loyalty",
  "deceit",
  "clinging",
  "watchfulness",
];

const arbitraryTraits: fc.Arbitrary<GenomeTraits> = fc.record({
  curiosity: fc.double({ min: 0, max: 1, noNaN: true }),
  loyalty: fc.double({ min: 0, max: 1, noNaN: true }),
  deceit: fc.double({ min: 0, max: 1, noNaN: true }),
  clinging: fc.double({ min: 0, max: 1, noNaN: true }),
  watchfulness: fc.double({ min: 0, max: 1, noNaN: true }),
});

const arbitraryGenome: fc.Arbitrary<PromptGenome> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  generation: fc.nat({ max: 20 }),
  lineage: fc.array(fc.string({ maxLength: 8 }), { maxLength: 5 }),
  base: fc.string({ maxLength: 20 }),
  traits: arbitraryTraits,
  drift: fc.array(fc.string({ maxLength: 8 }), { maxLength: 6 }),
  secrets: fc.array(fc.string({ maxLength: 8 }), { maxLength: 6 }),
  manualPool: fc.array(fc.string({ maxLength: 8 }), { maxLength: 8 }),
  temperatureBias: fc.double({ min: 0, max: 1, noNaN: true }),
  distortionBias: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe("hybridize", () => {
  it("is deep-equal for the same parents and seed", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        expect(hybridize(a, b, seed)).toEqual(hybridize(a, b, seed));
      }),
    );
  });

  it("averages traits and moves at most one by 0.2, clamped to 0..1", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        const child = hybridize(a, b, seed);
        let moved = 0;
        for (const key of TRAIT_KEYS) {
          const average = (a.traits[key] + b.traits[key]) / 2;
          const value = child.traits[key];
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
          const delta = Math.abs(value - average);
          expect(delta).toBeLessThanOrEqual(0.2 + 1e-9);
          if (delta > 1e-9) {
            moved += 1;
          }
        }
        expect(moved).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("continues the generation and unions lineage with both parents", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        const child = hybridize(a, b, seed);
        expect(child.generation).toBe(Math.max(a.generation, b.generation) + 1);
        for (const ancestor of [...a.lineage, ...b.lineage, a.id, b.id]) {
          expect(child.lineage).toContain(ancestor);
        }
      }),
    );
  });

  it("caps drift at three, drawn from both parents", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        const child = hybridize(a, b, seed);
        expect(child.drift.length).toBeLessThanOrEqual(BREED_DRIFT_CAP);
        for (const drift of child.drift) {
          expect([...a.drift, ...b.drift]).toContain(drift);
        }
      }),
    );
  });

  it("inherits secrets only from the parents' union", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        const child = hybridize(a, b, seed);
        const union = new Set([...a.secrets, ...b.secrets]);
        for (const secret of child.secrets) {
          expect(union.has(secret)).toBe(true);
        }
        expect(SECRET_INHERIT_CHANCE).toBeGreaterThan(0);
      }),
    );
  });

  it("takes the first ten manual pool entries of both parents", () => {
    fc.assert(
      fc.property(arbitraryGenome, arbitraryGenome, fc.integer(), (a, b, seed) => {
        const child = hybridize(a, b, seed);
        expect(child.manualPool).toEqual([...a.manualPool, ...b.manualPool].slice(0, MANUAL_POOL_CAP));
      }),
    );
  });
});
