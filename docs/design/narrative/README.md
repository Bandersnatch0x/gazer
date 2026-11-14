# NARRATIVE-CORE 正典文本规范入库评审记录

NARRATIVE-CORE-01(1997 八碎片与真结局录音,P0 收官)与 NARRATIVE-CORE-02(觉醒事件七件套台词冻结稿,P1 canon 层收官)经评审后入库本目录,定稿即冻结。

## 评审结论

**通过,带修订入库(修订不触碰任何冻结文本本身,只修时间线笔误与实现口径)。** 两文档与四锚点美术、FX 原语库的联动点全部对得上:E3↔ART-CORE-02 §6.1、E5↔§6.2、E7↔§6.4+ART-CORE-04、E1↔ART-CORE-01 GV12、E2↔C-02、录音④↔C-06、W 组↔FX W-01–W-04。冻结协议(canon.lock SHA-256 + 存档携带 + 旧档保旧文本)可执行。

## 修订记录

| # | 级别 | 内容 |
|---|---|---|
| N1 | P0 笔误修正 | 刻符可见性时间线与 ART-CORE-03 §3.2 塔状态表对齐:刻符首现 = **T3/GV75**(原文写 T2/GV70;T2 的正典新增元素是顶点高光,塔 CI 项 2/5 依赖此表),F1–F3 gating 改 GV75;T5/GV90 5 枚、T6/GV100 8 枚不变。E6 注解同步标注。若用户倾向「刻符提前到 GV70」,须出 ART-CORE-03 v2 连带改塔 CI——列入待裁批次。 |
| N2 | 通道澄清 | 「固定 70ms/字符匀速打印」仅限正典打印通道([SYSTEM] 机器背诵);ART-CORE-02 §4.2「禁匀速」令只约束 LLM 台词通道。两通道并行不冲突,已标注进两份规范。 |
| N3 | 例外登记 | E4「注视塔 2s」登记为 ART-CORE-03 §6.4 的**正典例外,全存档恰 1 次**(CI 已含断言);个体停在缓冲区边缘,不触塔 CI 项 7 寻路禁区。 |
| N4 | 待补登记 | canon.lock 总登记表中「关系清算 5 行」「特殊周目 4 行」出处为会话外 v3/v3.5 文档,本仓现无全文;落地时先落 v3 冻结稿逐字转录,缺源行登记待补,canon.lock 首版仅含已落行、补齐后重算哈希(票 0028 跟踪)。 |
| N5 | 落点裁定 | `canon.lock` 与 registry 的仓内落点 = `src/canon/`(registry 数据 + lock 文件),不新增根级杂项目录;CI 从 `src/canon/` 读取比对。 |
| N6 | 后置登记 | 真结局录音 TTS(语速 0.85)与多声部依赖音频层,随票 0026 后置;录音结构文本行(头/尾/`now we keep you.`/`divergence:` 模板)先入 registry 冻结。 |
| N7 | 外部名扫描 | 全文无外部产品名,通过;datamining/TTS/BIOS 为技术词豁免。 |
| N8 | N4 收口+插槽裁定(2026-11-13) | 用户交付 v3 §5.6/§5.4 逐字原文,N4 全闭合:NG+ 开场冻结为骨架 `You came back. {id} still asks about you. We kept its spot empty.`(原稿 07 为示例值,正典插槽 = 存档中最具戏剧性个体 id);幽灵模板 `Before us, someone fed us. They called themselves {ghost_name}. They once {ghost_signature_moment}.`——`{id}/{ghost_name}/{ghost_signature_moment}` 均为运行时插槽,哈希只锁骨架占位符,插槽内容不入 diff。§5.5 引用玩家原话的行为为动态设计描述,非台词本体,不入 canon。canon.lock 44 条目,PENDING 清空。 |

## 待裁默认项(按推荐执行,用户可一句推翻)

1. **N1** 刻符首现 T3/GV75(替代方向:提前 T2/GV70,须连带 ART-CORE-03 v2 与塔 CI 改)。
2. **N5** canon 落点 `src/canon/`(替代方向:`public/canon/`——数据进运行时载荷,不推荐,离线包体积与篡改面增大)。
3. **N4** v3/v3.5 缺源行待补(替代方向:由智能体起草候选交用户裁——文字地位不同,不推荐;请用户供 v3/v3.5 冻结稿原文)。

---

## 运行时状态说明(票 0071 / 裁决 0018 ④,2026-11-14 追加)

> 本节是**运行时事实登记**,不是新裁决,也不重写上文任何既有条目(N1–N8 / 待裁默认项)。按 `docs/agents/decisions/README.md:5`「已确认的裁决与产出相悖时不得静默推翻,显式标出相悖点交用户裁」与 `docs/agents/decisions/0018-intergroup-rulings.md:14`(④)执行:只登记运行时事实与相悖点,**不改写 0012 / 0013 正文、不改 N4 / N8 既有条目、不改 `canon.lock` 与任何冻结文本或哈希**。本节由票 0071 追加。

### 运行时事实(实开核对,HEAD `d8cdc5e`)

