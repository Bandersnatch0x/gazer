# GAZER 设计审计报告(DESIGN_AUDIT)

审计范围:`docs/design/`(ARCHITECTURE / ONTOLOGY / CONTEXT / HARNESS)、`docs/submission/`、`docs/agents/`、`.kiro/`(requirements + steering)、`src/`、`tests/` 全量交叉比对。
审计日期:2026-12,提交前内审。

---

## 1. 总评分

**总分:76 / 100**(权重:模拟 30% · LLM 30% · 体验 20% · 工程 20%)

| 维度 | 得分 | 评语 |
| --- | --- | --- |
| 模拟层 | **85** | 纯 reducer、种子化 PRNG、流言失真、两层记忆、hook 注册表全部实现且有测试(fast-check 覆盖重放等价)。扣分:`hatchFromEgg` 基因组接线缺陷使「繁殖=延续」在引擎内不成立;`WorldState.belief` 缺位。 |
| LLM 层 | **74** | 设计几乎完备:圆桌校验器、Level B、600 token 组装、15 次/30 分预算、路由五档;`src/director/context.ts` 与 `verify.ts` 已落地。扣分:`SwarmBelief` / `PlayerModel` / `RunMemory` 零实现,RT-SYSTEM 无版本化文本,关键词重叠阈值无数值。 |
| 体验层 | **52** | 核心循环可玩(喂食/求偶/孵化选择/瞳孔特写),但全部演出节奏件缺文档:觉醒台词表、GV 七档解锁节奏、12 种互动、环境系统、家谱、Ghost Archive、NG+ 细节、第 40 分钟脚本台词。 |
| 工程层 | **88** | 文档纪律罕见地好:诚实隔离框架、七条红线、「不可执行的宣称不进文档」、`npm run check` 门槛。扣分:文档-代码三处漂移(见矛盾清单)、checklist 悬空引用。 |

---

## 2. 完整度清单(27 项)

判定:✅ 完整 · ⚠️ 部分/有瑕疵 · ❌ 缺失。行号指 `docs/design/` 下文件,代码指 `src/`。

### A. 设计完整度(19 项)

| # | 项 | 判定 | 位置 |
| --- | --- | --- | --- |
| D01 | 核心主张与设计公理 | ✅ | ARCHITECTURE.md:7-21 |
| D02 | 三层架构与层边界 | ✅ | ARCHITECTURE.md:36-52 |
| D03 | GV 可逆 / 本体论不可逆双层 | ✅ | ARCHITECTURE.md:23-34 |
| D04 | 三轴本体论(Kind / Persistence / Epistemic) | ✅ | ONTOLOGY.md §1 |
| D05 | 实体表与位移表(含证据文案) | ⚠️ | ONTOLOGY.md §2-3(玩家 kind 越出 EntityKind,见 C6) |
| D06 | 玩家自身本体条目 | ✅ | ONTOLOGY.md §4 |
| D07 | 提示词基因组 schema 与存档 | ✅ | ARCHITECTURE.md:108-133 |
| D08 | 繁殖遗传公式(性状均值/单性状滑落 ±0.2/漂移缩至 3/秘密 30%) | ❌ | 文档无;仅 `src/sim/breed.ts` 实现 |
| D09 | 求偶链路与孵化选择(willingness 公式/8 tick/上限 4/四选择) | ❌ | 文档无;仅 `src/sim/engine.ts` + `src/ui/copy.ts` |
| D10 | 私有记忆两层结构(working ≤60 / consolidated ≤12) | ✅ | ARCHITECTURE.md:135-176;ONTOLOGY.md §6 |
| D11 | 巩固与 retire 裁决(session:end、代码永不删除) | ✅ | ARCHITECTURE.md:174;`src/sim/consolidate.ts` |
| D12 | 流言传播与三种失真(2 格/4s/0.9−bias/0.3·0.2·0.1) | ✅ | ARCHITECTURE.md:166-168;`src/sim/gossip.ts` |
| D13 | 圆桌单调用多说话者 + memoryRef 硬校验 | ✅ | ARCHITECTURE.md:178-207 |
| D14 | Level B 独立验证(deceive/accuse/stage≥3/每场景一次) | ✅ | ARCHITECTURE.md:209-221;ONTOLOGY.md §10 |
| D15 | 上下文组装 600 token 预算表 | ✅ | CONTEXT.md §1-7 |
| D16 | 打分公式与降级顺序 | ⚠️ | CONTEXT.md §3/§8(公式齐全;缓存键口径矛盾,见 C4) |
| D17 | Hook 生命周期(12 点/声明表/同步 ≤5ms) | ✅ | HARNESS.md;`src/sim/hooks.ts` |
| D18 | 模型路由五档与预算(800/1200/2000/600ms,15 次/30 分) | ✅ | HARNESS.md |
| D19 | 演出与体验件(觉醒台词表、GV 20-80 解锁节奏、12 种互动、季节/天气环境、家谱、Ghost Archive、NG+ 细节、RT-SYSTEM 全文、音频设计) | ❌ | 全部缺失(音频仅 ARCHITECTURE.md:334 一行) |

