import { describe, expect, it } from "vitest";
import {
  ENDING_FUSION_IMPRESSION,
  evaluateEnding,
  hostileMajority,
  meanImpression,
  recordingUnlocked,
} from "../src/sim/endings";
import { step } from "../src/sim/engine";
import { worldCalendarAt } from "../src/sim/clock";
import { emptySlice } from "../src/sim/memory";
import type { MemoryEntry, MemorySlice } from "../src/sim/memory";
import type { CreatureState, WorldState } from "../src/sim/types";

// ---------------------------------------------------------------------------
// 构造面:地图 0048 默认判据的最小世界。
// ---------------------------------------------------------------------------

const READ_ALL = [
  "fragment.f1",
  "fragment.f2",
  "fragment.f3",
  "fragment.f4",
  "fragment.f5",
  "fragment.f6",
  "fragment.f7",
  "fragment.f8",
];

let entrySeq = 0;

function entry(valence: number, fact = "the player fed gazer_01"): MemoryEntry {
  entrySeq += 1;
  return {
    id: `m_${entrySeq}`,
    atTick: 0,
    wallClock: "00:00",
    fact,
    witnessed: "witnessed",
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

function slice(...entries: MemoryEntry[]): MemorySlice {
  return { working: entries, consolidated: [] };
}

function creatureAt(id: string, position: { x: number; y: number }): CreatureState {
  return {
    id,
    species: "gazerling",
    stats: { hunger: 70, hygiene: 70, happiness: 70, energy: 70 },
    behavior: "idle",
    trait: null,
    position,
    palette: ["#f2e6c9", "#7ef0a6", "#1a2b1f"],
    mask: ["..####.."],
    hatchedAtTick: 0,
    name: null,
    willingness: 40,
    courtshipTicks: 0,
  };
}

function world(opts: {
  gv?: number;
  glyphsRead?: readonly string[];
  creatures?: Readonly<Record<string, CreatureState>>;
  memories?: Readonly<Record<string, MemorySlice>>;
  ending?: WorldState["ending"];
}): WorldState {
  return {
    tick: 36000,
    gv: opts.gv ?? 100,
    stage: 4,
    creatures: opts.creatures ?? {},
    structures: [{ kind: "black_tower", at: { x: 0, y: 7 }, createdBy: "director" }],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: 1997,
    silent: true,
    glyphsRead: opts.glyphsRead ?? [],
    memories: opts.memories ?? {},
    ...(opts.ending !== undefined ? { ending: opts.ending } : {}),
  };
}

// ---------------------------------------------------------------------------
// 触发判据全表(地图 0048 默认,判据序 真 > C > B > A)。
// ---------------------------------------------------------------------------

describe("evaluateEnding: the trigger table (ticket 0049, map 0048)", () => {
  it("requires GV≥100: below the gate the world has not ended, whatever else holds", () => {
    expect(evaluateEnding(world({ gv: 99, creatures: { a: creatureAt("a", { x: 3, y: 3 }) } }))).toBeNull();
    expect(evaluateEnding(world({ gv: 0 }))).toBeNull();
    // 8/8 already read, census zero — still nothing before GV100.
    expect(evaluateEnding(world({ gv: 99, glyphsRead: READ_ALL }))).toBeNull();
  });

  it("真·凝视: 8/8 read wins over everything else on the table", () => {
    // 8/8 with a hostile flock and creatures alive: gaze still takes it.
    const hostile = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }) },
      memories: { a: slice(entry(-1, "the player starved gazer_01"), entry(-1, "the keeper forgot gazer_01")) },
      glyphsRead: READ_ALL,
    });
    expect(evaluateEnding(hostile)).toBe("gaze");
    // 8/8 with nobody alive: gaze (真 > C).
    expect(evaluateEnding(world({ glyphsRead: READ_ALL }))).toBe("gaze");
  });

  it("C 遗忘: census zero and the world keeps running", () => {
    expect(evaluateEnding(world({}))).toBe("forgetting");
    expect(evaluateEnding(world({ memories: { a: slice(entry(1)) } }))).toBe("forgetting");
  });

  it("B 审判: hostile belief weight outweighs the tender weight", () => {
    const hostile = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }), b: creatureAt("b", { x: 4, y: 4 }) },
      memories: {
        a: slice(entry(-1, "the player carried gazer_01"), entry(-0.5, "the keeper cleaned gazer_01")),
        b: slice(entry(0.1, "the player fed gazer_01")),
      },
    });
    expect(hostileMajority(hostile)).toBe(true);
    expect(evaluateEnding(hostile)).toBe("judgment");
    // Tender weight heavier: not judgment.
    const tender = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }), b: creatureAt("b", { x: 4, y: 4 }) },
      memories: {
        a: slice(entry(1, "the player fed gazer_01")),
        b: slice(entry(-0.1, "the keeper cleaned gazer_01")),
      },
    });
    expect(hostileMajority(tender)).toBe(false);
  });

  it("A 融合: group mean impression at or above +0.5", () => {
    const warm = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }), b: creatureAt("b", { x: 4, y: 4 }) },
      memories: {
        a: slice(entry(0.9, "the player fed gazer_01")),
        b: slice(entry(0.5, "the player pet gazer_01")),
      },
    });
    expect(meanImpression(warm)).toBeCloseTo(0.7, 10);
    expect(evaluateEnding(warm)).toBe("fusion");
    // Just under the line: no ending.
    const cool = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }) },
      memories: { a: slice(entry(0.49, "the player fed gazer_01")) },
    });
    expect(meanImpression(cool)).toBeLessThan(ENDING_FUSION_IMPRESSION);
    expect(evaluateEnding(cool)).toBeNull();
  });

  it("priority order B > A: judgment takes a hostile flock, fusion takes a warm one", () => {
    // B 判据(计数多数):两枚真 wrong 派 + 一枚 tender;均值 −0.5 < 0.5,
    // A 的门槛未过——B 以优先序先行,判 judgment。
    const hostile = world({
      creatures: {
        a: creatureAt("a", { x: 3, y: 3 }),
        b: creatureAt("b", { x: 4, y: 4 }),
        c: creatureAt("c", { x: 5, y: 5 }),
      },
      memories: {
        a: slice(entry(-1, "the player sold gazer_01")),
        b: slice(entry(-0.8, "the keeper forgot gazer_01")),
        c: slice(entry(0.3, "the player fed gazer_01")),
      },
    });
    expect(meanImpression(hostile)).toBeLessThan(ENDING_FUSION_IMPRESSION);
    expect(hostileMajority(hostile)).toBe(true);
    expect(evaluateEnding(hostile)).toBe("judgment");
    // 无敌对多数且均值 ≥ 0.5 → A 融合(B 不成立才轮到 A)。
    const warm = world({
      creatures: {
        a: creatureAt("a", { x: 3, y: 3 }),
        b: creatureAt("b", { x: 4, y: 4 }),
        c: creatureAt("c", { x: 5, y: 5 }),
      },
      memories: {
        a: slice(entry(0.9, "the player fed gazer_01")),
        b: slice(entry(0.5, "the player pet gazer_01")),
        c: slice(entry(0.7, "the player played with gazer_01")),
      },
    });
    expect(hostileMajority(warm)).toBe(false);
    expect(meanImpression(warm)).toBeGreaterThanOrEqual(ENDING_FUSION_IMPRESSION);
    expect(evaluateEnding(warm)).toBe("fusion");
  });

  it("irreversible: an ending already on the ledger is never re-evaluated", () => {
    const ended = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }) },
      memories: { a: slice(entry(-1, "the player sold gazer_01")) },
      ending: { kind: "judgment", atTick: 36000 },
      glyphsRead: READ_ALL,
    });
    expect(evaluateEnding(ended)).toBeNull();
    // Even a written forgetting never upgrades to gaze.
    expect(
      evaluateEnding(world({ glyphsRead: READ_ALL, ending: { kind: "forgetting", atTick: 0 } })),
    ).toBeNull();
  });

  it("is pure: the same world always answers the same verdict", () => {
    const warm = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }) },
      memories: { a: slice(entry(0.9, "the player fed gazer_01")) },
    });
    expect(evaluateEnding(warm)).toBe(evaluateEnding(warm));
    expect(hostileMajority(warm)).toBe(hostileMajority(warm));
  });
});

