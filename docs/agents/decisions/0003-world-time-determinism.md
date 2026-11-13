# 0003 — 世界时间的确定性边界:时间推进为 SimEvent,环境数据存 Snapshot

日期:2026-11-12

## 背景

`docs/design/ARCHITECTURE.md` 写明:模拟是 `(WorldState, SimEvent)` 的纯归约器,无时钟、无 I/O;回放输入 = Snapshot + Effect[] + LedgerEntry[],导演在回放路径之外。v4 的 `world_time`(ISO 时间戳)、`drift_rate`(依赖真实时钟)、天气与伪新闻(依赖真实数据源)若直接进 sim,全部破坏上述不变量。

## 被选方案

不砍功能,只挪边界:

1. 世界时间推进本身作为 SimEvent 由引擎循环发(`advance_time` 事件,含经过的 tick 数)。
2. `drift_rate`、季节、昼夜全部是**从 tick 派生的纯函数**,不存时钟。
3. `anchor_time` / 天气 / 伪新闻文本只存在于 **Snapshot(存档)**,回放时不重生成;伪新闻事件与 director 输出同规格:验证后落盘,在回放路径之外。

由此「种子管道 100% 可复现」的验收成立:可复现指管道,LLM 文本读盘不重判(与 0004、0007 同一原则)。

## 被否方案及落选理由

- **`world_time` 直接存进模拟层 `WorldState` 并由挂钟推进**:落选——违反「无时钟、无 I/O」不变量,回放不可复现。
- **放弃世界时间,一切沿用 tick**:落选——v4 的核心正是让玩家感知到「壳层时间」这一层叙事,显示时间与内部 tick 的分离本身是机制。

## 影响面

- v4 规格与实现:`ShellState`(见 0001)只存派生显示值;`src/sim/engine.ts` 新增 `advance_time` 事件;Snapshot/存档格式新增 shell 环境字段;`docs/design/ARCHITECTURE.md` 回放一节增补一句「shell 环境文本属 Snapshot,不在回放路径重生成」。
