import { describe, expect, it } from "vitest";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import { emptySlice, WORKING_CAPACITY } from "../src/sim/memory";
import { WHISPER_RANGE, WHISPER_TICKS } from "../src/sim/gossip";
import { whisperPass } from "../src/game";
import type { AdjacencyState } from "../src/game";

function adjacencyAfter(adjacency: AdjacencyState, a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  return adjacency[key] ?? 0;
}

function creature(id: string, x: number, y: number, distortionBias = 0.15): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 90, happiness: 80, energy: 90 },
    behavior: "idle",
    trait: null,
    position: { x, y },
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: ["########"],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 1,
      lineage: ["seed_alpha"],
      base: "you are a small one-eyed creature",
      traits: { curiosity: 0.5, loyalty: 0.5, deceit: 0.1, clinging: 0.5, watchfulness: 0.5 },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias,
    },
  };
}

function worldWith(tick: number, ...creatures: CreatureState[]): WorldState {
  return {
    tick,
    gv: 0,
    stage: 0,
    creatures: Object.fromEntries(creatures.map((entry) => [entry.id, entry])),
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
  };
}

function entry(id: string, atTick = 90): MemoryEntry {
  return {
    id,
    atTick,
    wallClock: "00:01:30",
    fact: "the player fed me after hesitating 1.4 seconds",
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence: 0.8,
  };
}

function slicesWith(creatureId: string, entries: MemoryEntry[]): Record<string, MemorySlice> {
  return {
    gazer_01: creatureId === "gazer_01" ? { working: entries, consolidated: [] } : emptySlice(),
    gazer_02: creatureId === "gazer_02" ? { working: entries, consolidated: [] } : emptySlice(),
    gazer_03: creatureId === "gazer_03" ? { working: entries, consolidated: [] } : emptySlice(),
  };
}

const world = (): WorldState => worldWith(100, creature("gazer_01", 5, 5), creature("gazer_02", 6, 5), creature("gazer_03", 13, 13));