### B. 实现核验(8 项)

| # | 项 | 判定 | 位置 |
| --- | --- | --- | --- |
| I01 | 效应原语代码一致性 | ⚠️ | 文档 19 种 vs `src/sim/effects.ts` 16 种;shell 3 种在 `src/render/effects.ts:25-31`(见 C1) |
| I02 | WorldState / CreatureState 字段一致性 | ❌ | `belief`、`memory`、`impression` 文档有、代码无(见 C2/C3) |
| I03 | 两层记忆 + retire 实现 | ✅ | `src/sim/memory.ts` + `consolidate.ts` + 测试 |
| I04 | Hook registry 实现(12 点 + 首注册表) | ✅ | `src/sim/hooks.ts` + `tests/sim-hooks.test.ts` |
| I05 | 繁殖链路实现 | ⚠️ | 求偶/产蛋/孵化测试齐全,但 `hatchFromEgg` 读新生物自身 genome,`hybridize` 未接入(见 I05 细节,缺口 G2) |
| I06 | Level B 实现 | ✅ | `src/director/verify.ts` |
| I07 | 上下文组装器实现(600 token、逐字保留、降级) | ✅ | `src/director/context.ts` |
| I08 | SwarmBelief / PlayerModel / RunMemory / NG+ / TTS Stage 3 / 静默 40 分钟台词 | ❌ | 仅类型层;运行时零落点 |

---

## 3. 缺口清单(按严重度排序)

### [阻断开发]

- **G1|导演层无处落地**:ARCHITECTURE.md:104 声明 `WorldState.belief: SwarmBelief`,但 `src/sim/types.ts` 的 `WorldState` 没有该字段;`PlayerModel` / `RunMemory` 同样只存在于文档。群体信念耕种、导演对玩家的模型、NG+ 三条核心卖点全部没有数据落点。
- **G2|杂交基因从未进入世界**:`src/sim/engine.ts:379` 的 `hatchFromEgg` 调用 `applyHatchChoice(state.creatures[event.creatureId]?.genome, …)`——此时新生物尚不存在,genome 恒为 undefined,实际永远使用 seed_alpha 基底。`hybridize()` 已实现并有测试,但从未被 reducer 调用;「它还活在后代的 lineage 里」在引擎内不成立。
- **G3|演出节奏无规格**:觉醒事件台词表与 GV 七档(20/30/40/50/60/70/80)解锁节奏表缺失,意味着异常密度与恐怖节拍只能临场拍板;D19 其余件(12 互动、环境、家谱、Ghost Archive、NG+ 细节)同样无文档,后续任何实现都没有可对照的规格。

### [影响质量]

- **G4|效应原语三处口径不一**:文档 19 种 / sim 16 种 / render 3 种,引擎侧「只接受目录内 kind」的宣称在字面上为假(见 C1)。
- **G5|RT-SYSTEM 无版本化文本**:自迭代叙事已在 HARNESS.md:123 被否决并记录,但圆桌的系统提示词没有落仓的定稿文本——校验器校验的是输出,提示词本身无版本控制。
- **G6|静默运行第 40 分钟脚本台词未定稿**:R6.2 与 HARNESS 均引用该台词,内容在全部文档中缺失。
- **G7|关键词重叠阈值无数值**:ONTOLOGY.md §10 与 requirements R4.5 依赖该检查,但阈值、分词规则只有一句描述。
- **G8|manualPool 最低容量只在代码**:`MANUAL_POOL_CAP = 10`(`src/sim/breed.ts:9`)约束的是杂交时合并池的上限,「每只生物兜底池至少多少条、内容如何产生」无任何文档规定。

### [可后补]

- **G9|Mood / Stage / CreatureBehavior / HatchChoice / EndingId 等类型只在代码定义**,文档引用 `Mood`(ARCHITECTURE.md:187)却无值域表;CONTEXT 仅在示例里给出 `curious,sad,loving,wrong,hungry`。
- **G10|音频设计无文档**:红线与 tech stack 声明「程序化 WebAudio」,但音景分层(`audio_drop_track` 的 track 清单、异常音规则)为空白。
- **G11|checklist.md:21 悬空引用**:"Part IX additions" 指向的规格文件不在仓库内(grep 全仓仅此一处),且该句自相矛盾(见 C7)。
- **G12|Demo 视频**:提交清单唯一 todo 项。

---

## 4. 矛盾清单(逐条附两处原文)

**C1|效应原语目录数量:文档 19 种 vs 可执行目录 16 种**
- ARCHITECTURE.md:245-250 — `| { kind: "favicon_eye"; intensity: number } | { kind: "title_mutate"; text: string } | { kind: "outside_eyes"; opacity: number };` … "The executable catalogue is `src/sim/effects.ts`. The engine accepts only these kinds"
- `src/sim/effects.ts:24` — union 止于 `| { readonly kind: "cursor_pull"; readonly creatureId: CreatureId; readonly strength: number };`(共 16 种;三个 shell 效应实际定义在 `src/render/effects.ts:25-27` 的 `SHELL_EFFECT_KINDS`)。README 同样写「那 16 种」,与文档互斥。

