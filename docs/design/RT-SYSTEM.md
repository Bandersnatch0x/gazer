---
doc: RT-SYSTEM
version: "1.0"
status: versioned-design-text
source: vite.config.ts:27-35
head: d8cdc5e
date: 2026-11-14
ticket: 0071
ruling: 0018-1
---

> **行号口径(2026-11-14 补记,票 0066/0069 后)**:本文 §2 的逐字对照以常量**内容**为准,不以行号为准。当前 `vite.config.ts` 中 `RT_SYSTEM` 位于 `:27-35`、`extractJsonObject` 位于 `:37-48`、`{ role: "system" }` 注入位于 `:145`;文中残留的 `:22-30` / `:141-146` / `:171-177` 为写作时点行号,转录文本逐字未变,「0 差异」结论不受影响。ADR 0019 已把 roundtable 超时裁定为 800ms(§5 表格同步)。

# RT-SYSTEM — 圆桌系统提示词(版本化设计文本)

## 0. 本文定位(先说清缺的是什么)

`vite.config.ts:22-30` 的 `RT_SYSTEM` 常量**已在构建期 / dev 中间件实际生效**:`llmAdapter()` 在 roundtable 方言请求里以 `{ role: "system", content: RT_SYSTEM }` 注入上游(`vite.config.ts:141-146`),并由 `vite.config.ts:171-177` 的 `extractJsonObject` 只放行解析后的 scene 对象。因此 ① 校准版设计审计里「RT-SYSTEM 全仓不存在 / 全仓无 prompt 模板」的绝对化措辞**不成立**(裁决 0018 ①;`EXECUTIVE_SUMMARY.md:122-123`;② `CODE_AUDIT.md:152`、`:335`)。

**真正缺的不是实现,是版本化落仓设计文本**:该常量是构建期中间件里的字符串数组,没有独立设计文档、没有版本号,`CONTEXT.md` / `HARNESS.md` 也没有系统提示词正文。本文补的就是这一层——按裁决 0018 ① 新建的 `docs/design/RT-SYSTEM.md`,**只登记,不改运行时**:不改 `vite.config.ts` 任何字符、不改 `src/`、不改 `canon.lock`、不改任何冻结文本。

本文与运行时常量的权威关系:

- **可执行真值** = `vite.config.ts:22-30`(`.join(" ")` 后的单条字符串)。
- **设计文本** = 本文。二者必须逐字一致;若将来改常量,须同步改本文并核对 §5 的受影响测试。
- `canon.lock`(冻结正典台词)与本文无关:它锁的是 `src/canon/registry.ts` 的文本哈希,不是系统提示词。

## 1. 版本

| 项 | 值 |
| --- | --- |
| 文档版本 | **RT-SYSTEM v1.0**(首版,无上一版) |
| 落仓日期 | 2026-11-14(Asia/Shanghai) |
| 工作区 / HEAD | `D:\code_space\hackton\gazer` · `main` · `d8cdc5e` |
| 来源 | 票 0071(T9 文档口径统一)、裁决 0018 ①、`EXECUTIVE_SUMMARY.md` §6.0①、③ `TRACEABILITY_MATRIX.md` §2.3 C1 / Top10 #9 |
| 对应常量 | `vite.config.ts:22-30`(常量本身未带版本标记,本文为其首个版本锚点) |
| 状态 | `versioned-design-text`(设计文本已落仓;运行时常量不变) |

> 与 `canon.lock` 的 `v2-partial` 不是同一版本体系,勿混用;本文不涉及正典冻结文本。

## 2. 与 `vite.config.ts:22-30` 的逐字对照

下方代码块为 `vite.config.ts:22-30` 的**逐字转录**(未作任何转义、改写或省略;块内每行对应文件的一个行号,顺序自上而下 `:22` → `:30`):

