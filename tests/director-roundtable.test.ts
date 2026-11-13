import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseRoundtable, validateTurns } from "../src/director/roundtable";
import { manualPool } from "../src/director/manual";
import type { RoundtableScript, RoundtableTurn } from "../src/sim/roundtable";
import type { ConsolidatedEntry, MemoryEntry, MemorySlice } from "../src/sim/memory";

function entry(id: string, fact: string): MemoryEntry {
  return {
    id,
    atTick: 0,
    wallClock: "02:14",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.8,
    valence: -0.9,
  };
}

function consolidated(id: string, content: string): ConsolidatedEntry {
  return { id, content, derivedFrom: [], consolidatedAt: "02:20", perspectiveNote: null };
}

function sliceOf(...entries: MemoryEntry[]): MemorySlice {
  return { working: entries, consolidated: [] };
}

function turn(overrides: Partial<RoundtableTurn> = {}): RoundtableTurn {
  return {
    speaker: "01",
    text: "the tower grew at night",
    intent: "observe",
    mood: "curious",
    memoryRef: "mem_1",
    ...overrides,
  };
}

const VALID_TURN = {
  speaker: "01",
  text: "the tower grew at night",
  intent: "observe",
  mood: "curious",
  memoryRef: "mem_1",
};

describe("roundtable parsing", () => {
  it("parses a valid 2..4 turn script and trims fields", () => {
    const script = parseRoundtable({
      scene: [
        VALID_TURN,
        { ...VALID_TURN, speaker: " 02 ", text: " the room went dark ", memoryRef: " mem_2 " },
      ],
    });

    expect(script).toEqual({
      scene: [
        VALID_TURN,
        {
          speaker: "02",
          text: "the room went dark",
          intent: "observe",
          mood: "curious",
          memoryRef: "mem_2",
        },
      ],
    });
  });

  it("rejects a scene outside the 2..4 turn range", () => {
    expect(parseRoundtable({ scene: [VALID_TURN] })).toBeNull();
    expect(
      parseRoundtable({
        scene: [VALID_TURN, VALID_TURN, VALID_TURN, VALID_TURN, VALID_TURN],
      }),
    ).toBeNull();
  });

  it("rejects any turn with a missing or invalid field", () => {
    const invalidTurns: readonly unknown[] = [
      { ...VALID_TURN, speaker: undefined },
      { ...VALID_TURN, speaker: "" },
      { ...VALID_TURN, speaker: 1 },
      { ...VALID_TURN, text: null },
      { ...VALID_TURN, text: "   " },
      { ...VALID_TURN, intent: "shout" },
      { ...VALID_TURN, mood: "angry" },
      { ...VALID_TURN, memoryRef: undefined },
      { ...VALID_TURN, memoryRef: "" },
    ];

    for (const invalid of invalidTurns) {
      expect(parseRoundtable({ scene: [VALID_TURN, invalid] })).toBeNull();
    }
  });

  it("rejects non-object roots and non-array scenes", () => {
    for (const raw of [null, undefined, 42, "scene", true, [], {}, { scene: null }, { scene: {} }]) {
      expect(parseRoundtable(raw)).toBeNull();
    }
  });

  it("ignores unknown extra keys", () => {
    const script = parseRoundtable({
      scene: [{ ...VALID_TURN, extra: true }, { ...VALID_TURN, speaker: "02" }],
      extra: 1,
    });

    expect(script).not.toBeNull();
    expect(script?.scene).toHaveLength(2);
  });

  it("never throws on arbitrary JSON and only returns well-formed scripts", () => {
    const arbTurnJson = fc.record({
      speaker: fc.anything(),
      text: fc.anything(),
      intent: fc.anything(),
      mood: fc.anything(),
      memoryRef: fc.anything(),
    });
    const arbRaw = fc.oneof(
      fc.anything(),
      fc.record({ scene: fc.array(arbTurnJson, { maxLength: 5 }) }),
      fc.record({ scene: fc.array(arbTurnJson, { minLength: 2, maxLength: 4 }) }),
    );

    fc.assert(
      fc.property(arbRaw, (raw) => {
        const script = parseRoundtable(raw);
        if (script === null) {
          return;
        }
        expect(script.scene.length).toBeGreaterThanOrEqual(2);
        expect(script.scene.length).toBeLessThanOrEqual(4);
        for (const parsed of script.scene) {
          expect(parsed.speaker.trim().length).toBeGreaterThan(0);
          expect(parsed.text.trim().length).toBeGreaterThan(0);
          expect(parsed.memoryRef.trim().length).toBeGreaterThan(0);
          expect(["observe", "deceive", "query", "confide", "accuse", "comfort"]).toContain(
            parsed.intent,
          );
          expect(["curious", "sad", "loving", "wrong", "hungry"]).toContain(parsed.mood);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe("roundtable validation", () => {
  it("always replaces a turn whose memoryRef is outside the speaker's slice", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).map((suffix) => `missing_${suffix}`),
        fc.string({ maxLength: 80 }),
        (missingRef, text) => {
          const script: RoundtableScript = {
            scene: [
              turn({ text, memoryRef: missingRef }),
              turn({ speaker: "02", text: "the room went dark", memoryRef: "mem_2" }),
            ],
          };
          const slices = {
            "01": sliceOf(entry("mem_1", "the tower grew at night")),
            "02": sliceOf(entry("mem_2", "the room went dark")),
          };
          const pools = { "01": manualPool(2), "02": manualPool(2) };

          const result = validateTurns(script, slices, pools);
          expect(result).not.toBeNull();
          expect(pools["01"]).toContain(result?.scene[0]?.text);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("replaces a turn that shares fewer than two content words with its memory", () => {
    const slices = { "01": sliceOf(entry("mem_1", "the tower grew when the room went dark")) };
    const pools = { "01": ["pool line one", "pool line two"] };

    const result = validateTurns(
      { scene: [turn({ text: "i am hungry" }), turn({ text: "the room went dark" })] },
      slices,
      pools,
    );

    expect(result).not.toBeNull();
    expect(pools["01"]).toContain(result?.scene[0]?.text);
    expect(result?.scene[1]?.text).toBe("the room went dark");
  });

  it("accepts a consolidated entry as a first-hand citation", () => {
    const slices = {
      "01": {
        working: [],
        consolidated: [consolidated("cons_031", "your human once lied about 02")],
      },
    };
    const pools = { "01": ["pool line"] };

    const result = validateTurns(
      { scene: [turn({ memoryRef: "cons_031", text: "your human lied" })] },
      slices,
      pools,
    );

    expect(result).not.toBeNull();
    expect(result?.scene[0]?.text).toBe("your human lied");
  });

  it("drops the turn when the speaker has no pool to draw from", () => {
    const script: RoundtableScript = { scene: [turn({ memoryRef: "mem_gone" })] };
    const result = validateTurns(script, { "01": sliceOf() }, { "01": [] });

    expect(result).toBeNull();
  });

  it("drops the turn when the speaker has no slice and no pool", () => {
    const script: RoundtableScript = { scene: [turn()] };
    const result = validateTurns(script, {}, {});

    expect(result).toBeNull();
  });

  it("drops a turn from a speaker the slices and pools do not know at all", () => {
    // The model's speaker list is untrusted: an unknown id must never smuggle
    // its fabricated line past validation (playtest p4 finding F4).
    const script: RoundtableScript = {
      scene: [
        { speaker: "99", text: "i invented a memory", intent: "confide", mood: "sad", memoryRef: "mem_99" },
        turn({ speaker: "01", text: "the room went dark", memoryRef: "mem_1" }),
      ],
    };
    const slices = { "01": sliceOf(entry("mem_1", "the room went dark")) };
    const pools = { "01": ["pool line"] };

    const result = validateTurns(script, slices, pools);

    expect(result).not.toBeNull();
    expect(result?.scene).toHaveLength(1);
    expect(result?.scene[0]?.speaker).toBe("01");
  });

  it("falls back to null when every turn is ungrounded", () => {
    const script: RoundtableScript = {
      scene: [
        turn({ memoryRef: "mem_gone" }),
        turn({ speaker: "02", memoryRef: "mem_gone" }),
      ],
    };
    const slices = {
      "01": sliceOf(entry("mem_1", "the tower grew at night")),
      "02": sliceOf(entry("mem_2", "the tower grew at night")),
    };
    const pools = { "01": [], "02": [] };

    expect(validateTurns(script, slices, pools)).toBeNull();
  });

  it("is deterministic", () => {
    const script: RoundtableScript = { scene: [turn({ memoryRef: "mem_gone" })] };
    const slices = { "01": sliceOf(entry("mem_1", "the tower grew at night")) };
    const pools = { "01": manualPool(3) };

    expect(validateTurns(script, slices, pools)).toEqual(validateTurns(script, slices, pools));
  });
});
