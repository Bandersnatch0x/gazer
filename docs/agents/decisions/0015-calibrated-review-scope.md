# 0015 — 校准版评审的范围口径与赛后项裁定

日期:2026-11-14

## 背景

2026-11-13/14 的四维度校准评审(`.agent/keep/GAZER_REVIEW_CALIBRATION.md`、`REVIEW_CROSSCHECK.md`)发现:旧评审提示词把 v4 赛后项(集体记忆四向注入 / RT-CONTEXT 600→700 / norms / factions / born knowing / 天气镜像 / M1–M10 里程碑表)与已被 `docs/design/HARNESS.md:123,125` 否决的自迭代叙事、Ollama 本地降级,全部当作参赛范围逐项追查,导致 2026-11/12 旧报告把它们误判为「缺失」并计入「阻断开发」。同一批提示词还预设了 `GAZER_V3_SPEC.md`、Part IX/IV/VI、v3.5 补充文档与 v4 全文规格,这些在 main 仓内均不存在。

## 被选方案

- 范围基线以 `docs/agents/decisions/0004-jam-scope-slice.md` 参赛切片表为准;v4 全文规格按 0008 不并入 main。
- 新增判定标签 `[范围外/赛后]` 与 `[已否决]`:不计入完整度分母、不扣分、不列为「阻断开发」,单列说明。
- 评分按各自口径并列标注:纯设计文档完整度(85/100,分母 24)、模块矩阵(≥3 级 44/52)、追溯覆盖率(严格 11/24、模块层 22/24);**禁止跨口径同比**(不得说「84→85 提升」「M1–M10 完成 85%」)。
- M1–M10 里程碑表仓内不存在 → 明确写「不可计算」,改以 0004 切片 + `.agents/keep/tickets/` 统计进度。

## 被否方案及落选理由

- **沿用旧版 76/84 → 85 的连续评分叙事**:落选——旧版是「设计+实现」混合分,本版是纯设计文档口径,分母不同,连续叙事会制造虚假进步。
- **把赛后项列入 [阻断开发]**:落选——违反 0004 已定案的参赛切片,虚增缺口并挤占提交窗口。
- **为追查赛后项补写 v4 规格进 `docs/design/`**:落选——0008 已裁定规格落 research 分支,混入会让权威文档同时承载两代设计。

## 影响面

- 五份校准版报告(`DESIGN_AUDIT.md` / `CODE_AUDIT.md` / `TRACEABILITY_MATRIX.md` / `EXECUTIVE_SUMMARY.md` / `REVIEW_CROSSCHECK.md`)与 `.agent/keep/GAZER_REVIEW_PROMPTS_CALIBRATED.md`。**2026-11-14 用户裁定:报告按仓库目录秩序留本地**(`.agent/keep/REVIEW_20261114_*`,见 `.agent/keep/REVIEW_ARCHIVE_INDEX.md`),不入版本控制;根目录三个被跟踪报告回退到仓内既有版本。
- 后续票据范围(0062 解票地图及子票)。
- 不改动 `docs/design/` v3 权威四件,不推翻 0001–0014 既有裁决。