```ts
const RT_SYSTEM = [
  "You are the roundtable director of a creature-observer game.",
  "Reply with ONLY one JSON object, no prose and no code fences:",
  '{"scene":[{"speaker":"<creature id>","text":"<one spoken line>","intent":"observe|deceive|query|confide|accuse|comfort","mood":"curious|sad|loving|wrong|hungry","memoryRef":"<id of the memory you cite>"}]}',
  "Rules: 2 to 4 turns; every speaker must be a CREATURE id from the context;",
  "every memoryRef must be a memory id printed inside that speaker's own block;",
  "the spoken text must share at least two content words with the cited memory;",
  "if the context carries a LANGUAGE section, write every turn's text in that language.",
].join(" ");
```

| 行 | 该行的语义角色 |
| --- | --- |
| `:22` | 常量声明 `const RT_SYSTEM = [` |
| `:23` | 身份设定句 |
| `:24` | 输出格式禁令(仅一个 JSON 对象、无散文、无代码围栏) |
| `:25` | 输出 schema 示例(含 `intent` / `mood` 枚举占位与 `memoryRef`) |
| `:26` | 规则 A:2–4 轮;speaker 必须是 context 中的 CREATURE id |
| `:27` | 规则 B:`memoryRef` 必须来自该 speaker 自己记忆块里打印的 id |
| `:28` | 规则 C:台词须与被引记忆共享至少两个内容词 |
| `:29` | 规则 D:context 带 `LANGUAGE` 段时按该语言书写 |
| `:30` | `.join(" ")`:以单个空格拼成一条字符串 |

**拼装结果**(数组以单个空格 join,即 `vite.config.ts:143` 注入的 system content):

```text
You are the roundtable director of a creature-observer game. Reply with ONLY one JSON object, no prose and no code fences: {"scene":[{"speaker":"<creature id>","text":"<one spoken line>","intent":"observe|deceive|query|confide|accuse|comfort","mood":"curious|sad|loving|wrong|hungry","memoryRef":"<id of the memory you cite>"}]} Rules: 2 to 4 turns; every speaker must be a CREATURE id from the context; every memoryRef must be a memory id printed inside that speaker's own block; the spoken text must share at least two content words with the cited memory; if the context carries a LANGUAGE section, write every turn's text in that language.
```

对照结论:本文与常量**逐字一致,0 差异**;`CONTEXT.md` / `HARNESS.md` 无系统提示词正文,故不存在「第二套口径」。已落仓的 prompt 片段(记忆序列化行 / 巩固行 / BUDGET 行 / 25 词截断 / 40 分钟台词)与 `CONTEXT.md` 的逐字冲突仍为 0(③ `TRACEABILITY_MATRIX.md:135-142`、`:304`)。

## 3. 输出 schema(模型必须返回什么)

- **唯一输出**:一个 JSON 对象,无散文、无代码围栏(`:24`);`vite.config.ts:171-177` `extractJsonObject` 只把解析后的 scene 对象回传,原始模型文本(fences / prose / 泄漏片段)进不了游戏。
- 顶层键 **`scene`**:数组,`2..4` 个 turn(`:26`;`src/sim/roundtable.ts:17-18` `MIN_TURNS = 2` / `MAX_TURNS = 4`;`CONTEXT.md:149` BUDGET 行同口径)。
- 每个 turn 的字段(与 `src/sim/roundtable.ts:5-11` `RoundtableTurn` 一一对应):

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `speaker` | `CreatureId`(字符串) | 必须是 context 里出现的 **CREATURE id**(`:26`);`validateTurns` 以 speaker 索引本人记忆切片(`src/director/roundtable.ts:145-155`)。 |
| `text` | `string` | 一句台词;须与被引用记忆共享 ≥2 个内容词(`:28`)。 |
| `intent` | 枚举 | `observe` / `deceive` / `query` / `confide` / `accuse` / `comfort`(`:25`;`src/sim/roundtable.ts:3` `TurnIntent`)。 |
| `mood` | 枚举 | `curious` / `sad` / `loving` / `wrong` / `hungry`(`:25`;`src/sim/types.ts:26` `Mood`、`src/director/roundtable.ts:30` `MOODS`、`src/director/context.ts:74` 同值)。 |
| `memoryRef` | `string` | 必须引用该 speaker 自己记忆块里打印出的 memory id(`:27`)。 |

