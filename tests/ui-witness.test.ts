import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { EpistemicStatus, MemoryEntry } from "../src/sim/memory";
import { EPISTEMIC_STATUSES, countByStatus, displayStatus, markFor } from "../src/ui/witness";
import { LOCALES, t } from "../src/ui/i18n";

const ALL: readonly EpistemicStatus[] = ["witnessed", "heard", "inferred", "fabricated"];

function entry(status: EpistemicStatus, id: string): MemoryEntry {
  return {
    id,
    atTick: 1,
    wallClock: "02:14",
    fact: `fact ${id}`,
    witnessed: status,
    source: null,
    distortion: null,
    salience: 0.5,
    valence: 0,
  };
}

describe("witness mark", () => {
  it("covers every epistemic status", () => {
    expect([...EPISTEMIC_STATUSES].sort()).toEqual([...ALL].sort());
    for (const status of ALL) {
      const mark = markFor(status);
      expect(mark.status).toBe(status);
    }
  });

  it("markFor is total over the status union and always yields both labels", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EpistemicStatus>(...ALL),
        fc.constantFrom(...LOCALES),
        (status, locale) => {
          const mark = markFor(status);
          expect(t(locale, mark.label).trim().length).toBeGreaterThan(0);
          expect(t(locale, mark.fullText).trim().length).toBeGreaterThan(0);
          expect(mark.glyph.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("gives every status a distinct short label in both languages", () => {
    for (const locale of LOCALES) {
      const labels = ALL.map((status) => t(locale, markFor(status).label));
      expect(new Set(labels).size).toBe(ALL.length);
    }
  });

  it("gives every status a distinct hairline glyph", () => {
    const glyphs = ALL.map((status) => markFor(status).glyph);
    expect(new Set(glyphs).size).toBe(ALL.length);
  });

  it("the full text names the epistemic claim, not just a mood", () => {
    const witnessed = t("en", markFor("witnessed").fullText).toLowerCase();
    const heard = t("en", markFor("heard").fullText).toLowerCase();
    expect(witnessed).toContain("seen");
    expect(heard).toContain("told");
  });
});

describe("holder-facing status", () => {
  it("shows the stored status for an undistorted memory", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EpistemicStatus>(...ALL),
        (status) => {
          const stored = entry(status, "mem_1");
          expect(displayStatus(stored)).toBe(status);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("shows fabricated for a distorted memory the holder stores as witnessed", () => {
    const distorted: MemoryEntry = {
      ...entry("witnessed", "mem_9"),
      distortion: "role_swap",
    };
    // 持有者的切片里它是 witnessed；标记是玩家唯一看得见差别的地方。
    expect(distorted.witnessed).toBe("witnessed");
    expect(displayStatus(distorted)).toBe("fabricated");
  });

  it("counts witnessed and heard separately so the player can compare", () => {
    const slice = [
      entry("witnessed", "mem_1"),
      entry("witnessed", "mem_2"),
      entry("heard", "mem_3"),
      entry("inferred", "mem_4"),
      entry("fabricated", "mem_5"),
    ];
    const counts = countByStatus(slice);
    expect(counts.witnessed).toBe(2);
    expect(counts.heard).toBe(1);
    expect(counts.inferred).toBe(1);
    expect(counts.fabricated).toBe(1);
    expect(counts.total).toBe(5);
  });

  it("countByStatus never loses or double-counts an entry", () => {
    const statusArb = fc.constantFrom<EpistemicStatus>(...ALL);
    fc.assert(
      fc.property(fc.array(statusArb), (statuses) => {
        const entries = statuses.map((status, index) => entry(status, `mem_${index}`));
        const counts = countByStatus(entries);
        expect(counts.total).toBe(entries.length);
        expect(counts.witnessed + counts.heard + counts.inferred + counts.fabricated).toBe(
          entries.length,
        );
      }),
      { numRuns: 150 },
    );
  });

  it("returns zeroes for an empty slice", () => {
    expect(countByStatus([])).toEqual({
      witnessed: 0,
      heard: 0,
      inferred: 0,
      fabricated: 0,
      total: 0,
    });
  });
});
