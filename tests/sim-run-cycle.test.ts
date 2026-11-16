/**
 * P-6 · sim 级确定性周目断言:一条脚本化重放穿过真实引擎的全部状态梯,
 * 把「完整周目」钉进 CI——纯 reducer,零 LLM、零渲染、零墙钟。
 *
 * 覆盖面(均由真实 `step` 序列驱动,不用构造捷径):
 *   1. 阶梯:照料喂养(饥饿 <40 才喂)+ 注视节奏推进 GV,stage 序列 0→4,
 *      GV 100 收束。
 *   2. 照料:confirm 式喂养节奏让三只初始生物活到终点。
 *   3. 结局:照料本身不裁决命运(无信念 → null);信念面才裁决
 *      (fusion/judgment,走真实 `remember` 事件),8/8 刻符凌驾 GV 门
 *      (gaze),入档后不可逆。
 *   4. 重放确定性:同一脚本两次重放,逐字节相等。
 *   5. 静默节拍(P-3):环境句标记点全部落在 40 分钟线之前且严格递增,
 *      与 R6.2 破静默台词永不同 tick;接线面(键盘动词/蛋 guard)存在。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateEnding, GLYPHS_TOTAL } from "../src/sim/endings";
import { HUNGER_PER_TICK, step } from "../src/sim/engine";
import {
  SILENT_LINE_TICK,
  SILENT_WATCH_MARKS,
  silentLineDue,
  silentWatchIndexDue,
} from "../src/game";
import { seasonParamsForStage, stageDecayFor } from "../src/sim/rhythm";
import { INITIAL_GV, type WorldState } from "../src/sim/types";

const SEED = 1997;
const STARTER_IDS = ["gazer_01", "gazer_02", "gazer_03"] as const;
const START_POSITIONS = [
  { x: 6, y: 5 },
  { x: 9, y: 7 },
  { x: 4, y: 8 },
] as const;

function starterWorld(): WorldState {
  let world: WorldState = {
    tick: 0,
    gv: INITIAL_GV,
    stage: 0,
    creatures: {},
    structures: [],
    eggs: [],
    uiLabels: {},
    paletteDecay: 0,
    seed: SEED,
    silent: true,
  };
  STARTER_IDS.forEach((id, index) => {
    world = step(world, {
      kind: "hatch",
      creatureId: id,
      at: START_POSITIONS[index] ?? START_POSITIONS[0],
      species: "gazerling",
    });
  });
  return world;
}

/**
 * 一条完整周目的脚本:confirm 式喂养(饥饿 <40 才喂)+ 注视节奏(每三 tick
 * 一次),GV 走真实账本权重 × stage 衰减——与 game-rhythm 的节奏模型同源。
 */
function runCycle(maxTicks: number) {
  let world = starterWorld();
  const stageSequence: number[] = [world.stage];
  let stage4AtTick: number | null = null;
  let stage5AtTick: number | null = null;
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    for (const creature of Object.values(world.creatures)) {
      if (creature.behavior !== "dead" && creature.stats.hunger < 40) {
        world = step(world, { kind: "feed", creatureId: creature.id });
        world = step(world, { kind: "gv", delta: stageDecayFor(world.stage) });
      }
    }
    if (tick % 3 === 0) {
      world = step(world, { kind: "gv", delta: 1.5 * stageDecayFor(world.stage) });
    }
    world = step(world, { kind: "tick" });
    if (world.stage !== stageSequence[stageSequence.length - 1]) {
      stageSequence.push(world.stage);
    }
    if (stage4AtTick === null && world.gv >= 80) {
      stage4AtTick = tick;
    }
    if (stage5AtTick === null && world.gv >= 100) {
      stage5AtTick = tick;
    }
  }
  return { world, stageSequence, stage4AtTick, stage5AtTick };
}

/** 与 ending-triggers 同构的最小信念条目;走真实 `remember` 事件入状态。 */
function beliefEntry(id: string, valence: number, fact: string) {
  return {
    id,
    atTick: 0,
    wallClock: "12:00",
    fact,
    witnessed: "witnessed" as const,
    source: null,
    distortion: null,
    salience: 0.5,
    valence,
  };
}

