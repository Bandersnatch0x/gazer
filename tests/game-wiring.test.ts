import { describe, expect, it } from "vitest";
import { gvDeltaFor } from "../src/sim/ledger";
import type { RoundtableScript, RoundtableTurn } from "../src/sim/roundtable";
import type { MemorySlice } from "../src/sim/memory";
import { TICK_MS } from "../src/sim/rhythm";
import {
  SILENT_LINE_TICK,
  allowManualSpeech,
  silentLineDue,
} from "../src/game";
import { playScript, resolveTurnStatus } from "../src/ui/dialogue";
import { createRng } from "../src/sim/rng";

describe("gv single source of truth", () => {
  it("every runtime increment resolves through the ledger weight table", () => {
    const noon = 12;
    // Stare retuned 3 → 1.5 (stream B, ticket 0002): it was the dominant pump.
    expect(gvDeltaFor({ kind: "stare", creatureId: "gazer_01", durationMs: 3000 }, noon)).toBe(1.5);
    expect(gvDeltaFor({ kind: "feed", creatureId: "gazer_01", hesitationMs: 0 }, noon)).toBe(1);
    expect(gvDeltaFor({ kind: "clean", creatureId: "gazer_01" }, noon)).toBe(1);
    expect(gvDeltaFor({ kind: "rapid_click", creatureId: "gazer_01", count: 4 }, noon)).toBe(4);
    expect(gvDeltaFor({ kind: "carry", creatureId: "gazer_01" }, noon)).toBe(1);
    expect(gvDeltaFor({ kind: "name", creatureId: "gazer_01", name: "moss" }, noon)).toBe(2);
    expect(gvDeltaFor({ kind: "hatch", creatureId: "gazer_05" }, noon)).toBe(1);
    expect(gvDeltaFor({ kind: "idle", durationMs: 30000 }, noon)).toBe(2);
    expect(gvDeltaFor({ kind: "death", creatureId: "gazer_01", cause: "starvation" }, noon)).toBe(15);
  });

  it("the night multiplier (0..5h) applies to every kind, including death", () => {
    expect(gvDeltaFor({ kind: "stare", creatureId: "gazer_01", durationMs: 0 }, 3)).toBe(2.25);
    expect(gvDeltaFor({ kind: "death", creatureId: "gazer_01", cause: "neglect" }, 0)).toBe(22.5);
    expect(gvDeltaFor({ kind: "idle", durationMs: 0 }, 4)).toBe(3);
    expect(gvDeltaFor({ kind: "feed", creatureId: "gazer_01", hesitationMs: 0 }, 4)).toBeCloseTo(1.5);
    expect(gvDeltaFor({ kind: "carry", creatureId: "gazer_01" }, 4)).toBeCloseTo(1.5);
    expect(gvDeltaFor({ kind: "feed", creatureId: "gazer_01", hesitationMs: 0 }, 5)).toBe(1);
  });
});

describe("silent run compliance", () => {
  it("mutes every manual line when no endpoint is configured", () => {
    expect(allowManualSpeech(true)).toBe(false);
    expect(allowManualSpeech(false)).toBe(true);
  });

  it("schedules the single scripted line at exactly minute 40 of wall clock, once", () => {
    // The tick is stretched (ticket 0002), so minute 40 is measured in wall
    // time, not tick count: SILENT_LINE_TICK × tickMs must stay 40 minutes.
    expect(SILENT_LINE_TICK * TICK_MS).toBe(40 * 60_000);
    expect(silentLineDue(SILENT_LINE_TICK - 1, false)).toBe(false);
    expect(silentLineDue(SILENT_LINE_TICK, false)).toBe(true);
    expect(silentLineDue(SILENT_LINE_TICK + 500, false)).toBe(true);
    expect(silentLineDue(SILENT_LINE_TICK, true)).toBe(false);
    expect(silentLineDue(SILENT_LINE_TICK + 1, true)).toBe(false);
  });
});

function turn(speaker: string, text: string, memoryRef: string): RoundtableTurn {
  return { speaker, text, intent: "observe", mood: "curious", memoryRef };
}

