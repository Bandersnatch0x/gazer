# 0001 — 壳层状态与现有 `WorldState` 撞名:改名 `ShellState`

日期:2026-11-12

## 背景

GAZER v4「并行世界之壳」方案定义了 `WorldState`(world_time / settlement_name / drift_rate / seed_context / events_history …),与 `docs/design/ARCHITECTURE.md` 已冻结的模拟层 `WorldState`(tick / gv / stage / creatures / structures …)是两个不同的东西撞了同一个名字。现有 `WorldState` 是确定性归约器状态;v4 的是壳层环境叙事状态,跨昼夜、天气与伪新闻。不改名,两份文档与 `src/sim/types.ts` 会互相污染。

## 被选方案

壳层状态改名 `ShellState`,不并入模拟层状态。它不是 sim 的确定性状态,不进归约器。

## 被否方案及落选理由

- **并入现有 `WorldState` 为只读分区 `world.shell`**:落选——壳层状态含天气、种子上下文与事件历史,进 sim 状态会把非确定性数据拖进纯归约器,违反「模拟无时钟、无 I/O」不变量(见 0003)。
- **不改名、靠文档区分**:落选——两个同名接口在 TypeScript 与文档双层面必然互相污染,未来每次类型引用都要靠人脑消歧。

## 影响面

- `docs/design/ARCHITECTURE.md`(v4 增补节)、未来 `research/gazer-v4-shell` 分支的规格文档(见 0008)。
- 不触碰现有 `src/sim/types.ts` 的 `WorldState`;v4 实现时新增 `ShellState` 类型与现有类型并立。