- **解析契约**:`parseRoundtable`(`src/director/roundtable.ts:81-105`)全有或全无、任意 JSON 不抛错;`validateTurns`(`:164-180`)逐 turn 校验,不合规者从该 speaker 自己的 `manualPool` 替换或丢弃,整场无存活 turn 时返回 `null` 回落 manual pool。
- **语言**:若 context 带 `LANGUAGE` 段,所有 turn 的 `text` 用该语言书写(`:29`)。
- **预算 / 降级**:`HARNESS.md:93-105` 五档路由 + `llm:budget` 前置;`ARCHITECTURE.md:325` 硬预算 15 次/30 分钟(裁决 0018 ③,`src/bridge/index.ts:15-16` 的「soft」不构成规范)。失败 / 超时 / 校验失败一律回落 `manualPool`(`src/director/manual.ts`),不显示为错误。

## 4. memory-ref 规则(最容易被拆穿的一层)

1. **只引自己的**:`memoryRef` 必须是「该 speaker 自己记忆块里打印的 id」(`:27`;`CONTEXT.md:90`「A turn whose `memoryRef` is absent from the speaker's slice is replaced by a `manualPool` line」)。实现:`hasMemoryRef` → `isGrounded`(`src/director/roundtable.ts:145-155`),`slices[turn.speaker]` 无该 id 即判不合规。
2. **≥2 内容词**:台词须与被引记忆共享至少 2 个内容词(`:28`;`MIN_SHARED_WORDS = 2` at `src/director/roundtable.ts:33`,`sharesEnoughWithMemory` at `:130-143`)。这是防止「合法 ID + 越界台词」的回查,对应 `ONTOLOGY.md:233` 的已知局限缓解。
3. **`cons_` 前缀按一手接受**:巩固记忆的 `cons_` 引用等同亲见(`CONTEXT.md:47`;`src/sim/memory.ts:43-48` `hasMemoryRef`)。
4. **替换,不静默放行**:不合规 turn 由该 speaker 自己的 `manualPool` 行确定性替换(`src/director/roundtable.ts:117-128` 用 FNV 哈希选行),没有池则丢弃;整场为空 → `null` → 回落 manual pool(`:157-180`)。
5. **BUDGET 行同源**:`src/director/context.ts:317` 组装的 `BUDGET` / `2..4 turns | cite only your own memoryRef | mood from: <MOODS>` 与 `CONTEXT.md:149` 逐字一致,是上述约束在用户侧上下文里的复述;改 schema 必须同时核对这三处(`vite.config.ts:22-30` / `src/director/context.ts:317` / `CONTEXT.md:149`)。
6. **红线 2 状态(2026-11-14 更新)**:keyword blocklist 与 `Invalid JSON → retried once` 已由票 0067 落地为纯函数(`src/director/filter.ts` 的 `filterPayload`/`askWithFallback`、`src/director/client.ts` 的 opt-in `retries`/`payloadFilter`,`tests/director-filter.test.ts` 33 例);并由票 0066/0067 第三批在 `src/game.ts` 完成运行时接线(`createDirectorClient` 传 `retries:1` + `payloadFilter:filterPayload`,`resolveRoundtableScene` 走 `askWithFallback` 回落 manualPool,`tests/game-llm-wiring.test.ts` 14 例)。按 0017,须「静态单测 + 运行时接线 + 集成测试」三者齐备方可称红线 2 在运行时生效;浏览器实机表现仍属动态证据,不由本文销账。

## 5. 变更影响面:改 RT-SYSTEM 契约时须同步什么 / 核对哪些测试

> 现状事实:全仓 `tests/` 未直接 import / 读取 `vite.config.ts:22-30`(`grep 'vite.config\|RT_SYSTEM\|extractJsonObject\|llmAdapter'` 在 `tests/` 零命中)。即**常量本身当前没有 CI 断言**——这是「只缺登记」的正面证据,也是本文要补的锚点。下列测试锁定的是 schema 的**代码侧实现**,改常量时必须同步核对:

| 面 | 文件 / 位置 | 锁定的契约 |
| --- | --- | --- |
| 常量 + 注入 | `vite.config.ts:22-30`、`:141-146` | 8 行字符串、`role: "system"` 注入 |
| 解析 / 校验 | `src/director/roundtable.ts:81-105`、`:130-180` | `scene` 全有或全无、`memoryRef` 存在性、`MIN_SHARED_WORDS=2`、替换 / 回落 |
| turn 形状 | `src/sim/roundtable.ts:3-18`、`src/sim/types.ts:26`、`src/director/context.ts:74,317` | intent / mood 枚举、`MIN_TURNS=2` / `MAX_TURNS=4`、BUDGET 行 |
| 上下文文档 | `docs/design/CONTEXT.md:90,149`、`docs/design/HARNESS.md:93-105` | memoryRef 规则与 BUDGET 行的文档口径 |

**变更时需重跑的定向测试**(均为上面契约的 CI 落点):

| 测试文件 | 关联点 |
| --- | --- |
| `tests/director-roundtable.test.ts` | `parseRoundtable` / `validateTurns` / `memoryRef` 缺失与越界 / fast-check 任意 JSON / `MIN_SHARED_WORDS` 替换语义(`:49-264`) |
| `tests/director-context.test.ts` | 600 token 预算、BUDGET 行 2..4 turns、mood 值域、逐字序列化 |
| `tests/director-verify.test.ts` | `TurnIntent` / `memoryRef` / verdict 聚合(`:4,:29,:122`) |
| `tests/game-wiring.test.ts` | `RoundtableTurn` 形状(`:3,:57-58`) |
| `tests/ui-dialogue.test.ts` | `RoundtableTurn` / `memoryRef` 渲染(`:3,:27,:91,:201`) |
| `tests/awakening.test.ts` | 圆桌触发链与 E3/E5 让位(`:204-249`) |
| `tests/director-router.test.ts` | roundtable 路由(`:40` 锁定 `timeoutMs=800`,见 ADR 0019;原 20000 为 playtest 会话级临时绕过,不作产品配置) |
| `tests/director-manual.test.ts` | manual pool 降级兜底行 |

**不受影响的测试**:`tests/canon-lock.test.ts` 校验的是 `src/canon/registry.ts` 冻结文本与 `canon.lock` 的 SHA-256 逐字 diff(`:148-170`),与系统提示词无关。本文及票 0071 对 `registry.ts` 只改注释、不改任何 `text` 字段,故定向跑该测试的目的是**确认冻结文本零漂移**,而非验证 RT-SYSTEM 契约。

**建议(不在本票实施)**:若将来要让常量本身可 CI 校验,可在 `tests/` 新增一条读取 `vite.config.ts:22-30` 与本文 §2 逐字对照的断言;本票授权范围不含 `tests/`,仅登记为后续项。

## 6. 纪律自检

- 本文为**只读转录 + 登记**:未修改 `vite.config.ts`、`src/`、`tests/`、`canon.lock`、任何正典冻结文本。
- 未新增外部产品名;prompt 正文为既有常量的逐字转录,不含新增产品内容。
- 机器面(version / status / source / head / ticket / ruling / schema 字段名)用英文,正文中文。
- 依据裁决 0018 ①「以 ② 实测为准,但版本化落仓设计文本仍缺」:本文承接后者,前者保持不动。