describe("whisper pass", () => {
  it("stays silent until a pair has been adjacent for WHISPER_TICKS", () => {
    const worldState = world();
    const memories = slicesWith("gazer_01", [entry("mem_01_90_1")]);
    let adjacency: AdjacencyState = {};
    for (let tick = 1; tick < WHISPER_TICKS; tick += 1) {
      const result = whisperPass(worldState, memories, adjacency);
      adjacency = result.adjacency;
      expect(result.propagated).toEqual([]);
    }
    expect(adjacencyAfter(adjacency, "gazer_01", "gazer_02")).toBe(WHISPER_TICKS - 1);
    expect(memories["gazer_02"]?.working).toEqual([]);
  });

  it("fires at the fourth tick: both sides gain the other's newest memory", () => {
    const worldState = world();
    const memories: Record<string, MemorySlice> = {
      gazer_01: { working: [entry("mem_01_90_1", 90)], consolidated: [] },
      gazer_02: { working: [entry("mem_02_91_2", 91)], consolidated: [] },
      gazer_03: emptySlice(),
    };
    // Three warm-up ticks, then the fourth.
    let adjacency: AdjacencyState = {};
    for (let tick = 0; tick < WHISPER_TICKS - 1; tick += 1) {
      adjacency = whisperPass(worldState, memories, adjacency).adjacency;
    }
    const result = whisperPass(worldState, memories, adjacency);
    expect(result.propagated.length).toBe(2);
    const receiverTwo = result.memories["gazer_02"]?.working.find((item) => item.id === "mem_01_90_1");
    const receiverOne = result.memories["gazer_01"]?.working.find((item) => item.id === "mem_02_91_2");
    expect(receiverTwo).toBeDefined();
    expect(receiverOne).toBeDefined();
    // The mechanic contract: a retained whisper is heard and sourced; a failed
    // retention roll is stored as a distorted memory the holder believes it saw.
    for (const received of [receiverTwo, receiverOne]) {
      expect(received).toBeDefined();
      if (received?.witnessed === "heard") {
        expect(received.source).not.toBeNull();
        expect(received.distortion).toBeNull();
      } else {
        expect(received?.witnessed).toBe("witnessed");
        expect(received?.distortion).not.toBeNull();
      }
    }
  });

  it("does not echo: the same memory is never whispered twice to the same ear", () => {
    const worldState = world();
    const memories: Record<string, MemorySlice> = {
      gazer_01: { working: [entry("mem_01_90_1", 90)], consolidated: [] },
      gazer_02: emptySlice(),
      gazer_03: emptySlice(),
    };
    // Three warm-up ticks, then the fourth fires the whisper.
    let adjacency: AdjacencyState = {};
    for (let tick = 0; tick < WHISPER_TICKS - 1; tick += 1) {
      adjacency = whisperPass(worldState, memories, adjacency).adjacency;
    }
    let result = whisperPass(worldState, memories, adjacency);
    adjacency = result.adjacency;
    expect(result.propagated.length).toBe(1);
    // Walk past the next multiple of WHISPER_TICKS with the same memory: the
    // receiver already holds it by id, so nothing propagates again.
    for (let tick = 0; tick < WHISPER_TICKS; tick += 1) {
      result = whisperPass(worldState, result.memories, adjacency);
      adjacency = result.adjacency;
    }
    expect(result.propagated).toEqual([]);
  });

  it("forgets adjacency when the pair walks apart, and only tracks living pairs", () => {
    const apart = worldWith(100, creature("gazer_01", 5, 5), creature("gazer_02", 6, 5), creature("gazer_03", 13, 13));
    const far = worldWith(101, creature("gazer_01", 5, 5), creature("gazer_02", 12, 12), creature("gazer_03", 13, 13));
    const memories = slicesWith("gazer_01", [entry("mem_01_90_1")]);
    let adjacency: AdjacencyState = {};
    for (let tick = 0; tick < WHISPER_TICKS - 1; tick += 1) {
      adjacency = whisperPass(apart, memories, adjacency).adjacency;
    }
    expect(adjacencyAfter(adjacency, "gazer_01", "gazer_02")).toBe(WHISPER_TICKS - 1);
    // Out of range: the count resets to absent, and the far pair never appears.
    adjacency = whisperPass(far, memories, adjacency).adjacency;
    expect(adjacencyAfter(adjacency, "gazer_01", "gazer_02")).toBe(0);
    expect(adjacencyAfter(adjacency, "gazer_02", "gazer_03")).toBe(1);
    // Dead creatures are not listeners or speakers.
    const dead = worldWith(102, creature("gazer_01", 5, 5), creature("gazer_02", 6, 5), {
      ...creature("gazer_03", 13, 13),
      behavior: "dead",
      stats: { hunger: 0, hygiene: 0, happiness: 0, energy: 0 },
    });
    adjacency = whisperPass(dead, memories, adjacency).adjacency;
    expect(Object.keys(adjacency).some((key) => key.includes("gazer_03"))).toBe(false);
  });

  it("never lets a whisper reach farther than WHISPER_RANGE", () => {
    const worldState = worldWith(
      100,
      creature("gazer_01", 5, 5),
      creature("gazer_02", 5 + WHISPER_RANGE + 1, 5),
    );
    const memories: Record<string, MemorySlice> = {
      gazer_01: { working: [entry("mem_01_90_1", 90)], consolidated: [] },
      gazer_02: emptySlice(),
    };
    let adjacency: AdjacencyState = {};
    let result = whisperPass(worldState, memories, adjacency);
    for (let tick = 0; tick < WHISPER_TICKS * 3; tick += 1) {
      result = whisperPass(worldState, result.memories, adjacency);
      adjacency = result.adjacency;
    }
    expect(result.propagated).toEqual([]);
    expect(result.memories["gazer_02"]?.working).toEqual([]);
    expect(WORKING_CAPACITY).toBe(60);
  });
});
