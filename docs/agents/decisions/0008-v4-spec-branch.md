# 0008 — v4 规格落点:`research/gazer-v4-shell` 分支,不并入 main

日期:2026-11-12

## 背景

GAZER v4「并行世界之壳」的全文规格现只存在于对话。按 `AGENTS.md` 本仓实况速查:「研究与规格产物:`research/<topic>` 分支承载,不并入 main」。设计文档权威在 `docs/design/`,正式裁决在 `docs/agents/decisions/`,规格是两者的上游材料,不进 main。

## 被选方案

v4 全文规格落到 `research/gazer-v4-shell` 分支(建议 `research/gazer-v4-shell/SPEC.md`),载入本批评决后的修订:ShellState 命名(0001)、调用节流(0002)、确定性边界(0003)、切片表(0004)、红线 8(0005)、faction 前置改 belief 聚类(0006)、相似度与缓存键(0007)。参赛切片以票据形式走 main(见票据路由)。

## 被否方案及落选理由

- **规格直接进 `docs/design/`**:落选——docs/design 是已冻结 v3 权威,v4 是未立项的赛后路线;混入会让权威文档同时承载两代设计。
- **规格留在对话/个人面**:落选——项目级规格须对所有维护者可见,个人面不放项目事项。

## 影响面

- `research/gazer-v4-shell` 分支(新建);参赛切片票(`.agents/keep/tickets/`)与其互指。
