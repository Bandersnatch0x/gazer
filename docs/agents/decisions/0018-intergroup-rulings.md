# 0018 — 三处组间口径裁决与 N4 相悖点登记

日期:2026-11-14

## 背景

`EXECUTIVE_SUMMARY.md` §6.0 与 `REVIEW_CROSSCHECK.md` §4 S6–S9 暴露三处组间口径差异,以及一处与既有裁决 0012/0013 相悖的正典状态记录,需落定后开工。

## 被选方案

1. **RT-SYSTEM**:以 ② 实测为准——`vite.config.ts:22-30` 确有构建期 `RT_SYSTEM` 常量,① 报告「全仓不存在」的绝对化措辞不成立;但「版本化落仓设计文本」仍缺,由 0071 新建 `docs/design/RT-SYSTEM.md` 承接。
2. **ART 裁决编号**:以 `docs/design/art/README.md` 实际 **R1–R15** 为准(校准提示词写 R1–R13 属口径滞后);唯一实质缺口是 **R11 帧时间预算无 CI 断言**,由 0070 补 `tests/render-crt.test.ts` 断言。
3. **预算语义**:以 `docs/design/ARCHITECTURE.md:325` **硬预算**(15 次/30 分钟 + `llm:budget` 拒绝)为准;`src/bridge/index.ts:15-16` 自述「guard is soft」是未接线层的自我描述,不构成规范。bridge 整层未接线列入 0066 风险,预算「先成功后扣」同票修正。
4. **N4 相悖点(不静默推翻)**:运行时事实是 `src/canon/canon.lock:5` `entries: 45`、`src/canon/registry.ts:367` `CANON_PENDING = []`、45 条逐条带 source、`tests/canon-lock.test.ts` 逐字 diff=0(含 E1 空串)。但 `0012:13` 记「缺源 9 行待用户供 v3/v3.5 冻结稿原文」、`0013:13` 与 `docs/design/narrative/README.md:20` 记「44 条目 / 全闭合」。按 `docs/agents/decisions/README.md`「已确认的裁决与产出相悖时不得静默推翻」,本 ADR **只登记运行时事实与相悖点**,不改写 0012/0013 文本,不把 0012 的 N4 用户侧待办判为已闭合;是否闭合属票 0038 的用户侧待办,交用户裁。0071 仅做文档状态说明与 `registry.ts:161-165` 过期注释清理。

## 被否方案及落选理由

- **删除 `vite.config.ts` 的 RT_SYSTEM 常量以匹配「不存在」断言**:落选——破坏构建期模板,且断言本身才是错的。
- **按 R1–R13 口径核 ART**:落选——漏 R14/R15,会把未裁决项当已裁决。
- **依 `bridge/index.ts` 自述改软预算**:落选——与 `ARCHITECTURE.md:325` 及 0002 的调用节流裁决相悖,且该层根本未接线。
- **直接改写 0012/0013 为「45 条已闭合」**:落选——违反决策 README 的静默推翻禁令;用户侧待办不属代理授权内的不可逆裁决。

## 影响面

- 0070 / 0071 / 0066 三票的验收形状;`.agent/keep/GAZER_REVIEW_CALIBRATION.md` 补遗节。
- `docs/design/ART` 与 `docs/design/narrative` 的口径说明;不改 canon 冻结文本与 `canon.lock` 哈希。