// ---------------------------------------------------------------------------
// 交付形状 4:真结局录音入口旗标(派生,非存储)。
// ---------------------------------------------------------------------------

describe("recording entry flag (ticket 0049, consumed by 0050)", () => {
  it("unlocks exactly when 8/8 fragments are read", () => {
    expect(recordingUnlocked({ glyphsRead: READ_ALL })).toBe(true);
    expect(recordingUnlocked({ glyphsRead: READ_ALL.slice(0, 7) })).toBe(false);
    expect(recordingUnlocked({ glyphsRead: [] })).toBe(false);
    expect(recordingUnlocked({})).toBe(false);
    // The flag is derived: it does not wait for the day-zero evaluation.
    expect(
      recordingUnlocked(world({ glyphsRead: READ_ALL }).glyphsRead === undefined ? {} : world({ glyphsRead: READ_ALL })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 交付形状 3:C 遗忘后世界继续跑(Silent Run 态延伸)。
// ---------------------------------------------------------------------------

describe("the world keeps running after C (ticket 0049)", () => {
  it("a census-zero world with a forgetting ending still ticks forward", () => {
    let ended = world({
      creatures: {},
      ending: { kind: "forgetting", atTick: 36000 },
    });
    const startTick = ended.tick;
    for (let i = 0; i < 5; i += 1) {
      ended = step(ended, { kind: "tick" });
    }
    expect(ended.tick).toBe(startTick + 5);
    // 不可逆:评估不再翻案,判定恒 null。
    expect(evaluateEnding(ended)).toBeNull();
    // 塔面由 0035 的 forgetting 渲染接管,世界结构不动。
    expect(ended.structures[0]?.at).toEqual({ x: 0, y: 7 });
  });

  it("emptySlice worlds carry no opinion: census zero still lands on C", () => {
    const lonely = world({
      creatures: { a: creatureAt("a", { x: 3, y: 3 }) },
      memories: { a: emptySlice() },
    });
    expect(meanImpression(lonely)).toBe(0);
    const gone = world({ memories: { a: emptySlice() } });
    expect(evaluateEnding(gone)).toBe("forgetting");
  });
});

// ---------------------------------------------------------------------------
// 游戏日零点钩子的纯面:每个游戏日恰一个零点窗,确定性。
// ---------------------------------------------------------------------------

describe("the day-zero evaluation window (ticket 0049)", () => {
  it("hour 0 opens exactly once per game day: midnight sits half a cycle past noon", () => {
    const DAY = 1200; // sim/clock's DAY_CYCLE_TICKS; the sky's noon is phase 0
    // 正午锚:tick = DAY·day(hour 12);零点窗 = DAY·day + 600,长 50 tick。
    for (const day of [0, 1, 2, 5]) {
      expect(worldCalendarAt(DAY * day).hour).toBe(12);
      const midnight = DAY * day + 600;
      expect(worldCalendarAt(midnight).hour).toBe(0);
      expect(worldCalendarAt(midnight).day).toBe(day);
      expect(worldCalendarAt(midnight + 49).hour).toBe(0);
      expect(worldCalendarAt(midnight + 50).hour).toBe(1);
    }
    // 每个游戏日恰一个零点窗:一日内的 hour==0 tick 数 = 50。
    let zeroTicks = 0;
    for (let t = 0; t < DAY; t += 1) {
      if (worldCalendarAt(t).hour === 0) {
        zeroTicks += 1;
      }
    }
    expect(zeroTicks).toBe(50);
  });
});
