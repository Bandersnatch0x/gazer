import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildContext,
  scoreMemory,
  TOKEN_BUDGET,
} from "../src/director/context";
import type { AttendingCreature, ContextInput } from "../src/director/context";
import type {
  ConsolidatedEntry,
  EpistemicStatus,
  MemoryEntry,
  MemorySlice,
} from "../src/sim/memory";
import type { CreatureState, Stage } from "../src/sim/types";
import type { GenomeTraits, PromptGenome } from "../src/sim/genome";

const TRAITS: GenomeTraits = {
  curiosity: 0.9,
  loyalty: 0.4,
  deceit: 0.2,
  clinging: 0.7,
  watchfulness: 0.8,
};

function memoryEntry(
  id: string,
  fact: string,
  overrides: Partial<MemoryEntry> = {},
): MemoryEntry {
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
    ...overrides,
  };
}

function buildCreature(
  id: string,
  working: readonly MemoryEntry[],
  consolidated: readonly ConsolidatedEntry[],
  drift: readonly string[],
): AttendingCreature {
  const state: CreatureState = {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 1, y: 1 },
    palette: ["#fff"],
    mask: ["x"],
    hatchedAtTick: 0,
  };
  const genome: PromptGenome = {
    id,
    generation: 2,
    lineage: [],
    base: "watcher",
    traits: TRAITS,
    drift,
    secrets: [],
    manualPool: [],
    temperatureBias: 0,
    distortionBias: 0,
  };
  const memory: MemorySlice = { working, consolidated };
  return { state, genome, memory };
}

const arbWitnessed: fc.Arbitrary<EpistemicStatus> = fc.constantFrom(
  "witnessed",
  "heard",
  "inferred",
  "fabricated",
);

const arbMemory: fc.Arbitrary<MemoryEntry> = fc.record({
  id: fc.stringMatching(/^[a-z0-9_]{1,12}$/),
  atTick: fc.integer({ min: 0, max: 30000 }),
  wallClock: fc.string({ maxLength: 8 }),
  fact: fc.string({ maxLength: 160 }),
  witnessed: arbWitnessed,
  source: fc.option(fc.string({ maxLength: 6 }), { nil: null }),
  distortion: fc.constant(null),
  salience: fc.double({ min: 0, max: 1, noNaN: true }),
  valence: fc.double({ min: -1, max: 1, noNaN: true }),
});

const arbConsolidated: fc.Arbitrary<ConsolidatedEntry> = fc.record({
  id: fc.stringMatching(/^cons_[0-9]{1,4}$/),
  content: fc.string({ maxLength: 80 }),
  derivedFrom: fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 }),
  consolidatedAt: fc.string({ maxLength: 8 }),
  perspectiveNote: fc.constant(null),
});

const arbSeatData = fc.record({
  working: fc.array(arbMemory, { maxLength: 6 }),
  consolidated: fc.array(arbConsolidated, { maxLength: 2 }),
  drift: fc.array(fc.string({ maxLength: 60 }), { maxLength: 4 }),
});

const arbCreatures: fc.Arbitrary<readonly AttendingCreature[]> = fc
  .array(arbSeatData, { maxLength: 4 })
  .map((seats) =>
    seats.map((seat, index) =>
      buildCreature(`0${index + 1}`, seat.working, seat.consolidated, seat.drift),
    ),
  );

const arbInput: fc.Arbitrary<ContextInput> = fc.record({
  stage: fc.constantFrom<Stage>(0, 1, 2, 3, 4),
  trigger: fc.string({ maxLength: 60 }),
  creatures: arbCreatures,
  recentActions: fc.array(fc.string({ maxLength: 60 }), { maxLength: 15 }),
  sharedBelief: fc.string({ maxLength: 120 }),
  ambient: fc.string({ maxLength: 200 }),
  tick: fc.integer({ min: 0, max: 30000 }),
});

function baseInput(creatures: readonly AttendingCreature[]): ContextInput {
  return {
    stage: 2,
    tick: 3180,
    trigger: "player_stared 6200ms",
    creatures,
    recentActions: [],
    sharedBelief: "player: the one who watches",
    ambient: "silent no",
  };
}

describe("memory scoring", () => {
  it("applies the documented weights exactly", () => {
    const entry = memoryEntry("mem_1042", "player stared at 02", {
      atTick: 720,
      salience: 0.8,
      valence: -0.6,
    });
    const trigger = "player_stared 6200ms";
    // Trigger content words: player, stared, 6200ms. The fact shares two of three.
    const relevance = 2 / 3;
    const recency = 0.5 ** ((1000 - 720) / 1440);
    const expected = 0.8 + 2.0 * relevance + 1.5 * recency + 0 + 0.8 * 0.6 - 0;

    expect(scoreMemory(entry, trigger, 1000)).toBeCloseTo(expected, 10);
  });

  it("decays recency with a one-game-day half-life", () => {
    const entry = memoryEntry("mem_1", "the room went dark", {
      atTick: 0,
      salience: 0.5,
      valence: 0,
    });
    const atZero = scoreMemory(entry, "the room", 0);
    const atOneDay = scoreMemory(entry, "the room", 1440);
    const atTwoDays = scoreMemory(entry, "the room", 2880);

    expect(atZero - atOneDay).toBeCloseTo(1.5 * 0.5, 10);
    expect(atOneDay - atTwoDays).toBeCloseTo(1.5 * 0.25, 10);
  });

  it("penalises inferred sources by half a weight unit", () => {
    const witnessed = memoryEntry("mem_2", "the tower grew", { witnessed: "witnessed" });
    const inferred = memoryEntry("mem_2", "the tower grew", { witnessed: "inferred" });

    expect(scoreMemory(witnessed, "tower", 0) - scoreMemory(inferred, "tower", 0)).toBeCloseTo(
      0.25,
      10,
    );
  });

  it("marks consolidation candidates by their core_ prefix", () => {
    const plain = memoryEntry("mem_3", "the tower grew");
    const core = memoryEntry("core_3", "the tower grew");

    expect(scoreMemory(core, "tower", 0) - scoreMemory(plain, "tower", 0)).toBeCloseTo(1.0, 10);
  });
});