function sliceOf(
  working: {
    id: string;
    fact: string;
    witnessed: "witnessed" | "heard" | "inferred" | "fabricated";
    distortion: null | "intensify" | "role_swap" | "invent_detail";
  }[],
  consolidated: string[] = [],
): MemorySlice {
  return {
    working: working.map((item) => ({
      id: item.id,
      atTick: 10,
      wallClock: "00:00:10",
      fact: item.fact,
      witnessed: item.witnessed,
      source: null,
      distortion: item.distortion,
      salience: 0.5,
      valence: 0.5,
    })),
    consolidated: consolidated.map((id, index) => ({
      id,
      content: `always ${index}`,
      derivedFrom: [],
      consolidatedAt: "tick_10",
      perspectiveNote: null,
    })),
  };
}

describe("runtime witness marks", () => {
  const slices: Record<string, MemorySlice> = {
    gazer_01: sliceOf([
      { id: "mem_seen", fact: "the player fed me", witnessed: "witnessed", distortion: null },
      { id: "mem_told", fact: "02 died", witnessed: "heard", distortion: null },
      {
        id: "mem_warped",
        fact: "the player fed me. it was meant for you.",
        witnessed: "witnessed",
        distortion: "intensify",
      },
    ], ["cons_001"]),
    gazer_02: sliceOf([]),
  };

  it("derives witnessed / heard / fabricated from the speaker's own slice", () => {
    expect(resolveTurnStatus(turn("gazer_01", "you fed me", "mem_seen"), slices)).toBe("witnessed");
    expect(resolveTurnStatus(turn("gazer_01", "someone said 02 died", "mem_told"), slices)).toBe("heard");
    expect(
      resolveTurnStatus(turn("gazer_01", "it was meant for you", "mem_warped"), slices),
    ).toBe("fabricated");
  });

  it("marks a citation of a memory the speaker does not hold as inferred", () => {
    expect(resolveTurnStatus(turn("gazer_02", "anything", "mem_seen"), slices)).toBe("inferred");
    expect(resolveTurnStatus(turn("gazer_01", "anything", "mem_missing"), slices)).toBe("inferred");
    expect(resolveTurnStatus(turn("gazer_01", "anything", "mem_seen"), {})).toBe("inferred");
  });

  it("self-knowledge cited from the consolidated layer is witnessed", () => {
    expect(resolveTurnStatus(turn("gazer_01", "always", "cons_001"), slices)).toBe("witnessed");
  });
});

describe("multi-turn playback wiring", () => {
  it("plays the whole scene on the jitter beat with per-turn marks", () => {
    const scene: RoundtableScript = {
      scene: [
        turn("gazer_01", "i saw you feed me", "mem_seen"),
        turn("gazer_01", "someone said 02 died", "mem_told"),
        turn("gazer_01", "it was meant for you", "mem_warped"),
      ],
    };
    const slices: Record<string, MemorySlice> = {
      gazer_01: sliceOf([
        { id: "mem_seen", fact: "the player fed me", witnessed: "witnessed", distortion: null },
        { id: "mem_told", fact: "02 died", witnessed: "heard", distortion: null },
        {
          id: "mem_warped",
          fact: "the player fed me. it was meant for you.",
          witnessed: "witnessed",
          distortion: "intensify",
        },
      ]),
    };
    const rng = createRng(1997, "scene:test");
    const playback = playScript(scene, {
      clock: { now: () => 0 },
      random: () => rng.next(),
    });
    expect(playback.turns.length).toBe(3);
    let previousReveal = 0;
    const statuses: string[] = [];
    for (const revealed of playback.turns) {
      expect(revealed.revealAtMs).toBeGreaterThan(previousReveal);
      expect(revealed.delayMs).toBeGreaterThanOrEqual(1500);
      expect(revealed.delayMs).toBeLessThanOrEqual(4000);
      statuses.push(resolveTurnStatus(revealed, slices));
      previousReveal = revealed.revealAtMs;
    }
    // Three paid turns survive; the marks are not one constant.
    expect(statuses).toEqual(["witnessed", "heard", "fabricated"]);
    expect(new Set(statuses).size).toBeGreaterThan(1);
  });
});