describe("P-6 · the full state ladder of one scripted run (pure engine)", () => {
  it("crosses stages 0→4 in order and lands on the GV 100 gate", () => {
    const result = runCycle(1200);
    expect(result.stageSequence).toEqual([0, 1, 2, 3, 4]);
    expect(result.stage4AtTick).not.toBeNull();
    expect(result.stage5AtTick).not.toBeNull();
    expect(result.world.gv).toBeGreaterThanOrEqual(100);
    expect(result.world.stage).toBe(4);
  });

  it("the seasonal macro-clock follows the one-act-one-season shape", () => {
    // 与 game-rhythm 的季节测试同形状(那是权威):夏是设计上的丰饶
    // (hunger 咬得轻、喂食回报高),秋起照料面只收紧。
    const spring = seasonParamsForStage(0);
    const summer = seasonParamsForStage(1);
    expect(summer.hungerMultiplier).toBeLessThan(spring.hungerMultiplier);
    expect(summer.feedRestoreMultiplier).toBeGreaterThan(spring.feedRestoreMultiplier);
    for (let stage = 2; stage <= 4; stage += 1) {
      const before = seasonParamsForStage(stage - 1);
      const after = seasonParamsForStage(stage);
      expect(after.hungerMultiplier).toBeGreaterThan(before.hungerMultiplier);
      expect(after.feedRestoreMultiplier).toBeLessThan(before.feedRestoreMultiplier);
    }
    // 周目终点的季节档与 stage 4 对齐(bleak:最紧的饥饿面、最慢的 tick)。
    expect(seasonParamsForStage(4).hungerMultiplier).toBeCloseTo(1.5, 10);
    expect(seasonParamsForStage(4).tickMs).toBeGreaterThan(spring.tickMs);
  });

  it("the confirm-tap feeding cadence keeps every starter alive to GV 100", () => {
    const result = runCycle(1200);
    const dead = Object.values(result.world.creatures).filter((c) => c.behavior === "dead");
    expect(dead).toHaveLength(0);
    for (const creature of Object.values(result.world.creatures)) {
      expect(creature.stats.hunger).toBeGreaterThanOrEqual(0);
      expect(creature.stats.hunger).toBeLessThanOrEqual(100);
    }
  });

  it("care alone never decides fate: the belief system does", () => {
    const result = runCycle(1200);
    // 喂养记忆由 game 层的 remember() 负责,纯脚本里没有 remember 事件:
    // GV 100 且全员存活、无信念的世界,判据恒 null——照料本身不裁决结局。
    expect(result.world.gv).toBeGreaterThanOrEqual(100);
    expect(evaluateEnding(result.world)).toBeNull();
    // 饥饿消耗面自洽:满状态到饿死在 3s tick 下超 10 分钟(§3)。
    expect(Math.ceil(80 / HUNGER_PER_TICK) * 3).toBeGreaterThanOrEqual(600);
  });
});

