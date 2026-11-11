import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { isAsyncTask, routeTask } from "../src/director/router";
import type { TaskKind } from "../src/director/router";

const KINDS: readonly TaskKind[] = [
  "roundtable",
  "ontology_staging",
  "consolidation",
  "level_b",
  "tts",
];

describe("director routing", () => {
  it("always returns a non-empty primary/secondary/fallback chain", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<TaskKind>(
          "roundtable",
          "ontology_staging",
          "consolidation",
          "level_b",
          "tts",
        ),
        (kind) => {
          const route = routeTask(kind);
          for (const target of [route.primary, route.secondary, route.fallback]) {
            expect(target.length).toBeGreaterThan(0);
          }
          expect(Number.isFinite(route.timeoutMs)).toBe(true);
          expect(route.timeoutMs).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });

  it("pins the scene deadlines from the harness", () => {
    expect(routeTask("roundtable").timeoutMs).toBe(800);
    expect(routeTask("level_b").timeoutMs).toBe(1500);
  });

  it("marks ontology staging and consolidation as off the critical path", () => {
    for (const kind of KINDS) {
      expect(isAsyncTask(kind)).toBe(
        kind === "ontology_staging" || kind === "consolidation",
      );
    }
  });

  it("keeps TTS local with no network deadline", () => {
    expect(routeTask("tts").timeoutMs).toBe(0);
  });

  it("is deterministic and returns frozen routes", () => {
    expect(routeTask("roundtable")).toBe(routeTask("roundtable"));
    expect(Object.isFrozen(routeTask("roundtable"))).toBe(true);
  });

  it("falls back to the roundtable route for an unknown runtime kind", () => {
    expect(routeTask("not_a_route" as TaskKind)).toBe(routeTask("roundtable"));
  });
});
