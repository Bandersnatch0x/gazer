// 结局信号(票 0035,ART-CORE-03 §7)— sim 侧最小扩展。
//
// 四结局的塔行为全部从 world 状态派生,零 LLM、零墙钟:
//   - 真·凝视:碎片 8/8 读走即成立——不需要结局事件,塔自己变黑(§7 真 行)。
//   - A 融合 / B 审判 / C 遗忘:需要结局事件入档(WorldState.ending,由
//     game 层接线写入;本票不碰 game.ts)。
// 一切函数纯:同输入同输出,重放逐字节一致。

import { DAY_CYCLE_TICKS } from "./clock";
import type { CreatureState, WorldState } from "./types";
import { beliefAboutPlayer, factionOf } from "./social";

/** §7 结局表四行。`gaze` = 真·凝视。 */
export type TowerEnding = "fusion" | "judgment" | "forgetting" | "gaze";

/** 结局事件入档形状:kind + 触发 tick(派生日数与溶解进度的时间锚)。 */
export interface EndingState {
  readonly kind: TowerEnding;
  readonly atTick: number;
}

/** canon 刻符总数(8 碎片)。 */
export const GLYPHS_TOTAL = 8;

/** A 融合的群体平均 impression 门槛(地图 0048 默认判据,可逆默认)。 */
export const ENDING_FUSION_IMPRESSION = 0.5;

/**
 * 0051 幽灵层的最小入参面:本票判据不消费幽灵档案——divergence 归
 * 0050,此处仅为签名预留(`evaluateEnding(world, ghost)`)。
 */
export interface EndingGhostInput {
  readonly count?: number | undefined;
}

/** 真结局录音演出入口的解锁旗标:8/8 碎片读走即真(渲染/演出面归 0050)。 */
export function recordingUnlocked(world: Pick<WorldState, "glyphsRead">): boolean {
  return isGazeTower(world.glyphsRead);
}

/** 存活个体(behavior ≠ dead)。Pure. */
export function livingOf(world: Pick<WorldState, "creatures">): readonly CreatureState[] {
  return Object.values(world.creatures).filter((creature) => creature.behavior !== "dead");
}

/**
 * B 审判的信念多数面(地图 0048「敌对信念占多数」):wrong 派存活个体数
 * 严格大于 tender 派。计数语义而非权重和——权重和下「敌对权重 > 温和」
 * 数学上等价于群体均值 < 0,B 与 A 将永不重叠,判据序 B>A 失去意义;
 * 计数多数让两个判据各自独立、优先序可检验。未定派个体不计入,全未定
 * 为 false——审判需要敌意,不是需要沉默。Pure.
 */
export function hostileMajority(world: Pick<WorldState, "creatures" | "memories">): boolean {
  let wrong = 0;
  let tender = 0;
  for (const creature of livingOf(world)) {
    const faction = factionOf(beliefAboutPlayer(world.memories?.[creature.id]));
    if (faction === "wrong") {
      wrong += 1;
    } else if (faction === "tender") {
      tender += 1;
    }
  }
  return wrong > tender;
}

/**
 * A 融合的群体平均 impression(地图 0048):存活个体 working 槽平均
 * valence 的群体均值;无记忆的个体不计入,全群无记忆为 0。与纪念册
 * impressionOf 同式,跨层不复用私有函数。Pure.
 */
export function meanImpression(world: Pick<WorldState, "creatures" | "memories">): number {
  const living = livingOf(world);
  const opinions: number[] = [];
  for (const creature of living) {
    const slice = world.memories?.[creature.id];
    if (slice === undefined || slice.working.length === 0) {
      continue;
    }
    opinions.push(slice.working.reduce((sum, entry) => sum + entry.valence, 0) / slice.working.length);
  }
  if (opinions.length === 0) {
    return 0;
  }
  return opinions.reduce((sum, value) => sum + value, 0) / opinions.length;
}

/**
 * 触发判据(地图 0048 默认,可逆默认):GV≥100 前提下,判据序
 * 真 > C > B > A——
 *   真·凝视:8/8 碎片读走(isGazeTower,最高优先,达成即覆盖其余)
 *   C 遗忘:存活个体数 = 0,世界继续跑
 *   B 审判:群体敌对信念权重 > 温和
 *   A 融合:群体平均 impression ≥ +0.5
 * 写入后不可逆:已有 ending 不重评(null)。纯:同 world 同 ghost 同判。
 */
export function evaluateEnding(
  world: Pick<WorldState, "gv" | "ending" | "glyphsRead" | "creatures" | "memories">,
  _ghost?: EndingGhostInput,
): TowerEnding | null {
  if (world.ending !== undefined) {
    return null;
  }
  const gv = Number.isFinite(world.gv) ? world.gv : 0;
  if (gv < 100) {
    return null;
  }
  if (isGazeTower(world.glyphsRead)) {
    return "gaze";
  }
  if (livingOf(world).length === 0) {
    return "forgetting";
  }
  if (hostileMajority(world)) {
    return "judgment";
  }
  if (meanImpression(world) >= ENDING_FUSION_IMPRESSION) {
    return "fusion";
  }
  return null;
}

/**
 * 真·凝视的塔面判据:8/8 读走(§7 真 行「碎片全部读走后」)。与结局事件
 * 无关——这是塔自己的反应,不是演出的开场铃。
 */
export function isGazeTower(glyphsRead?: readonly string[]): boolean {
  return (glyphsRead?.length ?? 0) >= GLYPHS_TOTAL;
}

/** A 融合:溶解窗长(3 个 sim tick,约 9s)——塔先于一切物体走完。 */
export const DISSOLVE_TICKS = 3;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** A 融合的溶解进度 0..1:结局 tick 起 DISSOLVE_TICKS 内线性走完。纯。 */
export function dissolveProgress(endTick: number, nowTick: number): number {
  const end = Number.isFinite(endTick) ? endTick : 0;
  const now = Number.isFinite(nowTick) ? nowTick : 0;
  return clamp01((now - end) / DISSOLVE_TICKS);
}

/** C 遗忘:结局后经过的游戏日数(整日)。纯。 */
export function forgettingDays(endTick: number, nowTick: number): number {
  const end = Number.isFinite(endTick) ? Math.max(0, endTick) : 0;
  const now = Number.isFinite(nowTick) ? Math.max(0, nowTick) : 0;
  if (now <= end) {
    return 0;
  }
  return Math.floor((now - end) / DAY_CYCLE_TICKS);
}

/**
 * C 遗忘:刻符逐游戏日增加——结局日基线 + 已过游戏日,封顶 8(canon 只有
 * 8 枚;「永远读不完」在机制面是它永不封顶于玩家的阅读,渲染面被塔的
 * 槽位与 canon 总数双重截断)。纯。
 */
export function forgettingGlyphCount(baseVisible: number, endTick: number, nowTick: number): number {
  const base = Number.isFinite(baseVisible) ? Math.max(0, Math.floor(baseVisible)) : 0;
  return Math.min(GLYPHS_TOTAL, base + forgettingDays(endTick, nowTick));
}