describe("P-6 · replay determinism of the whole ladder (byte-identical)", () => {
  it("the same script twice yields the identical world JSON", () => {
    const a = runCycle(600).world;
    const b = runCycle(600).world;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("P-6 · the belief side decides, through real remember events", () => {
  it("tender flock → fusion, hostile flock → judgment, 8/8 glyphs → gaze, then it locks", () => {
    const { world: base } = runCycle(1200);
    // 融合:全员温和信念(均值 ≥ +0.5),经真实 remember 事件写入。
    let warm = base;
    const warmBeliefs: readonly [string, number, string][] = [
      ["gazer_01", 0.9, "the player fed gazer_01"],
      ["gazer_02", 0.6, "the player pet gazer_01"],
      ["gazer_03", 0.5, "the player named gazer_01"],
    ];
    for (const [id, valence, fact] of warmBeliefs) {
      warm = step(warm, { kind: "remember", creatureId: id, entry: beliefEntry(`warm_${id}`, valence, fact) });
    }
    expect(evaluateEnding(warm)).toBe("fusion");
    // 审判:敌对信念计数多数(2 wrong vs 1 tender),叠加在同一个世界上。
    // 派系阈值 ±0.15(social.ts FACTION_TENDER_THRESHOLD):各两条敌对记忆,
    // 把 gazer_01/02 的均值压过 -0.15(单条 -1 只到 -0.05,压不过)。
    let hostile = warm;
    const hostileBeliefs: readonly [string, number, string][] = [
      ["gazer_01", -1, "the player sold gazer_01"],
      ["gazer_01", -1, "the keeper forgot gazer_01"],
      ["gazer_02", -0.9, "the player carried gazer_01 away"],
      ["gazer_02", -0.9, "the keeper cleaned gazer_01"],
    ];
    for (const [id, valence, fact] of hostileBeliefs) {
      hostile = step(hostile, { kind: "remember", creatureId: id, entry: beliefEntry(`hostile_${id}_${fact.length}`, valence, fact) });
    }
    expect(evaluateEnding(hostile)).toBe("judgment");
    // 真·凝视:8/8 刻符凌驾 GV 门与群体信念(票 0072 口径)。
    const glyphs = Array.from({ length: GLYPHS_TOTAL }, (_, i) => `fragment.f${i + 1}`);
    expect(evaluateEnding({ ...hostile, glyphsRead: glyphs })).toBe("gaze");
    // 入档不可逆:已有 ending 的世界不再翻案。
    expect(
      evaluateEnding({ ...hostile, glyphsRead: glyphs, ending: { kind: "judgment", atTick: 1 } }),
    ).toBeNull();
  });
});

describe("P-6 · the silent watch cadence never collides with the R6.2 breach line", () => {
  it("marks live strictly before minute 40, ascending, one per eighth", () => {
    expect(SILENT_LINE_TICK).toBe(800);
    expect(SILENT_WATCH_MARKS).toEqual([160, 320, 480, 640]);
    for (let i = 1; i < SILENT_WATCH_MARKS.length; i += 1) {
      const previous = SILENT_WATCH_MARKS[i - 1];
      const current = SILENT_WATCH_MARKS[i];
      expect(previous !== undefined && current !== undefined).toBe(true);
      if (previous !== undefined && current !== undefined) {
        expect(current - previous).toBe(160);
      }
    }
    for (const mark of SILENT_WATCH_MARKS) {
      expect(mark !== undefined && mark < SILENT_LINE_TICK).toBe(true);
    }
  });

  it("the pure scheduler answers deterministically and never invents marks past the eighth", () => {
    // 追赶语义:返回第一个「已到点且未说过」的句——跳 tick 时补旧句,
    // 但标记点只有四个,任何 (tick, spoken) 都不会越过第 4 句。
    expect(silentWatchIndexDue(159, 0)).toBe(-1);
    expect(silentWatchIndexDue(160, 0)).toBe(0);
    expect(silentWatchIndexDue(319, 1)).toBe(-1);
    expect(silentWatchIndexDue(320, 1)).toBe(1);
    expect(silentWatchIndexDue(479, 2)).toBe(-1);
    expect(silentWatchIndexDue(480, 2)).toBe(2);
    expect(silentWatchIndexDue(639, 3)).toBe(-1);
    expect(silentWatchIndexDue(640, 3)).toBe(3);
    expect(silentWatchIndexDue(641, 4)).toBe(-1);
    // 追赶封顶:说得再少,答案也只落在 [0..3];标记点全部 < 800(上面钉死),
    // 所以线后没有新句——R6.2 的第 40 分钟台词仍是唯一破静默。
    expect(silentWatchIndexDue(800, 0)).toBe(0);
    expect(silentWatchIndexDue(1200, 0)).toBe(0);
    expect(silentWatchIndexDue(1200, 4)).toBe(-1);
    // 破静默台词自身:恰在第 800 tick 一次(R6.2)。
    expect(silentLineDue(799, false)).toBe(false);
    expect(silentLineDue(800, false)).toBe(true);
    expect(silentLineDue(801, true)).toBe(false);
  });
});

describe("P-6 · the wiring keeps the confirm-style contract while growing verbs", () => {
  it("game.ts still owns a single guarded feed path and the keyboard verbs reuse it", () => {
    const source = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");
    // 键盘动词(P-2)走 performFeed/performClean,不另开记账路径。
    expect(source).toContain("function keyboardVerb");
    expect(source).toContain("performFeed(target.id, 0)");
    expect(source).toContain("performClean(target.id)");
    // 孵化面板防误触(P-2):guard 挂起 + 取消函数存在,destroy 里也排干。
    expect(source).toContain("cancelPendingHatch");
    expect(source).toContain("openHatchChoice(hatchEgg)");
    // 静默环境节拍(P-3):接线存在且只在 silent 分支里。
    expect(source).toContain("silentWatchIndexDue(world.tick, silentWatchSpoken)");
  });
});
