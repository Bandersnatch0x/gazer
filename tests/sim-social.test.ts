import { describe, expect, it } from "vitest";
import {
  COURTSHIP_TICKS,
  DEFAULT_MASK,
  GRID_MAX,
  GRID_MIN,
  HUNGRY_AT,
  MAX_EGGS,
  step,
  WILLING_AT,
} from "../src/sim/engine";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { GenomeTraits, PromptGenome } from "../src/sim/genome";
import { emptySlice, type MemoryEntry, type MemorySlice } from "../src/sim/memory";
import {
  accentForSex,
  activeMourningFor,
  addStain,
  beliefAboutPlayer,
  careModelFor,
  crossFaction,
  emptySocial,
  factionAccent,
  factionOf,
  fadeStainsAt,
  isJuvenile,
  JUVENILE_TICKS,
  memoriesAbout,
  movementIntent,
  pairSexCompatible,
  registerSex,
  ringSlotFor,
  sexFor,
  SOCIAL_GRID_MAX,
  SOCIAL_GRID_MIN,
  SOCIAL_HUNGRY_AT,
  stainAt,
  stainKey,
} from "../src/sim/social";
import { resolveWhisper } from "../src/sim/gossip";

// ---------------------------------------------------------------------------
// Helpers. Creatures are hand-built (no sex, no genome) unless a test opts in:
// that is the legacy shape the existing suites pin, and the social layer must
// treat it as "unknown" everywhere.
// ---------------------------------------------------------------------------

function genome(id: string, traits: Partial<GenomeTraits> = {}): PromptGenome {
  return {
    id,
    generation: 1,
    lineage: ["seed_alpha"],
    base: `soul of ${id}`,
    traits: {
      curiosity: 0.5,
      loyalty: 0.5,
      deceit: 0.1,
      clinging: 0.5,
      watchfulness: 0.5,
      ...traits,
    },
    drift: [],
    secrets: [],
    manualPool: [],
    temperatureBias: 0,
    distortionBias: 0.15,
  };
}

function creature(id: string, overrides: Partial<CreatureState> = {}): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 80, hygiene: 80, happiness: 80, energy: 80 },
    behavior: "idle",
    trait: null,
    position: { x: 7, y: 7 },
    palette: ["#fff", "#0f0", "#000"],
    mask: DEFAULT_MASK,
    // Adults by default: hatched far enough back that the juvenile window is
    // closed at test ticks.
    hatchedAtTick: -JUVENILE_TICKS,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    ...overrides,
  };
}

function world(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 0,
    gv: 0,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    ...overrides,
  };
}