| 项 | 运行时值 | 证据 |
| --- | --- | --- |
| 版本 / 算法 | **`v2-partial`** / `sha256` | `src/canon/canon.lock:3-4`;`src/canon/registry.ts:520` `CANON_LOCK_VERSION` |
| 条目数 | **45 条** | `src/canon/canon.lock:5` `entries: 45`、`:6-50` 恰 45 行哈希;`src/canon/registry.ts:208-360` `CANON_REGISTRY` |
| 组数 | **8 组**(`fragment` 8 / `recording` 3 / `terminal` 8 / `webapi` 4 / `frame` 3 / `awaken` 10 / `consolidation` 5 / `special-loop` 4) | `src/canon/canon.lock:6-50`;`src/canon/registry.ts:208-360`,其中 `special-loop` 四条组名逐字见 `:341`/`:346`/`:351`/`:356` |
| `CANON_PENDING` | **空数组 `[]`** | `src/canon/registry.ts:367`;`tests/canon-lock.test.ts:217` `expect(CANON_PENDING).toHaveLength(0)` |
| 每条带 `source:` | 45 条逐条登记来源 | `src/canon/registry.ts:209-359` |
| CI 逐字 diff | **0**(含标点与 E1 空串) | `tests/canon-lock.test.ts:148-156` 逐 key `sha256Hex(text) === lock hash`;`:158-163` `serializeCanonLock(computeCanonLock()) === readFileSync(canon.lock)`;`:208` E1 空串 SHA-256 标准值 |
| N4 代码 / CI 侧 | 「fully resolved (2026-11-13)」 | `src/canon/registry.ts:363-367`;`tests/canon-lock.test.ts:212-232` |
| 完整性边界 | 靠 CI(`tests/` 读文件)校验,非运行时启动阻断 | `src/` 运行时无 `readFileSync` 启动阻断 |

> 与旧版「v2 全量 / 8 组」理解不同:当前是 **`v2-partial` / 45 条 / 8 组**;「8 组」是分组口径,「45」是条目数口径,二者不矛盾。

### 相悖点显式登记(不静默推翻、不改写原文)

| # | 既有记录(原文要点) | 与运行时事实相悖处 |
| --- | --- | --- |
| P1 | `docs/agents/decisions/0012-ruling-batch-approved.md:13`「**N4**:缺源 9 行(关系清算 5 + 特殊周目 4)待用户供 v3/v3.5 冻结稿原文后逐字转录并重算 canon.lock——**用户侧待办,非阻塞**」 | 运行时 `CANON_PENDING=[]`、45 条逐条带 `source:`、代码/CI 记 N4 fully resolved;「待供」与「已冻结」状态相悖 |
| P2 | `docs/agents/decisions/0013-art-review-disposition.md:13`「**N4 同日终闭合**(canon.lock **44 条目**,见票 0028 Log)」 | **44 vs 45** 条目数相悖;且「N4 终闭合」与 0012:13 的「待用户供」相悖 |
| P3 | 本文件 `:20`(N8)「N4 全闭合 … **canon.lock 44 条目**, PENDING 清空」 | **44 vs 45** 条目数相悖;「PENDING 清空」与运行时 `CANON_PENDING=[]` 一致 |
| P4 | 本文件 `:16`(N4)「canon.lock 首版仅含已落行、补齐后重算哈希(**票 0028** 跟踪)」 | 该条是首版状态的过期快照;且票号与 0018 ④ / 票 0071 所记「**票 0038**」不一致(见下) |
| P5 | `src/canon/registry.ts:161-165` 旧注释「NG+ opening and the ghost template lines have no byte-exact source yet and **stay in CANON_PENDING**」(票 0071 已清理,仅改注释) | 与同文件 `:172-183`「delivered byte-exact by the user 2026-11-13」、`:363-367`「fully resolved / `CANON_PENDING = []`」自相矛盾 |

**票号口径并存**:`:16`(N4)与 `0013:13` 记「票 0028」,`0018:14` 与票 0071 记「票 0038」。本节**不统一、不改写**,两处并存,一并交用户裁。

### 裁定边界与交用户裁

- **0012 N4 是否闭合属用户侧待办(票 0038),交用户裁**。依 `docs/agents/decisions/0018-intergroup-rulings.md:14`④ 与 `docs/agents/decisions/README.md:5`,本节及票 0071 **不把 0012 的 N4 用户侧待办判为已闭合**,也不改写 0012 / 0013 正文或本文件 N4 / N8 条目。
- 本节只做运行时状态说明;`docs/design/RT-SYSTEM.md`(版本化设计文本)与 `src/canon/registry.ts:161-165` 过期注释清理同属票 0071,均**不改 `canon.lock`、不改任何 `text` 字段、不改 `src/` 其它文件、不改 `tests/`**。
- 可复核交叉引用:`EXECUTIVE_SUMMARY.md:104-114`(N4 三处不一致表)、`REVIEW_CROSSCHECK.md` §4 S9、`TRACEABILITY_MATRIX.md:266-275`(③ §3.4)、`DESIGN_AUDIT.md:206-209`(① C7)。

### 闭合登记(2026-11-14,票 0071 追加 / ADR 0021)

- 用户于 2026-11-14 指认 v3/v3.5 冻结稿出处(Magpie 会话存档 `c_mwbk54a8lt6834.json`),委托逐行核验。结果:**9 行中 8 行逐字一致**(关系清算 5 + reverse_care + ngp_opening(槽位替换已有 2026-11-13 裁定)+ ghost_template);**`special.silent_run` 为仓内演化重写**,草稿原文(en「You turned us off. We can count.」/ zh「你把我们关掉了。我们数得出来。」)已存档于 ADR 0021,冻结文本维持不动,替换属行为变更须另裁。**2026-11-14 用户确认:冻结文本维持、不替换,N4 事项终局**(见 ADR 0021 同日加注)。
- `canon.lock` 版本 `v2-partial` → **`v2`**(仅版本元数据;45 条哈希零改动,`tests/canon-lock.test.ts` 19 例全绿)。决议落 `docs/agents/decisions/0021-n4-closure-canon-v2.md`;上方「裁定边界与交用户裁」条目自此按该 ADR 履行完毕,既有条目文字不改写。
