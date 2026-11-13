/**
 * Ticket 0051 — the ghost profile + divergence pure layer.
 *
 * CI (ticket §交付形状 4):
 *   - anonymize: a profile carries no raw logs — only the traits snapshot,
 *     the one sanctioned signature-moment face, and kept-memory references;
 *   - slot skeletons stay byte-exact: filling only swaps the runtime slots;
 *   - the divergence d% double-runs identically (deterministic);
 *   - the recording header's {n} ≥ 3 gate.
 *
 * Plus: signature-moment selection, the ghost archive shape, and the {id}
 * slot resolution (highest death-account weight, small-id ties).
 */

import { describe, expect, it } from "vitest";
import { CANON_REGISTRY } from "../src/canon";
import { DEFAULT_MASK } from "../src/sim/engine";
import type { CreatureState, CreatureId, WorldState } from "../src/sim/types";
import type { GenomeTraits } from "../src/sim/genome";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import { emptySlice } from "../src/sim/memory";
import {
  MIN_KEPT_MEMORIES,
  buildGhostArchive,
  buildGhostProfile,
  deathAccountWeight,
  fillGhostTemplate,
  fillNgpOpening,
  ghostBlendRatio,
  keptMemoriesSufficient,
  keptMemoryCount,
  resolveDramaticId,
} from "../src/sim/ghosts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_TRAITS: GenomeTraits = {
  curiosity: 0.5,
  loyalty: 0.5,
  deceit: 0.1,
  clinging: 0.5,
  watchfulness: 0.5,
};

function creature(id: CreatureId, traits: Partial<GenomeTraits> = {}, behavior: CreatureState["behavior"] = "idle", hunger = 70): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger, hygiene: 70, happiness: 70, energy: 70 },
    behavior,
    trait: null,
    position: { x: 4, y: 5 },
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: DEFAULT_MASK,
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 1,
      lineage: ["seed_alpha"],
      base: "you are a small one-eyed creature being raised through a window",
      traits: { ...BASE_TRAITS, ...traits },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias: 0,
    },
  };
}

function memory(id: string, fact: string, salience: number, atTick: number, valence = 0): MemoryEntry {
  return {
    id,
    atTick,
    wallClock: "23:59:59",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience,
    valence,
  };
}

function world(creatures: readonly CreatureState[], slices: Readonly<Record<CreatureId, MemorySlice>> = {}): WorldState {
  const map: Record<CreatureId, CreatureState> = {};
  for (const entry of creatures) {
    map[entry.id] = entry;
  }
  return {
    tick: 900,
    gv: 100,
    stage: 4,
    creatures: map,
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: false,
    memories: slices,
  };
}

// ---------------------------------------------------------------------------
// Ghost profile construction + the anonymize red line
// ---------------------------------------------------------------------------

describe("buildGhostProfile — the anonymize red line", () => {
  const dead = creature("gazer_02", { watchfulness: 0.9 }, "dead");
  const slice: MemorySlice = {
    working: [
      memory("mem_a", "the player fed gazer_02 after hesitating 2.3 seconds", 0.5, 100),
      memory("mem_b", "the player stared into gazer_02's pupil for three seconds", 0.9, 200),
      memory("mem_c", "gazer_02 watched the corner all night", 0.8, 300),
    ],
    consolidated: [],
  };

  it("keeps the traits snapshot, the signature reference, and kept ids only", () => {
    const profile = buildGhostProfile(dead, slice);
    expect(profile).not.toBeNull();
    expect(profile?.id).toBe("gazer_02");
    expect(profile?.traits).toEqual({ ...BASE_TRAITS, watchfulness: 0.9 });
    expect(profile?.signatureMomentId).toBe("mem_b");
    expect(profile?.signatureMoment).toBe("the player stared into gazer_02's pupil for three seconds");
    expect(profile?.keptMemoryIds).toEqual(["mem_a", "mem_b", "mem_c"]);
  });

  it("carries no raw logs: no payload fields, no non-signature facts", () => {
    const profile = buildGhostProfile(dead, slice) as GhostProfileShape;
    const serialized = JSON.stringify(profile);
    // No memory payload faces.
    expect(serialized).not.toContain("salience");
    expect(serialized).not.toContain("valence");
    expect(serialized).not.toContain("wallClock");
    expect(serialized).not.toContain("witnessed");
    // The other memories' facts never leave the memory layer.
    expect(serialized).not.toContain("fed gazer_02 after hesitating");
    expect(serialized).not.toContain("watched the corner all night");
    // Not a MemoryEntry shape: no fact/atTick faces at all.
    expect(profile).not.toHaveProperty("fact");
    expect(profile).not.toHaveProperty("atTick");
  });

  it("snapshots the traits — mutating the source genome never leaks in", () => {
    const mutable = creature("gazer_03", {}, "dead");
    const profile = buildGhostProfile(mutable, slice);
    // 冻结面测试需要可变源:断言面把 readonly 脱掉,只在本测试内改写。
    const mutableGenome = mutable.genome as { traits: { watchfulness: number } };
    mutableGenome.traits.watchfulness = 99;
    expect(profile?.traits.watchfulness).toBe(BASE_TRAITS.watchfulness);
  });

  it("prefers keeper-mentioning memories, then salience, then recency, then id", () => {
    // Only mem_c mentions no keeper, so the keeper faces rank first.
    expect(buildGhostProfile(dead, slice)?.signatureMomentId).toBe("mem_b");
    const salienceTie: MemorySlice = {
      working: [
        memory("mem_old", "the keeper arrived late", 0.7, 100),
        memory("mem_new", "the keeper left the window open", 0.7, 200),
        memory("mem_dup", "the keeper left the window open", 0.7, 200),
      ],
      consolidated: [],
    };
    expect(buildGhostProfile(dead, salienceTie)?.signatureMomentId).toBe("mem_dup");
  });

  it("falls back to consolidated self-knowledge when the working set is empty", () => {
    const consolidatedOnly: MemorySlice = {
      working: [],
      consolidated: [
        { id: "con_a", content: "the hand always came back", derivedFrom: [], consolidatedAt: "12:00", perspectiveNote: null },
      ],
    };
    const profile = buildGhostProfile(dead, consolidatedOnly);
    expect(profile?.signatureMomentId).toBe("con_a");
    expect(profile?.signatureMoment).toBe("the hand always came back");
  });

  it("refuses a ghost with no memory at all (nothing to reconstruct from)", () => {
    expect(buildGhostProfile(dead, emptySlice())).toBeNull();
    expect(buildGhostProfile(dead, undefined)).toBeNull();
  });

  it("falls back to a zero traits snapshot for a soul-less creature", () => {
    // exactOptionalPropertyTypes:去掉 genome 键本身,而不是显式 undefined。
    const { genome: _soul, ...soulless } = dead;
    const profile = buildGhostProfile(soulless, slice);
    expect(profile?.traits).toEqual({
      curiosity: 0,
      loyalty: 0,
      deceit: 0,
      clinging: 0,
      watchfulness: 0,
    });
  });
});

