// 0064 / T2 — world save/restore unit tests. Pure functions only; a tiny
// in-memory StorageLike stands in for localStorage (vitest env = node).
import { describe, expect, it } from "vitest";
import type { CreatureState, WorldState } from "../src/sim/types";
import { emptySlice } from "../src/sim/memory";
import { integrityVerdict } from "../src/ui/shell";
import type { SaveStorage } from "../src/sim/save";
import {
  WORLD_SAVE_KEY,
  WORLD_SAVE_VERSION,
  hydrateWorld,
  loadWorld,
  saveWorld,
  serializeWorld,
  worldChecksum,
} from "../src/sim/save";

class MemoryStorage implements SaveStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  raw(): string | null {
    return this.getItem(WORLD_SAVE_KEY);
  }
}

class ThrowingStorage implements SaveStorage {
  getItem(): string | null {
    throw new Error("security error on read");
  }
  setItem(): void {
    throw new Error("quota exceeded on write");
  }
}

function makeWorld(): WorldState {
  const creature: CreatureState = {
    id: "gazer_01",
    species: "gazerling",
    stats: { hunger: 80, hygiene: 70, happiness: 60, energy: 90 },
    behavior: "idle",
    trait: null,
    position: { x: 6, y: 5 },
    palette: ["#7ED957", "#B8F0A8"],
    mask: ["........", "...##..."],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
  return {
    tick: 12,
    gv: 22.5,
    stage: 1,
    creatures: { gazer_01: creature },
    structures: [],
    eggs: [],
    uiLabels: { news_ticker: "the sky is the colour of television" },
    paletteDecay: 0.2,
    seed: 1997,
    silent: true,
    memories: { gazer_01: emptySlice() },
    glyphsRead: ["fragment.f1"],
    ending: { kind: "gaze", atTick: 9 },
  };
}

interface Envelope {
  version: number;
  checksum: string;
  payload: string;
}

describe("0064 round trip", () => {
  it("serializes deterministically with a version and a payload checksum", () => {
    const world = makeWorld();
    const raw = serializeWorld(world);
    expect(serializeWorld(world)).toBe(raw);
    const env = JSON.parse(raw) as Envelope;
    expect(env.version).toBe(WORLD_SAVE_VERSION);
    expect(env.checksum).toBe(worldChecksum(world));
    expect(JSON.parse(env.payload)).toEqual(world);
  });

  it("hydrateWorld(serializeWorld(w)) restores every field byte-for-value", () => {
    const world = makeWorld();
    expect(hydrateWorld(serializeWorld(world))).toEqual(world);
  });

  it("saveWorld/loadWorld preserve tick/gv/stage/creatures/memories/glyphsRead/ending/silent/seed", () => {
    const storage = new MemoryStorage();
    const world = makeWorld();
    expect(saveWorld(storage, world)).toBe(true);
    expect(storage.raw()).toBe(serializeWorld(world));
    const restored = loadWorld(storage);
    expect(restored).toEqual(world);
    expect(restored?.tick).toBe(12);
    expect(restored?.gv).toBe(22.5);
    expect(restored?.stage).toBe(1);
    expect(restored?.creatures["gazer_01"]?.stats.hunger).toBe(80);
    expect(restored?.memories?.["gazer_01"]).toEqual(emptySlice());
    expect(restored?.glyphsRead).toEqual(["fragment.f1"]);
    expect(restored?.ending?.kind).toBe("gaze");
    expect(restored?.silent).toBe(true);
    expect(restored?.seed).toBe(1997);
  });

  it("a world without optional extensions also round-trips (legacy shape)", () => {
    const world = makeWorld();
    const minimal: WorldState = {
      tick: world.tick,
      gv: world.gv,
      stage: world.stage,
      creatures: world.creatures,
      structures: world.structures,
      eggs: world.eggs,
      uiLabels: world.uiLabels,
      paletteDecay: world.paletteDecay,
      seed: world.seed,
      silent: world.silent,
    };
    const storage = new MemoryStorage();
    saveWorld(storage, minimal);
    expect(loadWorld(storage)).toEqual(minimal);
  });

  it("refused / throwing storage degrades without throwing", () => {
    const world = makeWorld();
    expect(saveWorld(null, world)).toBe(false);
    expect(loadWorld(null)).toBeNull();
    const throwing = new ThrowingStorage();
    expect(() => saveWorld(throwing, world)).not.toThrow();
    expect(saveWorld(throwing, world)).toBe(false);
    expect(() => loadWorld(throwing)).not.toThrow();
    expect(loadWorld(throwing)).toBeNull();
  });
});

describe("0064 bad archive falls back to a new world", () => {
  const malformed: (string | null | undefined)[] = [
    null,
    undefined,
    "",
    "   ",
    "not json",
    "{",
    "[]",
    "42",
    '"text"',
    "{}",
    JSON.stringify({ version: WORLD_SAVE_VERSION }),
    JSON.stringify({ version: WORLD_SAVE_VERSION, payload: "{}", checksum: "00000000" }),
    JSON.stringify({ version: WORLD_SAVE_VERSION, payload: "not json", checksum: "deadbeef" }),
    JSON.stringify({ version: WORLD_SAVE_VERSION, payload: 7, checksum: "deadbeef" }),
    JSON.stringify({ version: 999, payload: "{}", checksum: "00000000" }),
    JSON.stringify({ version: "2", payload: "{}", checksum: "00000000" }),
  ];

  it("hydrateWorld returns null for every malformed archive", () => {
    for (const raw of malformed) {
      expect(() => hydrateWorld(raw)).not.toThrow();
      expect(hydrateWorld(raw)).toBeNull();
    }
  });

  it("rejects structurally broken worlds even inside a valid envelope", () => {
    const world = makeWorld();
    const broken: unknown[] = [
      { ...world, gv: "high" },
      { ...world, tick: -1 },
      { ...world, tick: Number.NaN },
      { ...world, stage: 9 },
      { ...world, creatures: { gazer_01: { id: "gazer_01" } } },
      { ...world, creatures: [] },
      { ...world, silent: "yes" },
      { ...world, uiLabels: { bad: 3 } },
      { ...world, memories: { gazer_01: 5 } },
      { ...world, structures: "nope" },
      { ...world, seed: Infinity },
    ];
    for (const candidate of broken) {
      expect(hydrateWorld(serializeWorld(candidate as WorldState))).toBeNull();
    }
  });

  it("a checksum mismatch (tampered payload) is rejected, not thrown", () => {
    const world = makeWorld();
    const env = JSON.parse(serializeWorld(world)) as Envelope;
    env.payload = env.payload.replace('"gv":22.5', '"gv":99');
    expect(hydrateWorld(JSON.stringify(env))).toBeNull();
  });

  it("boot fallback: corrupt archive -> fresh world, then a valid save is written", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORLD_SAVE_KEY, "{broken");
    expect(() => loadWorld(storage)).not.toThrow();
    const fresh = loadWorld(storage) ?? makeWorld();
    expect(fresh).toEqual(makeWorld());
    expect(saveWorld(storage, fresh)).toBe(true);
    expect(loadWorld(storage)).toEqual(fresh);
  });
});