**C2|`WorldState.belief` 文档有、代码无**
- ARCHITECTURE.md:104 — `readonly belief: SwarmBelief;`(位于文档 WorldState 内)
- `src/sim/types.ts:67-78` — 字段列表止于 `readonly silent: boolean;`,无 belief。

**C3|`CreatureState.memory` / `impression` 文档有、代码无**
- ARCHITECTURE.md:86-88 — `readonly memory: MemorySlice;` / `readonly impression: number;  // -1..1, personal trust of the player`
- `src/sim/types.ts:30-48` — CreatureState 只有 stats/behavior/trait/position/palette/mask/hatchedAtTick/name/willingness/courtshipTicks/genome。

**C4|缓存键两种口径**
- ARCHITECTURE.md:325 — "Cache key `stage + trigger + hash(state)`"
- CONTEXT.md:170 — "key = stage + trigger + hash(serialised context)"

**C5|目击状态字段值域:`direct` vs `witnessed`**
- ARCHITECTURE.md:145 — `readonly witnessed: "direct" | "heard" | "inferred";`
- ONTOLOGY.md:46-51 与 `src/sim/memory.ts:3` — `type EpistemicStatus = "witnessed" | "heard" | "inferred" | "fabricated";`;`gossip.ts:91,101` 实际写入 `"witnessed"`。

**C6|玩家的 kind 越出 EntityKind 值域**
- ONTOLOGY.md:69 / :108 — 实体表 `| Player | keeper | record | 3 |` 及 `readonly kind: "keeper" | "subject" | "record";`
- ONTOLOGY.md:16-22(与 ARCHITECTURE.md:61、`src/sim/ontology.ts:3` 一致)— `type EntityKind = "pet" | "organism" | "observer" | "record" | "substrate";`——`keeper` / `subject` 不是合法 EntityKind。

**C7|checklist 自相矛盾 + 悬空引用**
- `docs/submission/checklist.md:21` — "the Part IX additions (hook harness, two-layer memory, Level B verification) add a real 6 to 8 days of work. The schedule is not unchanged."(加了 6-8 天工作量,却又称「日程不变」)
- 同文件上下文 / 全仓 grep:被引用的 "Part IX" 规格文件不存在于仓库任何位置,引用无着落。

---

## 5. 建议的最小补丁列表

| # | 补丁 | 补进哪里 |
| --- | --- | --- |
| P1 | 效应 union 拆注为 sim 16 种 + shell 3 种,把 "The executable catalogue is src/sim/effects.ts" 改为同时列出 `src/render/effects.ts` 的 `SHELL_EFFECT_KINDS`,消除 C1。 | ARCHITECTURE「Effect primitives」 |
| P2 | 在 WorldState / CreatureState 类型旁加「v3 未落地字段」注记,将 `belief` / `memory` / `impression` 标为设计目标,声明运行时以 `src/sim/types.ts` 为准。 | ARCHITECTURE「Creature and world」 |
| P3 | 让 `Egg` 携带双亲 genome,`hatchFromEgg` 以 `hybridize(genomeA, genomeB, seed)` 为基底再叠加孵化选择;补一条测试断言后代 lineage 含双亲 id。 | `src/sim/engine.ts`(代码补丁,同时回填 D08/D09 文档) |
| P4 | 缓存键统一为 `stage + trigger + hash(serialised context)`,以 CONTEXT 为准修改 ARCHITECTURE。 | ARCHITECTURE「Cost」↔ CONTEXT §9 |
| P5 | MemoryEntry 的 `"direct"` 改为 `"witnessed"`,与 ONTOLOGY §1、`memory.ts`、gossip 写入值三方对齐。 | ARCHITECTURE「Private memory」 |
| P6 | 给 EntityKind 增补 `"keeper" | "subject"`(注明仅 Player 使用),或把实体表 Player 行改为合法 kind 值;同步 `src/sim/ontology.ts` 的 `playerKind` 注释。 | ONTOLOGY §1/§2/§4 |
| P7 | 新增演出规格文档:七次 GV 跨越的觉醒台词表 + 20-80 解锁节奏表 + 12 种玩家互动清单,逐条挂机械钩子,满足「不可执行的宣称不进文档」。 | 新建 `docs/design/EXPRESSION.md`,ARCHITECTURE 加索引行 |
| P8 | 定稿并落仓:静默运行第 40 分钟脚本台词 + RT-SYSTEM 圆桌系统提示词全文(版本化,注明被否决的自迭代边界)。 | HARNESS.md 新增「Scripted text」节 |
| P9 | 删除或改写 "Part IX" 引用,并把该行修正为与提交日程一致的中性描述。 | `docs/submission/checklist.md` |
| P10 | 把关键词重叠阈值写成数值(建议 0.3,词元级 Jaccard),并与上下文打分的 relevance 分词器共用同一实现,满足 R4.5 可测性。 | ONTOLOGY §10 + CONTEXT「relevance」 |

---

*报告由设计审计生成;所有行号以审计时点文件为准。*
