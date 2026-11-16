# 0019 — 圆桌超时回归 800ms:playtest 的 20000ms 属会话级临时绕过

> **状态:已被 ADR 0023 取代(2026-11-15)。** 800ms 结论基于设计文档口径;真实端点实测(3664–11060ms,6 样本)证明 800ms 会 abort 全部真实调用,预算改为 12000ms 并修订 HARNESS §5。本文数值结论不再有效,历史背景与"临时绕过"的定性分析保留。

日期:2026-11-14

## 背景

票 0069(T7 数值对齐)实施时发现 `src/director/router.ts` 原 `roundtable.timeoutMs = 20000` **不是笔误**:`router.ts:35-38` 与 `tests/director-router.test.ts:38-39` 记有 playtest 0014 的实测——本地 jam 端点整场景约 2.7s,`HARNESS.md §5` 的 800ms 会 abort 每次真实调用;而 `speakScene` 是 fire-and-forget、超时已回落 `manualPool`,故旧代码刻意放宽到 20000ms。③ `TRACEABILITY_MATRIX.md` 把它登记为 U09 数值漂移,④ 把它列入最小清单 #7。两种口径并存即 ① C1「双源漂移」的同类复发。

## 被选方案

- **以设计文档为权威回归 800ms**,20000ms 定性为 playtest 会话的临时绕过,不保留为产品配置。
- 真实端点超时 → 回落 `manualPool` → 降级被 `HARNESS.md §6` 的 `voice_degraded` 叙事收编,是**设计内行为**而非故障;这正兑现设计公理「延迟变成心跳 / 缺席变成 Silent Run」(`ARCHITECTURE.md:21`)。
- 演示口径按 0016 分层:桌面静默/兜底演示不承诺实时 LLM 台词;综合结论不因「模型台词出现概率下降」而回调超时。
- 保留 `router.ts` 注释、`tests/director-router.test.ts` 钉死值注释与票 0069 Log 的三处留痕,使「为何选 800」可复核。

## 被否方案及落选理由

- **保留 20000ms 并修订 `HARNESS.md §5`**:落选——被改的是设计权威而非实现;且一个「永不超时」的演示特例会削弱「LLM 不可替代」的证据链,让评委三问的第 2 问失去可证伪性。
- **两边都不动**:落选——U09 漂移必须闭合,否则逐行对文档的评审必然翻车。
- **800ms 只用于 CI、运行时另设长超时**:落选——双口径正是 C1 双源漂移的复现,禁止再制造第二份真值。
- **把超时设为可配置并在演示时调大**:落选——引入一个随环境变化的变量进核心路径,与 `HARNESS.md:123` 否决自迭代叙事的同一理由(不可复现)。

## 影响面

- `src/director/router.ts`、`tests/director-router.test.ts`、`tests/director-doc-alignment.test.ts`、票 0069 Log。
- **不改动** `docs/design/HARNESS.md`;不改动其余四档延迟(1200/2000/600/0 本就一致)。
- 已知后果如实登记:真实 jam 端点(约 2.7s)调用将超时回落 `manualPool`,演示时模型台词出现概率下降;与 0066 待修的「bridge 未接线」叠加,但两者是不同根因,分别立票。
