// 0065 / T3 — NG+ / true-ending recording chain wiring tests.
// Pure helpers only: no DOM, no createGame, no LLM. The in-memory StorageLike
// stands in for localStorage so the 0064 persistence seam is exercised too.
import { describe, expect, it } from "vitest";
import type { CreatureState, WorldState } from "../src/sim/types";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import { emptySlice } from "../src/sim/memory";
import type { GhostProfile } from "../src/sim/ghosts";
import {
  GHOST_OPT_OUT_STORAGE_KEY,
  GHOST_OPT_OUT_URL_PARAM,
  appendGhostProfiles,
  isGhostArchiveOptedOut,
  resolveDramaticId,
} from "../src/sim/ghosts";
import type { SaveStorage } from "../src/sim/save";
import { loadWorld, saveWorld, WORLD_SAVE_KEY } from "../src/sim/save";
import {
  FRAGMENT_KEYS,
  buildRecordingSequence,
  nextRecordingState,
  ngpOpeningFor,
} from "../src/game";
import { canonLine } from "../src/canon";
import { isGazeTower } from "../src/sim/endings";

class MemoryStorage implements SaveStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const TRAITS = {
  curiosity: 0.5,
  loyalty: 0.4,
  deceit: 0.1,
  clinging: 0.3,
  watchfulness: 0.6,
};

function makeCreature(id: string, behavior: CreatureState["behavior"] = "idle"): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
    behavior,
    trait: null,
    position: { x: 4, y: 5 },
    palette: ["#7ED957", "#B8F0A8"],
    mask: ["........", "...##..."],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
    genome: {
      id,
      generation: 1,
      lineage: ["seed_alpha"],
      base: "a small one-eyed creature being raised through a window",
      traits: { ...TRAITS },
      drift: [],
      secrets: [],
      manualPool: [],
      temperatureBias: 0,
      distortionBias: 0,
    },
  };
}

function entry(id: string, fact: string): MemoryEntry {
  return {
    id,
    atTick: 10,
    wallClock: "12:00:00",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence: 0,
  };
}

function sliceOf(id: string): MemorySlice {
  return {
    working: [
      entry(id + ":m1", "the player fed " + id),
      entry(id + ":m2", "the keeper came back for " + id),
      entry(id + ":m3", id + " watched the corner all night"),
    ],
    consolidated: [],
  };
}

function makeWorld(overrides: Partial<WorldState> = {}): WorldState {
  return {
    tick: 120,
    gv: 100,
    stage: 4,
    creatures: {
      gazer_01: makeCreature("gazer_01"),
      gazer_02: makeCreature("gazer_02"),
      gazer_03: makeCreature("gazer_03"),
    },
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    ...overrides,
  };
}

function profile(id: string): GhostProfile {
  return {
    id,
    traits: { ...TRAITS },
    signatureMomentId: id + ":sig",
    signatureMoment: "the player fed " + id + " slowly",
    keptMemoryIds: [id + ":m1", id + ":m2", id + ":m3"],
  };
}

// ---------------------------------------------------------------------------
// ① zero-death gaze: the recording is not hard-refused by the {n}>=3 gate
// ---------------------------------------------------------------------------