describe("0064 legacy version migration", () => {
  it("v1 envelope (payload, no checksum) hydrates and the next save upgrades to v2", () => {
    const storage = new MemoryStorage();
    const world = makeWorld();
    storage.setItem(WORLD_SAVE_KEY, JSON.stringify({ version: 1, payload: JSON.stringify(world) }));
    expect(loadWorld(storage)).toEqual(world);
    expect(saveWorld(storage, world)).toBe(true);
    const env = JSON.parse(storage.raw() ?? "{}") as Envelope;
    expect(env.version).toBe(WORLD_SAVE_VERSION);
    expect(env.checksum).toBe(worldChecksum(world));
    expect(loadWorld(storage)).toEqual(world);
  });

  it("v0 bare world JSON (no envelope at all) migrates in memory", () => {
    const world = makeWorld();
    expect(hydrateWorld(JSON.stringify(world))).toEqual(world);
  });

  it("v0 with a malformed body still falls back", () => {
    expect(hydrateWorld('{"tick":"x","gv":1}')).toBeNull();
  });

  it("unknown / future versions never get guessed", () => {
    expect(hydrateWorld(JSON.stringify({ version: 999, payload: "{}", checksum: "0" }))).toBeNull();
    expect(hydrateWorld(JSON.stringify({ version: -1, payload: "{}" }))).toBeNull();
  });
});

describe("0064 tamper does not crash", () => {
  it("integrityVerdict flags a changed checksum, tolerates the unchanged one", () => {
    const world = makeWorld();
    expect(worldChecksum(world)).toBe(worldChecksum(world));
    expect(worldChecksum(world)).not.toBe(worldChecksum({ ...world, gv: 99 }));
    expect(integrityVerdict(worldChecksum(world), worldChecksum(world))).toBe("none");
    expect(integrityVerdict(worldChecksum(world), worldChecksum({ ...world, gv: 99 }))).toBe("tampered");
  });

  it("loadWorld returns null for an externally tampered stored payload", () => {
    const storage = new MemoryStorage();
    const world = makeWorld();
    saveWorld(storage, world);
    const env = JSON.parse(storage.raw() ?? "{}") as Envelope;
    storage.setItem(
      WORLD_SAVE_KEY,
      JSON.stringify({ ...env, payload: env.payload.replace('"seed":1997', '"seed":42') }),
    );
    expect(() => loadWorld(storage)).not.toThrow();
    expect(loadWorld(storage)).toBeNull();
    // The game's fallback path stays available: a fresh world can be saved.
    expect(saveWorld(storage, makeWorld())).toBe(true);
    expect(loadWorld(storage)).toEqual(makeWorld());
  });

  it("hydrateWorld is total over a fuzz set of odd inputs", () => {
    const fuzz = [
      "null",
      "true",
      "0",
      "[1,2,3]",
      '{"version":2,"payload":null,"checksum":1}',
      '{"version":2,"payload":"{}","checksum":null}',
      '{"version":2,"payload":"{\\"tick\\":1}","checksum":"00000000"}',
      '{"version":1,"payload":"[]"}',
      '{"version":2,"payload":"{}","checksum":"ffffffff","extra":{"__proto__":1}}',
      "\u0000",
      "{\"version\":2,\"payload\":\"{}\",\"checksum\":\"00000000\"",
    ];
    for (const raw of fuzz) {
      expect(() => hydrateWorld(raw)).not.toThrow();
    }
  });
});