describe("context assembly", () => {
  it("serialises a memory with its id, source, salience, and valence", () => {
    const input = baseInput([buildCreature("01", [memoryEntry("mem_1042", "02 starved while you watched")], [], [])]);
    const { text } = buildContext(input);

    expect(text).toContain('[mem_1042|witnessed] "02 starved while you watched" (sal .8, val -.9)');
    expect(text).toContain("SCENE TRIGGER\nstage 2 | tick 3180 | trigger: player_stared 6200ms");
    expect(text).toContain("SHARED BELIEF\nplayer: the one who watches");
    expect(text).toContain("CREATURE 01\nid 01 | gen 2 | curiosity,watchfulness | mood loving | impression -.9");
  });

  it("keeps at most four candidate memories before any trimming", () => {
    const working = Array.from({ length: 6 }, (_, index) =>
      memoryEntry(`mem_${index + 1}`, `the tower moved at night ${index}`),
    );
    const { text } = buildContext(baseInput([buildCreature("01", working, [], [])]));

    expect(text.match(/^\[mem_/gm)?.length).toBe(4);
  });

  it("truncates an over-long fact at a word boundary and keeps its id", () => {
    const words = Array.from({ length: 40 }, (_, index) => `word${index}`);
    const { text } = buildContext(
      baseInput([buildCreature("01", [memoryEntry("mem_9", words.join(" "))], [], [])]),
    );

    expect(text).toContain(`[mem_9|witnessed] "${words.slice(0, 25).join(" ")}..."`);
    expect(text).not.toContain("word25");
  });

  it("always includes consolidated self-knowledge", () => {
    const consolidated: ConsolidatedEntry = {
      id: "cons_031",
      content: "your human once lied to you about 02",
      derivedFrom: ["mem_1"],
      consolidatedAt: "02:20",
      perspectiveNote: null,
    };
    const { text } = buildContext(
      baseInput([buildCreature("01", [memoryEntry("mem_1", "02 left")], [consolidated], [])]),
    );

    expect(text).toContain('always: [cons_031] "your human once lied to you about 02"');
  });

  it("is deterministic for the same input", () => {
    const input = baseInput([
      buildCreature("01", [memoryEntry("mem_1", "the room went dark")], [], ["asks about the window"]),
    ]);

    expect(buildContext(input)).toEqual(buildContext(input));
  });

  it("never exceeds the token budget for arbitrary inputs", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const { text, tokens } = buildContext(input);
        expect(tokens).toBe(Math.ceil(text.length / 4));
        expect(tokens).toBeLessThanOrEqual(TOKEN_BUDGET);
        expect(text).toContain(input.sharedBelief.trim());
      }),
      { numRuns: 200 },
    );
  });

  it("degrades by dropping whole creatures rather than splitting a block", () => {
    const longFact = Array.from({ length: 25 }, (_, index) => `pressure${index}`).join(" ");
    const heavy = Array.from({ length: 4 }, (_, seat) =>
      buildCreature(
        `0${seat + 1}`,
        Array.from({ length: 6 }, (_, index) => memoryEntry(`mem_${seat}${index}`, longFact)),
        [
          {
            id: `cons_${seat}1`,
            content: longFact,
            derivedFrom: [],
            consolidatedAt: "02:20",
            perspectiveNote: null,
          },
          {
            id: `cons_${seat}2`,
            content: longFact,
            derivedFrom: [],
            consolidatedAt: "02:21",
            perspectiveNote: null,
          },
        ],
        [longFact, longFact],
      ),
    );
    const input: ContextInput = {
      ...baseInput(heavy),
      recentActions: Array.from({ length: 15 }, () => longFact),
    };

    const { text, tokens } = buildContext(input);
    expect(tokens).toBeLessThanOrEqual(TOKEN_BUDGET);
    expect(text).toContain("DROPPED");
    expect(text).toContain(input.sharedBelief);

    const dropSection = text.split("\n\nDROPPED\n")[1]?.split("\n\n")[0] ?? "";
    const droppedIds = dropSection.split(", ");
    for (const seat of heavy) {
      const rendered = text.includes(`CREATURE ${seat.state.id}\nid ${seat.state.id} |`);
      expect(rendered || droppedIds.includes(seat.state.id)).toBe(true);
      if (rendered) {
        // A surviving block is whole: identity, both consolidated entries, and memories.
        const seatIndex = Number(seat.state.id) - 1;
        expect(text).toContain(`always: [cons_${seatIndex}1]`);
        expect(text).toContain(`always: [cons_${seatIndex}2]`);
      }
    }
  });
});