describe("0065 zero-death gaze -> non-empty recording sequence", () => {
  it("8/8 glyphsRead with an empty archive still yields a valid degraded sequence", () => {
    expect(isGazeTower(FRAGMENT_KEYS)).toBe(true);
    const sequence = buildRecordingSequence({
      ngPlus: false,
      archive: [],
      glyphsRead: FRAGMENT_KEYS,
    });
    expect(sequence.ok).toBe(true);
    expect(sequence.cues.length).toBeGreaterThan(0);
    expect(sequence.log.length).toBeGreaterThan(0);
    expect(sequence.totalMs).toBeGreaterThan(0);
    expect(sequence.fx.freezeMs).toBe(sequence.totalMs);
    // Degraded faces are honest: n=0, d=0, no fabricated ghost line.
    const header = sequence.cues[0]?.text ?? "";
    expect(header.endsWith(" and 0 kept memories")).toBe(true);
    const tail = sequence.cues[sequence.cues.length - 1]?.text ?? "";
    expect(tail).toContain("divergence: 0%");
    expect(sequence.log.filter((item) => item.source === "ghost")).toEqual([]);
    // All canon lines are still byte-exact frozen text.
    expect(sequence.cues.some((cue) => cue.text === canonLine("recording.keep_you"))).toBe(true);
  });

  it("the strict {n}>=3 gate is preserved when glyphsRead is absent", () => {
    const refused = buildRecordingSequence({ ngPlus: false, archive: [] });
    expect(refused.ok).toBe(false);
    expect(refused.cues).toEqual([]);
    expect(refused.totalMs).toBe(0);
  });

  it("a partial read set (5/8) does not unlock the degraded path", () => {
    const partial = FRAGMENT_KEYS.slice(0, 5);
    const refused = buildRecordingSequence({ ngPlus: false, archive: [], glyphsRead: partial });
    expect(refused.ok).toBe(false);
  });

  it("a sufficient archive still takes the full path (unchanged cue order)", () => {
    const archive = [profile("gazer_01"), profile("gazer_02")];
    const sequence = buildRecordingSequence({ ngPlus: false, archive });
    expect(sequence.ok).toBe(true);
    expect(sequence.cues.length).toBeGreaterThan(3);
  });

  it("refused -> retryable: the latch only arms fired on a successful sequence", () => {
    expect(nextRecordingState(false, false)).toEqual({ fired: false, pending: true });
    expect(nextRecordingState(false, true)).toEqual({ fired: true, pending: false });
    expect(nextRecordingState(true, false)).toEqual({ fired: true, pending: false });
    // The same inputs that once refused now succeed once the 8th glyph is read.
    const before = buildRecordingSequence({ ngPlus: false, archive: [] });
    const after = buildRecordingSequence({ ngPlus: false, archive: [], glyphsRead: FRAGMENT_KEYS });
    expect(before.ok).toBe(false);
    expect(after.ok).toBe(true);
    expect(nextRecordingState(false, after.ok).fired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ④ NG+ opening reads the persistent archive / resolves {id}
// ---------------------------------------------------------------------------

describe("0065 NG+ opening resolves {id} from the persistent world", () => {
  it("a deathless 8/8 gaze run still produces an opening with a real id", () => {
    const w = makeWorld({ glyphsRead: FRAGMENT_KEYS, ending: { kind: "gaze", atTick: 120 } });
    const opening = ngpOpeningFor(w, true, false);
    expect(opening).not.toBeNull();
    expect(opening?.ghostId).toBe("gazer_01");
    expect(opening?.text).toContain("gazer_01");
    expect(opening?.text).not.toContain("{id}");
    expect(opening?.text).toBe(canonLine("special.ngp_opening")?.replace("{id}", "gazer_01"));
  });

  it("the carried ghost archive is the NG+ face when no dead body remains", () => {
    const w = makeWorld({ ghosts: [profile("gazer_07")] });
    expect(resolveDramaticId(w)).toBe("gazer_07");
    const opening = ngpOpeningFor(w, true, false);
    expect(opening?.ghostId).toBe("gazer_07");
    expect(opening?.text).toContain("gazer_07");
  });

  it("a death-account dead creature still wins over the carried archive", () => {
    const w = makeWorld({
      creatures: {
        gazer_01: makeCreature("gazer_01", "dead"),
        gazer_02: makeCreature("gazer_02"),
      },
      ghosts: [profile("gazer_07")],
    });
    expect(resolveDramaticId(w)).toBe("gazer_01");
    expect(ngpOpeningFor(w, true, false)?.ghostId).toBe("gazer_01");
  });

  it("no NG+, no gaze and no ghosts -> no fabricated opening", () => {
    expect(ngpOpeningFor(makeWorld(), false, false)).toBeNull();
    expect(ngpOpeningFor(makeWorld(), true, false)).toBeNull();
    expect(resolveDramaticId(makeWorld())).toBeNull();
  });

  it("opt-out suppresses the NG+ opening entirely", () => {
    const w = makeWorld({ glyphsRead: FRAGMENT_KEYS, ghosts: [profile("gazer_07")] });
    expect(ngpOpeningFor(w, true, true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ⑤ opt-out + anonymized archive (portraits only, no raw logs)
// ---------------------------------------------------------------------------

describe("0065 ghost-archive opt-out", () => {
  it("honours the option / URL / storage signals, defaults to on", () => {
    expect(isGhostArchiveOptedOut({})).toBe(false);
    expect(isGhostArchiveOptedOut({ option: true })).toBe(true);
    expect(isGhostArchiveOptedOut({ urlFlag: "off" })).toBe(true);
    expect(isGhostArchiveOptedOut({ storageFlag: "1" })).toBe(true);
    expect(isGhostArchiveOptedOut({ urlFlag: "on", storageFlag: "0" })).toBe(false);
    expect(GHOST_OPT_OUT_STORAGE_KEY).toBeTypeOf("string");
    expect(GHOST_OPT_OUT_URL_PARAM).toBe("ghosts");
  });

  it("appends one anonymized profile per newly dead creature, idempotently", () => {
    const dead = makeCreature("gazer_02", "dead");
    const w = makeWorld({
      creatures: { ...makeWorld().creatures, gazer_02: dead },
    });
    const slices = { gazer_02: sliceOf("gazer_02") };
    const withGhosts = appendGhostProfiles(w, slices, false);
    expect(withGhosts.ghosts).toHaveLength(1);
    expect(withGhosts.ghosts?.[0]?.id).toBe("gazer_02");
    // Idempotent: a second death pass does not duplicate the carried face.
    expect(appendGhostProfiles(withGhosts, slices, false).ghosts).toHaveLength(1);
  });

  it("the persisted face carries no raw logs (red line 5)", () => {
    const dead = makeCreature("gazer_02", "dead");
    const w = makeWorld({ creatures: { ...makeWorld().creatures, gazer_02: dead } });
    const withGhosts = appendGhostProfiles(w, { gazer_02: sliceOf("gazer_02") }, false);
    const serialized = JSON.stringify(withGhosts.ghosts);
    for (const face of ["salience", "valence", "wallClock", "witnessed", "atTick", "fact"]) {
      expect(serialized).not.toContain(face);
    }
    // Only ids + the single sanctioned signature-moment face survive.
    expect(serialized).toContain("keptMemoryIds");
    expect(serialized).toContain("signatureMoment");
  });

  it("opt-out writes no profile and reports nothing", () => {
    const dead = makeCreature("gazer_02", "dead");
    const w = makeWorld({ creatures: { ...makeWorld().creatures, gazer_02: dead } });
    const opted = appendGhostProfiles(w, { gazer_02: sliceOf("gazer_02") }, true);
    expect(opted.ghosts).toBeUndefined();
    expect(opted).toBe(w);
    // An already-carried archive is not extended under opt-out.
    const carried = makeWorld({ ghosts: [profile("gazer_07")] });
    expect(appendGhostProfiles(carried, { gazer_02: sliceOf("gazer_02") }, true).ghosts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ① + ④ persistence seam: 0064 save carries ghosts + glyphsRead into NG+
// ---------------------------------------------------------------------------

describe("0065 ghosts survive the 0064 world save", () => {
  it("saveWorld -> loadWorld round-trips ghosts and glyphsRead for a new session", () => {
    const storage = new MemoryStorage();
    const archive = [profile("gazer_07")];
    const w = makeWorld({ ghosts: archive, glyphsRead: FRAGMENT_KEYS });
    expect(saveWorld(storage, w)).toBe(true);
    expect(storage.getItem(WORLD_SAVE_KEY)).not.toBeNull();
    const restored = loadWorld(storage);
    expect(restored?.ghosts).toEqual(archive);
    expect(restored?.glyphsRead).toEqual(FRAGMENT_KEYS);
    // The restored world can resolve the NG+ {id} and open the recording.
    if (restored !== null) {
      expect(ngpOpeningFor(restored, true, false)?.ghostId).toBe("gazer_07");
      const sequence = buildRecordingSequence({
        ngPlus: true,
        archive: restored.ghosts ?? [],
        glyphsRead: restored.glyphsRead,
      });
      expect(sequence.ok).toBe(true);
      expect(sequence.cues.length).toBeGreaterThan(0);
    }
  });

  it("a tampered archive falls back to a fresh world (no crash)", () => {
    const storage = new MemoryStorage();
    const w = makeWorld({ ghosts: [profile("gazer_07")], glyphsRead: FRAGMENT_KEYS });
    saveWorld(storage, w);
    const raw = storage.getItem(WORLD_SAVE_KEY) ?? "";
    storage.setItem(WORLD_SAVE_KEY, raw.slice(0, -3) + "xxx");
    expect(() => loadWorld(storage)).not.toThrow();
    expect(loadWorld(storage)).toBeNull();
  });

  it("emptySlice ghosts-free worlds still round-trip", () => {
    const storage = new MemoryStorage();
    const w = makeWorld({ memories: { gazer_01: emptySlice() } });
    saveWorld(storage, w);
    expect(loadWorld(storage)).toEqual(w);
  });
});
