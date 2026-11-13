# 0007 — 集体记忆相似度度量与缓存键量化

日期:2026-11-12

## 背景

1. 集体记忆巩固的第一判据是「语义相似条目 ≥60%」,但引擎是确定性归约器,不能跑 embedding,度量未定义。
2. RT-CONTEXT 的缓存键是 `stage + trigger + hash(序列化上下文)`(`docs/design/CONTEXT.md`),目标命中率 >60%。v4 的 `world_time`、`weather_now`、`world_mood` 连续变化会直接打爆该键。

## 被选方案

1. **相似度度量**:沿用 CONTEXT.md 既有先例——relevance 用与 validator 同一个分词器做关键词重叠,两系统不漂移。定义:相似度 = 与 relevance 同一分词器的关键词重叠率,阈值 0.6;代码预筛硬边界,模型巩固调用做最终裁决。
2. **缓存键量化**:世界时间按游戏小时分桶、天气仅在变化时进入上下文、`world_mood` 保留 1 位小数——保护 60% 命中率。

## 被否方案及落选理由

- **embedding / 小模型判定相似度**:落选——归约器无 I/O,embedding 即 I/O;且引入与 validator 不同的度量通道,会漂移。
- **提高预算容忍缓存退化**:落选——命中率是 ARCHITECTURE.md 的设计目标,且 0002 已确认预算紧张,不能双向放血。

## 影响面

- `research/gazer-v4-shell` 的集体记忆节与 RT-CONTEXT v2 增补节;`src/director/context.ts` 与 roundtable validator 的分词器必须共用单一出口(现已是同一来源,保持)。
- 缓存键量化属通用小修,可随参赛版实现顺手做;集体记忆度量属赛后。
