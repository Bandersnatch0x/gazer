# 0006 — faction 生成基于 `SwarmBelief` + `impression` 聚类,不新建 bond 层

日期:2026-11-12

## 背景

v4 方案称「v3.5 已有友谊/排挤/教学/哀悼」并以此为 M9(norms 从 bond 压力涌现)、M10(faction 从 rivalry 聚类)与 RT-CONTEXT v2(bonds 段 10 token)的前置。经全文检索 `src/`:存在家谱树(`src/ui/panels.ts`)、lineage、哀悼队列(`src/sim/hooks.ts` 的 `swarm_mourning_queue`)、courtship/繁殖,但**不存在任何 friendship / rivalry / teaching bond 系统**。v4 的 faction 与 norms 压在尚不存在的数据上。

## 被选方案

M10 之前不新建 bond 层;faction 与 norm 压力源改为基于已存在且已测试的数据:`SwarmBelief` + 每生物 `impression`(含 `MemorySlice` 的 valence 同向信号)做聚类。RT-CONTEXT v2 的 bonds 段随之取消,其 10 token 归还候选记忆段。

## 被否方案及落选理由

- **M8 前先补最小 bond 层(纯代码,一个流)**:落选——为 M9/M10(赛后项)新增数据形状违反 0004 切片;参赛窗口不动数据模型。若赛后确实需要「成对关系」语义(教学、排挤有方向性,聚类抓不到),届时按 P07 新配方立项,另开决策。

## 影响面

- `research/gazer-v4-shell` 规格:M9/M10 的前置描述与 RT-CONTEXT v2 预算表修订(候选记忆段 +10)。
- 不影响 `src/sim/types.ts` 现有形状;聚类实现属赛后。
