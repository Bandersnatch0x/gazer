import { describe, expect, it } from "vitest";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import { resolveWhisper, WHISPER_TICKS } from "../src/sim/gossip";
import { emptySocial, stainKey, ACCENT_FACTION_TENDER, ACCENT_FACTION_WRONG } from "../src/sim/social";
import { whisperPass } from "../src/game";
import type { AdjacencyState } from "../src/game";
import { paletteAt } from "../src/render/palette";
import { creatureDraws, scenePlan } from "../src/render/scene";

/**
 * Integration wiring for stream F's consumption side (ticket 0006 leftovers,
 * closed by task-8): whisperPass feeds crossFaction, the render side consumes
 * factionAccent and terrain stains. The sim-side seams themselves are F's own
 * tests; here we pin that the wirings are actually attached.
 */

function creature(id: string, x: number, y: number): CreatureState {
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
      distortionBias: 0,
    },
  };
}

function entry(id: string, atTick: number, valence: number): MemoryEntry {
  return {
    id,
    atTick,
    wallClock: "00:01:30",
    fact: "the player fed me",
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

function worldWith(
  tick: number,
  memories: Readonly<Record<string, MemorySlice>> | undefined,
  social: WorldState["social"],
  ...creatures: CreatureState[]
): WorldState {
  return {
    tick,
    gv: 0,
    stage: 0,
    creatures: Object.fromEntries(creatures.map((item) => [item.id, item])),
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    ...(memories === undefined ? {} : { memories }),
    ...(social === undefined ? {} : { social }),
  };
}

const TENDER = { working: [entry("mem_keep_01", 90, 0.9)], consolidated: [] };
const TENDER_B = { working: [entry("mem_keep_03", 92, 0.8)], consolidated: [] };
const WRONG = { working: [entry("mem_keep_02", 91, -0.9)], consolidated: [] };

function fireWhisper(worldState: WorldState, memories: Record<string, MemorySlice>): ReturnType<typeof whisperPass> {
  let adjacency: AdjacencyState = {};
  for (let tick = 0; tick < WHISPER_TICKS - 1; tick += 1) {
    adjacency = whisperPass(worldState, memories, adjacency).adjacency;
  }
  return whisperPass(worldState, memories, adjacency);
}

describe("whisperPass cross-faction wiring (ticket 0006 裁决 4)", () => {
  it("a whisper across factions matches a direct resolveWhisper with crossFaction: true", () => {
    const worldState = worldWith(
      100,
      { gazer_01: TENDER, gazer_02: WRONG },
      undefined,
      creature("gazer_01", 5, 5),
      creature("gazer_02", 6, 5),
    );
    const result = fireWhisper(worldState, { gazer_01: TENDER, gazer_02: WRONG });
    const received = result.memories["gazer_02"]?.working.find((item) => item.id === "mem_keep_01");
    expect(received).toBeDefined();
    expect(received).toEqual(
      resolveWhisper({
        sender: worldState.creatures["gazer_01"]!,
        receiver: worldState.creatures["gazer_02"]!,
        entry: TENDER.working[0]!,
        worldSeed: 1997,
        crossFaction: true,
      }),
    );
  });

  it("a whisper inside one faction matches the default (no penalty) path", () => {
    const worldState = worldWith(
      100,
      { gazer_01: TENDER, gazer_02: TENDER },
      undefined,
      creature("gazer_01", 5, 5),
      creature("gazer_02", 6, 5),
    );
    const result = fireWhisper(worldState, { gazer_01: TENDER_B, gazer_02: TENDER });
    const received = result.memories["gazer_02"]?.working.find((item) => item.id === "mem_keep_03");
    expect(received).toBeDefined();
    expect(received).toEqual(
      resolveWhisper({
        sender: worldState.creatures["gazer_01"]!,
        receiver: worldState.creatures["gazer_02"]!,
        entry: TENDER_B.working[0]!,
        worldSeed: 1997,
      }),
    );
  });
});

describe("scene consumes factionAccent (ticket 0006 裁决 3)", () => {
  const pal = paletteAt(0);

  it("tender believers wear the tender accent in slot 3", () => {
    const worldState = worldWith(100, { gazer_01: TENDER }, undefined, creature("gazer_01", 5, 5));
    const draw = creatureDraws(worldState, pal).find((item) => item.id === "gazer_01");
    expect(draw?.palette[3]).toBe(ACCENT_FACTION_TENDER);
  });

  it("wrong believers wear the wrong accent in slot 3", () => {
    const worldState = worldWith(100, { gazer_01: WRONG }, undefined, creature("gazer_01", 5, 5));
    const draw = creatureDraws(worldState, pal).find((item) => item.id === "gazer_01");
    expect(draw?.palette[3]).toBe(ACCENT_FACTION_WRONG);
  });

  it("factionless creatures keep their fallback accent colour", () => {
    const worldState = worldWith(100, undefined, undefined, creature("gazer_01", 5, 5));
    const draw = creatureDraws(worldState, pal).find((item) => item.id === "gazer_01");
    expect(draw?.palette[3]).toBe(pal.creature[3]);
  });
});

describe("scene carries terrain stains (ticket 0006 裁决 7 消费侧)", () => {
  it("a stained tile rides the tile data; a clean tile carries none", () => {
    const social = {
      ...emptySocial(),
      stains: {
        [stainKey({ x: 5, y: 5 })]: {
          kind: "mourning" as const,
          intensity: 1,
          createdAtTick: 90,
          lastTouchTick: 100,
        },
      },
    };
    const worldState = worldWith(100, undefined, social, creature("gazer_01", 5, 5));
    const plan = scenePlan(worldState);
    const stained = plan.tiles.find((tile) => tile.tile.x === 5 && tile.tile.y === 5);
    const clean = plan.tiles.find((tile) => tile.tile.x === 6 && tile.tile.y === 5);
    expect(stained?.stain?.kind).toBe("mourning");
    expect(stained?.stain?.intensity).toBe(1);
    expect(clean?.stain).toBeUndefined();
  });

  it("a world without social state renders no stains", () => {
    const worldState = worldWith(100, undefined, undefined, creature("gazer_01", 5, 5));
    const plan = scenePlan(worldState);
    expect(plan.tiles.every((tile) => tile.stain === undefined)).toBe(true);
  });
});

describe("game.ts memories sync contract (ticket 0006 leftover ①)", () => {
  it("the tick loop and remember() keep world.memories in lockstep with the ledger", async () => {
    // Source contract: both sync points exist, spread-built and deterministic.
    const source = await import("node:fs").then((fs) =>
      fs.promises.readFile(new URL("../src/game.ts", import.meta.url), "utf8"),
    );
    const syncs = source.split("world = { ...world, memories: { ...memories } }").length - 1;
    expect(syncs).toBeGreaterThanOrEqual(2); // remember() + the whisper pass
    expect(source).toContain("crossFaction: crossFaction(nextMemories[sender.id], nextMemories[receiver.id])");
  });
});