function memory(id: string, fact: string, valence: number, atTick = 1): MemoryEntry {
  return {
    id,
    atTick,
    wallClock: "10:00:00",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

function runTicks(start: WorldState, count: number): WorldState {
  let state = start;
  for (let index = 0; index < count; index += 1) {
    state = step(state, { kind: "tick" });
  }
  return state;
}

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** A willing creature: happiness 100 buys willingness above WILLING_AT. */
function willing(id: string, overrides: Partial<CreatureState> = {}): CreatureState {
  return creature(id, {
    stats: { hunger: 80, hygiene: 80, happiness: 100, energy: 80 },
    willingness: 95,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. Sex: dimorphism, the pairing gate, and the freeze ruling
// ---------------------------------------------------------------------------

describe("sex dimorphism", () => {
  it("registers a frozen sex at hatch and dresses the accent slot", () => {
    let state = world();
    state = step(state, { kind: "hatch", creatureId: "sx1", at: { x: 7, y: 7 }, species: "gazerling" });
    const expected = sexFor("sx1", state.seed);
    expect(state.social?.sexes["sx1"]).toBe(expected);
    const hatched = state.creatures["sx1"];
    expect(hatched?.palette).toHaveLength(4);
    expect(hatched?.palette[3]).toBe(accentForSex(expected));

    state = runTicks(state, 10);
    // 判明即冻结: no later tick re-rolls the sex.
    expect(state.social?.sexes["sx1"]).toBe(expected);
  });

  it("never rewrites a registered sex", () => {
    const social = registerSex(emptySocial(), "a", "female");
    expect(registerSex(social, "a", "male").sexes["a"]).toBe("female");
  });

  it("gates the pair on opposite sex, but leaves unsexed creatures pairing", () => {
    const social = {
      ...emptySocial(),
      sexes: { a: "female" as const, b: "female" as const, c: "male" as const },
    };
    expect(pairSexCompatible(social, "a", "b")).toBe(false);
    expect(pairSexCompatible(social, "a", "c")).toBe(true);
    expect(pairSexCompatible(emptySocial(), "a", "b")).toBe(true);
  });

  it("blocks a willing same-sex pair from ever laying", async () => {
    const { courtshipStep } = await import("../src/sim/engine");
    const female = willing("a");
    const partner = willing("b", { position: { x: 3, y: 2 } });
    let state = world({
      creatures: { a: female, b: partner },
      social: { ...emptySocial(), sexes: { a: "female" as const, b: "female" as const } },
    });
    for (let index = 0; index < COURTSHIP_TICKS + 4; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs).toHaveLength(0);
  });

  it("lays an egg for a willing opposite-sex pair, as before", async () => {
    const { courtshipStep } = await import("../src/sim/engine");
    const female = willing("a");
    const male = willing("b", { position: { x: 3, y: 2 } });
    let state = world({
      creatures: { a: female, b: male },
      social: { ...emptySocial(), sexes: { a: "female" as const, b: "male" as const } },
    });
    for (let index = 0; index < COURTSHIP_TICKS + 4; index += 1) {
      state = courtshipStep(step(state, { kind: "tick" }));
    }
    expect(state.eggs.length).toBeGreaterThanOrEqual(1);
    expect(state.eggs.length).toBeLessThanOrEqual(MAX_EGGS);
  });
});

// ---------------------------------------------------------------------------
// 2. Mood dynamics: cause → contagion → decay → behaviour
// ---------------------------------------------------------------------------

describe("mood dynamics", () => {
  it("raises loving on the fed creature, shares it, and gives juveniles the second helping", () => {
    let state = world({
      creatures: {
        t: creature("t"),
        n: creature("n", { position: { x: 8, y: 7 } }),
        j: creature("j", { position: { x: 6, y: 7 }, hatchedAtTick: 0 }),
      },
    });
    state = step(state, { kind: "feed", creatureId: "t" });
    expect(state.social?.moods["t"]).toMatchObject({ mood: "loving", intensity: 0.6 });
    expect(state.social?.moods["n"]).toMatchObject({ mood: "curious", intensity: 0.2 });
    expect(state.social?.moods["j"]).toMatchObject({ mood: "curious", intensity: 0.4 });
    expect(stainAt(state.social ?? emptySocial(), { x: 7, y: 7 })?.kind).toBe("feed");
  });

  it("decays moods tick by tick until they vanish", () => {
    let state = world({ creatures: { t: creature("t") } });
    state = step(state, { kind: "pet", creatureId: "t" });
    expect(state.social?.moods["t"]?.intensity).toBeCloseTo(0.5, 10);
    state = runTicks(state, 17);
    // 0.5 - 17 * 0.03 ≈ 0.01 → gone.
    expect(state.social?.moods["t"]).toBeUndefined();
  });

  it("turns every living creature wrong when the world shifts stage", () => {
    let state = world({ creatures: { a: creature("a"), b: creature("b", { position: { x: 3, y: 3 } }) } });
    state = step(state, { kind: "gv", delta: 30 });
    expect(state.social?.moods["a"]?.mood).toBe("wrong");
    expect(state.social?.moods["b"]?.mood).toBe("wrong");
  });

  it("carries mood across the whisper channel: grief spreads to a second-hand neighbour", () => {
    // w1 sees the corpse; w2 stands two tiles from w1 but out of sight of it.
    let state = world({
      creatures: {
        dead1: creature("dead1", { stats: { hunger: 0, hygiene: 80, happiness: 80, energy: 80 }, position: { x: 7, y: 7 } }),
        w1: creature("w1", { genome: genome("w1", { watchfulness: 0.9 }), position: { x: 8, y: 7 } }),
        w2: creature("w2", { genome: genome("w2", { watchfulness: 0.9 }), position: { x: 4, y: 6 } }),
      },
    });
    state = runTicks(state, 1);
    expect(state.social?.moods["w1"]?.mood).toBe("sad");
    expect(state.social?.moods["w2"]).toBeUndefined();
    state = runTicks(state, 10);
    // The watchers hold their tiles, w1's grief stays above the adopt floor,
    // and w2 catches it second-hand.
    expect(state.social?.moods["w2"]?.mood).toBe("sad");
    expect(state.social?.moods["w2"]?.intensity).toBeGreaterThan(0);
  });

  it("dampens contagion across factions", () => {
    const tenderSlice: MemorySlice = { ...emptySlice(), working: [memory("m1", "the player fed me", 0.8)] };
    const wrongSlice: MemorySlice = { ...emptySlice(), working: [memory("m2", "the player carried me away", -0.8)] };
    let state = world({
      creatures: {
        a: creature("a", { position: { x: 7, y: 7 } }),
        b: creature("b", { position: { x: 9, y: 7 } }),
      },
      memories: { a: tenderSlice, b: wrongSlice },
      social: { ...emptySocial(), moods: { a: { mood: "loving", intensity: 0.8 } } },
    });
    state = runTicks(state, 1);
    const bMood = state.social?.moods["b"];
    // Same-distance same-faction contagion lands at the full rate; across the
    // faction line it lands damped.
    expect(bMood?.mood).toBe("loving");
    expect(bMood?.intensity).toBeCloseTo(0.08 * 0.4, 10);
  });

  it("holds a staring contest instead of syncing when factions meet face to face", () => {
    const tenderSlice: MemorySlice = { ...emptySlice(), working: [memory("m1", "the player fed me", 0.8)] };
    const wrongSlice: MemorySlice = { ...emptySlice(), working: [memory("m2", "the player carried me away", -0.8)] };
    const start = world({
      creatures: {
        a: creature("a", { position: { x: 7, y: 7 } }),
        b: creature("b", { position: { x: 8, y: 7 } }),
      },
      memories: { a: tenderSlice, b: wrongSlice },
      social: { ...emptySocial(), moods: { a: { mood: "loving", intensity: 0.8 } } },
    });
    const end = runTicks(start, 5);
    // Nobody moves, nobody catches anything: the stare is the whole exchange.
    expect(end.creatures["a"]?.position).toEqual(start.creatures["a"]?.position);
    expect(end.creatures["b"]?.position).toEqual(start.creatures["b"]?.position);
    expect(end.social?.moods["b"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Factions: clusters over the belief about the keeper
// ---------------------------------------------------------------------------

describe("factions", () => {
  it("reads the belief about the player from the memory slice", () => {
    const slice: MemorySlice = {
      ...emptySlice(),
      working: [
        memory("m1", "the player fed me", 0.8),
        memory("m2", "the player carried me away", -0.2),
        memory("m3", "gazer_01 died of starvation", -1),
      ],
    };
    // Only player-facing entries count: the death is not about the keeper.
    expect(beliefAboutPlayer(slice)).toBeCloseTo(0.3, 10);
    expect(factionOf(beliefAboutPlayer(slice))).toBe("tender");
    expect(factionOf(-0.5)).toBe("wrong");
    expect(factionOf(0)).toBeNull();
    expect(beliefAboutPlayer(undefined)).toBe(0);
  });

  it("detects cross-faction pairs only when both hold a belief", () => {
    const tender: MemorySlice = { ...emptySlice(), working: [memory("m1", "the player fed me", 0.8)] };
    const wrong: MemorySlice = { ...emptySlice(), working: [memory("m2", "the player carried me away", -0.8)] };
    expect(crossFaction(tender, wrong)).toBe(true);
    expect(crossFaction(tender, tender)).toBe(false);
    expect(crossFaction(tender, emptySlice())).toBe(false);
    expect(crossFaction(undefined, wrong)).toBe(false);
  });

  it("maps factions to the accent parameters proposed to stream C", () => {
    expect(factionAccent("tender", accentForSex("male"))).toBe("#a8d8a0");
    expect(factionAccent("wrong", accentForSex("female"))).toBe("#b46a8a");
    expect(factionAccent(null, accentForSex("female"))).toBe(accentForSex("female"));
  });
});

// ---------------------------------------------------------------------------
// 4. Division of labour: emergent, never dispatched
// ---------------------------------------------------------------------------

describe("division of labour", () => {
  it("a watcher stands guard and never wanders", () => {
    const start = world({
      creatures: { w: creature("w", { genome: genome("w", { watchfulness: 0.9 }) }) },
    });
    const end = runTicks(start, 30);
    expect(end.creatures["w"]?.position).toEqual(start.creatures["w"]?.position);
  });

  it("an echoer closes in on peers and sits inside whisper range", () => {
    const start = world({
      creatures: {
        e: creature("e", { genome: genome("e", { loyalty: 0.9 }), position: { x: 3, y: 7 } }),
        p: creature("p", { genome: genome("p", { watchfulness: 0.9 }), position: { x: 10, y: 7 } }),
      },
    });
    let state = start;
    let closest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 8; index += 1) {
      state = step(state, { kind: "tick" });
      const e = state.creatures["e"];
      const p = state.creatures["p"];
      if (e !== undefined && p !== undefined) {
        closest = Math.min(closest, chebyshev(e.position, p.position));
      }
    }
    expect(closest).toBeLessThanOrEqual(2);
  });

  it("a paranoid creature flees closeness, then lurks and digs at the edge", () => {
    const paranoid = creature("x", {
      genome: genome("x", { deceit: 0.7 }),
      position: { x: 7, y: 7 },
    });
    const peer = creature("p", { position: { x: 8, y: 7 } });
    const social = emptySocial();
    const intent = movementIntent(world({ creatures: { x: paranoid, p: peer } }), social, paranoid, 300);
    expect(intent).toEqual({ kind: "toward", target: { x: 6, y: 7 } });

    // Alone at the edge it lurks, and its hoard deepens tick by tick.
    let state = world({ creatures: { x: creature("x", { genome: genome("x", { deceit: 0.7 }), position: { x: 1, y: 1 } }) } });
    state = runTicks(state, 10);
    const hoard = stainAt(state.social ?? emptySocial(), { x: 1, y: 1 });
    expect(hoard?.kind).toBe("hoard");
    expect(hoard?.intensity).toBeCloseTo(1, 6);
    expect(state.creatures["x"]?.position).toEqual({ x: 1, y: 1 });
  });
});

// ---------------------------------------------------------------------------
// 5. Juvenile care: imitation of the keeper, escort by the adults
// ---------------------------------------------------------------------------

describe("juvenile care", () => {
  it("knows a child when it sees one", () => {
    const baby = creature("b", { hatchedAtTick: 0 });
    expect(isJuvenile(baby, 239)).toBe(true);
    expect(isJuvenile(baby, JUVENILE_TICKS)).toBe(false);
  });

  it("reads the keeper model from the observation window", () => {
    const gentle = [...Array(8)].reduce(
      (learning) => ({
        observations: [
          ...learning.observations,
          { verb: "feed" as const, atTick: 1, hesitationTicks: 4, targetTile: { x: 2, y: 2 } },
        ],
        converged: false,
      }),
      { observations: [], converged: false },
    );
    const hurried = [...Array(8)].reduce(
      (learning) => ({
        observations: [
          ...learning.observations,
          { verb: "move" as const, atTick: 1, hesitationTicks: 0, targetTile: null },
        ],
        converged: false,
      }),
      { observations: [], converged: false },
    );
    expect(careModelFor(gentle).gentleness).toBe(1);
    expect(careModelFor(hurried).gentleness).toBeLessThan(0.35);
    expect(careModelFor(undefined).gentleness).toBe(0.5);
  });

  it("a juvenile shadows the nearest adult", () => {
    const start = world({
      creatures: {
        j: creature("j", { hatchedAtTick: 0, position: { x: 10, y: 10 } }),
        a: creature("a", { genome: genome("a", { watchfulness: 0.9 }), position: { x: 13, y: 10 } }),
      },
    });
    const afterOne = step(start, { kind: "tick" });
    expect(afterOne.creatures["j"]?.position).toEqual({ x: 11, y: 10 });
    expect(afterOne.creatures["a"]?.position).toEqual({ x: 13, y: 10 });
  });

  it("a converged juvenile drifts toward the hand's usual tile", () => {
    let state = world({
      creatures: { j: creature("j", { hatchedAtTick: 0, position: { x: 10, y: 10 } }) },
    });
    for (let index = 0; index < 8; index += 1) {
      state = step(state, {
        kind: "observe",
        verb: "feed",
        targetId: "j",
        targetTile: { x: 3, y: 2 },
        hesitationTicks: 2,
      });
    }
    expect(state.creatures["j"]?.learning?.converged).toBe(true);
    const afterOne = step(state, { kind: "tick" });
    expect(afterOne.creatures["j"]?.position).toEqual({ x: 9, y: 9 });
  });

  it("a gentle adult shepherds a hungry juvenile, its own child first", () => {
    const gentleAdult = creature("a", {
      learning: {
        observations: [...Array(8)].map((_, index) => ({
          verb: "feed" as const,
          atTick: index,
          hesitationTicks: 4,
          targetTile: { x: 7, y: 7 },
        })),
        converged: true,
      },
      position: { x: 7, y: 7 },
    });
    // j2 is hungrier and listed first; the adult's own child still wins.
    const j2 = creature("j2", { hatchedAtTick: 0, stats: { hunger: 5, hygiene: 80, happiness: 80, energy: 80 }, position: { x: 5, y: 7 } });
    const j1 = creature("j1", { hatchedAtTick: 0, stats: { hunger: 25, hygiene: 80, happiness: 80, energy: 80 }, position: { x: 9, y: 7 } });
    const state = world({
      creatures: { j2, a: { ...gentleAdult, parentLinks: { parentA: "j1" } }, j1 },
    });
    const intent = movementIntent(state, state.social ?? emptySocial(), state.creatures["a"] as CreatureState, 1);
    expect(intent).toEqual({ kind: "toward", target: { x: 9, y: 7 } });
  });

  it("a starving adult or a hurried keeper model shepherds nobody", () => {
    const hurriedAdult = creature("a", {
      learning: {
        observations: [...Array(8)].map((_, index) => ({
          verb: "move" as const,
          atTick: index,
          hesitationTicks: 0,
          targetTile: null,
        })),
        converged: false,
      },
      position: { x: 7, y: 7 },
    });
    const juvenile = creature("j", {
      hatchedAtTick: 0,
      stats: { hunger: 10, hygiene: 80, happiness: 80, energy: 80 },
      position: { x: 8, y: 7 },
    });
    const hurriedState = world({ creatures: { a: hurriedAdult, j: juvenile } });
    expect(
      movementIntent(hurriedState, emptySocial(), hurriedAdult, 1),
    ).toBeNull();

    const starvingAdult = creature("s", {
      behavior: "hungry",
      stats: { hunger: 10, hygiene: 80, happiness: 80, energy: 80 },
      learning: {
        observations: [...Array(8)].map((_, index) => ({
          verb: "feed" as const,
          atTick: index,
          hesitationTicks: 4,
          targetTile: { x: 7, y: 7 },
        })),
        converged: false,
      },
    });
    const starvingState = world({ creatures: { s: starvingAdult, j: juvenile } });
    expect(
      movementIntent(starvingState, emptySocial(), starvingAdult, 1),
    ).toBeNull();
  });

  it("pins the mirrored constants against the engine's frozen values", () => {
    expect(SOCIAL_GRID_MIN).toBe(GRID_MIN);
    expect(SOCIAL_GRID_MAX).toBe(GRID_MAX);
    expect(SOCIAL_HUNGRY_AT).toBe(HUNGRY_AT);
  });
});

// ---------------------------------------------------------------------------
// 6. Mourning: the circle is a function of memory
// ---------------------------------------------------------------------------

describe("mourning", () => {
  function mourningWorld(): WorldState {
    // Twelve memories about the deceased: the circle lasts twelve ticks, long
    // enough for a distant mourner to walk in and hold the ring.
    const deadMemories = [...Array(12)].map((_, index) =>
      memory(`m${index}`, "dead1 died of starvation at tick 1", -1, index),
    );
    return world({
      creatures: {
        dead1: creature("dead1", {
          stats: { hunger: 0, hygiene: 80, happiness: 80, energy: 80 },
          position: { x: 7, y: 7 },
        }),
        w: creature("w", { position: { x: 8, y: 7 } }),
        m: creature("m", { position: { x: 13, y: 13 } }),
        s: creature("s", { position: { x: 13, y: 7 } }),
      },
      memories: { m: { ...emptySlice(), working: deadMemories } },
    });
  }

  it("forms a circle from witnesses and memory holders, never from strangers", () => {
    const state = runTicks(mourningWorld(), 1);
    const circle = state.social?.mourning[0];
    expect(circle).toBeDefined();
    expect(circle?.corpseId).toBe("dead1");
    expect(circle?.participants).toEqual(["m", "w"]);
    // Twelve memories about the deceased across the circle: twelve ticks of grief.
    expect(circle?.duration).toBe(12);
    // The corpse tile keeps its permanent stain.
    expect(stainAt(state.social ?? emptySocial(), { x: 7, y: 7 })).toMatchObject({
      kind: "mourning",
      intensity: 1,
    });
    // Grief pins every participant.
    expect(state.social?.moods["w"]?.mood).toBe("sad");
    expect(state.social?.moods["m"]?.mood).toBe("sad");
  });

  it("gathers the participants into a ring and holds them in silence", () => {
    const state = runTicks(mourningWorld(), 9);
    const circle = state.social?.mourning[0];
    expect(circle).toBeDefined();
    const slotM = ringSlotFor(circle?.at ?? { x: 7, y: 7 }, 0);
    const slotW = ringSlotFor(circle?.at ?? { x: 7, y: 7 }, 1);
    expect(state.creatures["m"]?.position).toEqual(slotM);
    expect(state.creatures["w"]?.position).toEqual(slotW);
    const still = runTicks(state, 3);
    // Silence: the ring does not move while the circle is active.
    expect(still.creatures["m"]?.position).toEqual(slotM);
    expect(still.creatures["w"]?.position).toEqual(slotW);
  });

  it("expires after the counted duration and lets grief decay", () => {
    let state = runTicks(mourningWorld(), 8);
    expect(state.social?.mourning).toHaveLength(1);
    // started at tick 1, duration 12 → expired from tick 13 on.
    state = runTicks(state, 5);
    expect(state.social?.mourning).toHaveLength(0);
    expect(activeMourningFor(state.social ?? emptySocial(), "w", state.tick)).toBeUndefined();
    const later = runTicks(state, 20);
    // Off the pin, the mourners' sadness fades: witnesses took 0.9 at the
    // death, the pin held them at ≥0.8, and 20 ticks of decay leave ≈0.27.
    expect(later.social?.moods["w"]?.intensity).toBeLessThan(0.3);
  });

  it("counts memories about the deceased across both layers", () => {
    const slice: MemorySlice = {
      working: [
        memory("a", "dead1 died of starvation", -1),
        memory("b", "the player fed me", 0.8),
        { ...memory("c", "dead1 was kind once", 0.2), source: "dead1" },
      ],
      consolidated: [
        {
          id: "cons_001",
          content: "dead1 died and we stood still",
          derivedFrom: ["a"],
          consolidatedAt: "tick_5",
          perspectiveNote: null,
        },
      ],
    };
    expect(memoriesAbout(slice, "dead1")).toBe(3);
    expect(memoriesAbout(undefined, "dead1")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Terrain traces: the world remembers, the sponge only fades
// ---------------------------------------------------------------------------

describe("terrain traces", () => {
  it("wear accumulates where creatures stand", () => {
    const start = world({
      creatures: { w: creature("w", { genome: genome("w", { watchfulness: 0.9 }) }) },
    });
    const state = runTicks(start, 30);
    const wear = stainAt(state.social ?? emptySocial(), { x: 7, y: 7 });
    expect(wear?.kind).toBe("wear");
    expect(wear?.intensity).toBeCloseTo(0.3, 10);
  });

  it("cleaning fades a stain to its floor and never removes it", () => {
    let social = emptySocial();
    social = addStain(social, { x: 7, y: 7 }, "feed", 0.4, 1);
    social = addStain(social, { x: 7, y: 7 }, "feed", 0.4, 2);
    expect(stainAt(social, { x: 7, y: 7 })?.intensity).toBeCloseTo(0.8, 10);
    for (let index = 0; index < 20; index += 1) {
      social = fadeStainsAt(social, { x: 7, y: 7 }, index);
    }
    const faded = stainAt(social, { x: 7, y: 7 });
    expect(faded).toBeDefined();
    expect(faded?.intensity).toBeCloseTo(0.15, 10);
  });

  it("a mourning stain never fades at all", () => {
    let social = addStain(emptySocial(), { x: 7, y: 7 }, "mourning", 1, 1);
    for (let index = 0; index < 20; index += 1) {
      social = fadeStainsAt(social, { x: 7, y: 7 }, index);
    }
    expect(stainAt(social, { x: 7, y: 7 })?.intensity).toBe(1);
  });

  it("a stronger trace keeps its tile against a weaker one", () => {
    let social = addStain(emptySocial(), { x: 7, y: 7 }, "mourning", 1, 1);
    social = addStain(social, { x: 7, y: 7 }, "feed", 0.4, 2);
    social = addStain(social, { x: 7, y: 7 }, "wear", 0.1, 3);
    expect(stainAt(social, { x: 7, y: 7 })?.kind).toBe("mourning");
    // A deeper trace may still claim an empty tile.
    let feedTile = addStain(emptySocial(), { x: 5, y: 5 }, "wear", 0.1, 1);
    feedTile = addStain(feedTile, { x: 5, y: 5 }, "feed", 0.4, 2);
    expect(stainAt(feedTile, { x: 5, y: 5 })?.kind).toBe("feed");
  });

  it("keys stains by tile", () => {
    expect(stainKey({ x: 3, y: 4 })).toBe("3,4");
  });
});

// ---------------------------------------------------------------------------
// 8. Wiring seams
// ---------------------------------------------------------------------------

describe("wiring seams", () => {
  it("cross-faction whispers keep less of themselves in the gossip seam", () => {
    const sender = creature("sender", { position: { x: 7, y: 7 } });
    const receiver = creature("receiver", {
      genome: genome("receiver", {}),
      position: { x: 8, y: 7 },
    });
    const entry = memory("mem_1", "the player fed sender after hesitating", 0.8);
    const base = { sender, receiver, entry };
    // Find a seed where the base roll falls inside the penalty band, so the
    // two calls provably differ; the search itself is deterministic.
    let found: number | null = null;
    for (let seed = 0; seed < 500; seed += 1) {
      const plain = resolveWhisper({ ...base, worldSeed: seed });
      const crossed = resolveWhisper({ ...base, worldSeed: seed, crossFaction: true });
      if (
        plain?.witnessed === "heard" &&
        crossed !== null &&
        crossed.witnessed === "witnessed" &&
        crossed.distortion !== null
      ) {
        found = seed;
        break;
      }
    }
    expect(found).not.toBeNull();
  });

  it("replays the same social history for the same event sequence", () => {
    const run = (): WorldState => {
      let state = world({
        creatures: {
          a: creature("a", { genome: genome("a", { watchfulness: 0.9 }), position: { x: 7, y: 7 } }),
          b: creature("b", { genome: genome("b", { loyalty: 0.9 }), position: { x: 9, y: 7 } }),
          c: creature("c", { hatchedAtTick: 0, position: { x: 5, y: 5 } }),
        },
        memories: {
          a: { ...emptySlice(), working: [memory("m1", "the player fed me", 0.8)] },
        },
      });
      state = runTicks(state, 5);
      state = step(state, { kind: "feed", creatureId: "a" });
      state = runTicks(state, 5);
      state = step(state, { kind: "clean", creatureId: "a" });
      state = step(state, { kind: "gv", delta: 25 });
      state = runTicks(state, 5);
      return state;
    };
    expect(run()).toEqual(run());
  });

  it("never mutates the input state while socialising", () => {
    const start = world({
      creatures: {
        a: creature("a"),
        dead1: creature("dead1", {
          stats: { hunger: 0, hygiene: 80, happiness: 80, energy: 80 },
          position: { x: 8, y: 8 },
        }),
      },
    });
    const frozen = JSON.stringify(start);
    step(start, { kind: "tick" });
    expect(JSON.stringify(start)).toBe(frozen);
  });

  it("keeps the willingness contract untouched for unsexed creatures", () => {
    const a = willing("a");
    const b = creature("b", {
      stats: { hunger: 80, hygiene: 80, happiness: 0, energy: 80 },
      willingness: 20,
    });
    // pairWillingness itself stays the min rule; only courtshipStep gained the gate.
    expect(Math.min(a.willingness, b.willingness)).toBe(20);
    expect(WILLING_AT).toBe(60);
  });
});