type GhostProfileShape = NonNullable<ReturnType<typeof buildGhostProfile>>;

// ---------------------------------------------------------------------------
// The ghost archive — the NG+ save face
// ---------------------------------------------------------------------------

describe("buildGhostArchive — the save-carried ghosts array", () => {
  it("collects one profile per dead creature with memories, in id order", () => {
    const w = world(
      [
        creature("gazer_01", {}, "dead"),
        creature("gazer_02", {}, "idle"),
        creature("gazer_03", {}, "dead"),
        creature("gazer_04", {}, "dead"),
      ],
      {
        gazer_01: { working: [memory("m1", "the keeper came back", 0.5, 10)], consolidated: [] },
        gazer_03: { working: [memory("m3", "the keeper fed us slowly", 0.6, 20)], consolidated: [] },
        // gazer_04 holds no memory: no profile, the archive skips it.
      },
    );
    const archive = buildGhostArchive(w);
    expect(archive.map((profile) => profile.id)).toEqual(["gazer_01", "gazer_03"]);
    // The shape drops straight into WorldState.ghosts.
    const withGhosts: WorldState = { ...w, ghosts: archive };
    expect(withGhosts.ghosts).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Divergence — deterministic d%
// ---------------------------------------------------------------------------

describe("ghostBlendRatio — the divergence d%", () => {
  const profileOf = (id: string, traits: Partial<GenomeTraits>): GhostProfileShape =>
    buildGhostProfile(creature(id, traits, "dead"), {
      working: [memory(`m_${id}`, "the keeper came back", 0.5, 10)],
      consolidated: [],
    }) as GhostProfileShape;

  it("blends nothing below two ghosts and reads 0% for identical souls", () => {
    expect(ghostBlendRatio([])).toBe(0);
    expect(ghostBlendRatio([profileOf("a", { loyalty: 0.9 })])).toBe(0);
    const twin = profileOf("a", { loyalty: 0.9 });
    expect(ghostBlendRatio([twin, { ...twin, id: "b" }])).toBe(0);
  });

  it("derives the mean trait spread as an integer percent", () => {
    // Spread: loyalty 0.9-0.1=0.8, deceit 0.5-0=0.5, others 0 → mean 1.3/5 = 0.26 → 26%.
    const a = profileOf("a", { loyalty: 0.9, deceit: 0.5 });
    const b = profileOf("b", { loyalty: 0.1, deceit: 0 });
    expect(ghostBlendRatio([a, b])).toBe(26);
  });

  it("double-runs byte for byte and ignores archive order", () => {
    const a = profileOf("a", { watchfulness: 1 });
    const b = profileOf("b", { watchfulness: 0.2, curiosity: 0.8 });
    const first = ghostBlendRatio([a, b]);
    expect(ghostBlendRatio([a, b])).toBe(first);
    expect(ghostBlendRatio([b, a])).toBe(first);
    expect(Number.isInteger(first)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The recording header's {n} face
// ---------------------------------------------------------------------------

describe("keptMemoryCount — the {n} ≥ 3 gate", () => {
  const profileOf = (id: string, kept: number): GhostProfileShape =>
    buildGhostProfile(
      creature(id, {}, "dead"),
      {
        working: Array.from({ length: kept }, (_, i) => memory(`m_${id}_${i}`, "the keeper came back", 0.5, i)),
        consolidated: [],
      },
    ) as GhostProfileShape;

  it("counts the kept references across the archive", () => {
    expect(MIN_KEPT_MEMORIES).toBe(3);
    expect(keptMemoryCount([])).toBe(0);
    expect(keptMemoryCount([profileOf("a", 2), profileOf("b", 3)])).toBe(5);
  });

  it("gates the reconstruction at three kept memories", () => {
    expect(keptMemoriesSufficient([profileOf("a", 1), profileOf("b", 1)])).toBe(false);
    expect(keptMemoriesSufficient([profileOf("a", 2), profileOf("b", 1)])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slot filling — byte-exact skeletons (N8)
// ---------------------------------------------------------------------------

describe("fillGhostTemplate / fillNgpOpening — the frozen skeletons", () => {
  const profile: GhostProfileShape = {
    id: "gazer_07",
    traits: BASE_TRAITS,
    signatureMomentId: "mem_b",
    signatureMoment: "kept the window open through the storm",
    keptMemoryIds: ["mem_b"],
  };

  it("fills only the two runtime slots, byte for byte", () => {
    const skeleton = CANON_REGISTRY["special.ghost_template"]?.text ?? "";
    const filled = fillGhostTemplate(profile);
    expect(filled).toBe(
      skeleton
        .replace("{ghost_name}", "gazer_07")
        .replace("{ghost_signature_moment}", "kept the window open through the storm"),
    );
    expect(filled).toBe(
      "Before us, someone fed us. They called themselves gazer_07. They once kept the window open through the storm.",
    );
    // The skeleton's own words are untouched: substituting the tokens back
    // over the slot faces recovers the frozen text exactly.
    const recovered = (filled ?? "")
      .replace("gazer_07", "{ghost_name}")
      .replace("kept the window open through the storm", "{ghost_signature_moment}");
    expect(recovered).toBe(skeleton);
  });

  it("fills the NG+ opening's {id} slot with the dramatic creature", () => {
    const skeleton = CANON_REGISTRY["special.ngp_opening"]?.text ?? "";
    expect(fillNgpOpening("gazer_02")).toBe(skeleton.replace("{id}", "gazer_02"));
    expect(fillNgpOpening("gazer_02")).toBe(
      "You came back. gazer_02 still asks about you. We kept its spot empty.",
    );
  });
});

// ---------------------------------------------------------------------------
// The {id} slot — the save's most dramatic creature
// ---------------------------------------------------------------------------

describe("resolveDramaticId — the death account", () => {
  it("weighs the death cause and the witness memories, ties toward the smaller id", () => {
    const gazer_01 = creature("gazer_01", {}, "dead", 40); // neglect: weight 1
    const gazer_02 = creature("gazer_02", {}, "dead", 0); // starvation: weight 2
    const witness = creature("gazer_03");
    const w = world([gazer_01, gazer_02, witness], {
      gazer_03: {
        working: [memory("w1", "gazer_01 died of neglect at tick 500", 0.9, 500)],
        consolidated: [],
      },
    });
    // gazer_01: 1 + 1 witness = 2; gazer_02: 2 + 0 = 2 → tie, smaller id wins.
    expect(deathAccountWeight(w, gazer_01)).toBe(2);
    expect(deathAccountWeight(w, gazer_02)).toBe(2);
    expect(deathAccountWeight(w, witness)).toBe(0);
    expect(resolveDramaticId(w)).toBe("gazer_01");
  });

  it("lets the heavier account win, and answers null for a deathless save", () => {
    const gazer_01 = creature("gazer_01", {}, "dead", 0); // starvation: 2
    const gazer_02 = creature("gazer_02", {}, "dead", 40); // neglect: 1 + 2 witnesses = 3
    const witness = creature("gazer_03");
    const w = world([gazer_01, gazer_02, witness], {
      gazer_03: {
        working: [
          memory("w1", "gazer_02 died of neglect at tick 500", 0.9, 500),
          memory("w2", "gazer_02 died of neglect at tick 500", 0.5, 501),
        ],
        consolidated: [],
      },
    });
    expect(resolveDramaticId(w)).toBe("gazer_02");
    expect(resolveDramaticId(world([creature("gazer_01")]))).toBeNull();
  });

  it("deterministically re-derives the same id on the same save", () => {
    const gazer_01 = creature("gazer_01", {}, "dead", 0);
    const gazer_02 = creature("gazer_02", {}, "dead", 0);
    const w = world([gazer_01, gazer_02]);
    const first = resolveDramaticId(w);
    expect(first).toBe("gazer_01"); // equal weights → smaller id
    expect(resolveDramaticId(w)).toBe(first);
  });
});
