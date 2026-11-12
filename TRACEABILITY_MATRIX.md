# GAZER v3.5 设计↔代码双向追溯矩阵(只读审查)

审查日期:2026-11-12。
基线:`DESIGN_AUDIT.md`(设计审计,27 项)+ `CODE_AUDIT.md`(代码实现度审查,31 模块 + 16 高危)。
方法:正向追溯(设计→代码)+ 反向追溯(代码→设计)。**所有 文件:行号 均为本轮实际打开文件核对后的当前行号**(注:两份基线报告中的行号相对当前工作区已有漂移,本矩阵行号为准)。

状态定义:
- **已实现** = 设计项在运行时主循环真实生效(已接线,可演示);
- **部分** = 代码模块存在(常有测试),但未接入运行时主循环或覆盖不全;
- **缺失** = 设计与代码双方皆无 / 文档判定缺失;
- **文档超前** = 设计文档判定完整但代码找不到实现;
- **幽灵实现** = 代码公开面在设计文档中找不到出处。

---

## 第一步:正向追溯矩阵(设计→代码)

判定范围:DESIGN_AUDIT §2 全部 27 项(✅ 14 项 / ⚠️ 6 项 / ❌ 7 项,均入矩阵)。

| 设计项ID | 设计章节 | 实现(文件:行,本轮核对) | 状态 | 风险注记 |
| --- | --- | --- | --- | --- |
| D01 核心主张与设计公理 | ARCHITECTURE.md:7-21 | game.ts:175-177(endpoint→client);game.ts:252-271(directLine+manualLine 兜底);game.ts:226(HUD NO SIGNAL/LIVE) | 部分 | 「删掉 LLM 退化为普通宠物游戏」的结构成立;但 buildContext 未接线(C5),LLM 台词大概率全被 manual 替换,"LLM is the life" 运行时未成立 |
| D02 三层架构与层边界 | ARCHITECTURE.md:36-52 | sim/engine.ts:314-434(纯 reducer step);director/client.ts:65-116;render/app.ts:473(applyInstruction);game.ts:458-462(主循环接线) | 已实现 | 边界干净:sim 层无 Math.random / 无 I/O(grep 核实) |
| D03 GV 可逆 / 本体不可逆 | ARCHITECTURE.md:23-34 | GV:sim/types.ts:83-99(GV_THRESHOLDS+stageForGv)+ engine.ts:424-428(gv 事件 clamp 0..100);本体:sim/ontology.ts:27-35(recordShift append-only) | 部分 | 机制完整,但 ontology 运行时零触发:game.ts:277 是自赋值空操作,recordShift 无任何调用点 |
| D04 三轴本体论 | ONTOLOGY.md §1 | Kind:sim/ontology.ts:3;Epistemic:sim/memory.ts:3;Persistence:src/sim/breed.ts:70(lineage 双亲并集) | 已实现 | 类型与不变式函数齐;kind 轴运行时无位移写入(与 D03 同根) |
| D05 实体表与位移表(⚠️) | ONTOLOGY.md §2-3 | sim/ontology.ts:5-11(OntologyShift 形状) | 部分 | 位移触发表与「证据文案」两侧皆无:无 stage→shift 映射,无 evidence 生成;C6(kind 越出 EntityKind)未修 |
| D06 玩家自身本体条目 | ONTOLOGY.md §4 | sim/ontology.ts:19-21(playerKind/namedAs)+ :23-25(emptyOntology) | 部分 | 仅数据形状;运行时零读写,「被群体命名」事件不存在 |
| D07 提示词基因组 schema 与存档 | ARCHITECTURE.md:108-133 | sim/genome.ts:11-22(PromptGenome 全字段);MAX_DRIFT=8 :24 | 部分 | schema ✅;**存档 ❌**:localStorage 仅存语言键(game.ts:139,466;ui/i18n.ts:14),genomes/*.json 不存在,ARCHITECTURE.md:333 的 Storage 承诺落空 |
| D08 繁殖遗传公式(❌文档无) | —(文档无) | sim/breed.ts:53-78(hybridize:均值 :23-31、TRAIT_MUTATION=0.2 :8、BREED_DRIFT_CAP=3 :6、SECRET_INHERIT_CHANCE=0.3 :7、MANUAL_POOL_CAP=10 :9) | 缺失(文档)/代码超前 | 反向幽灵见 U03;致命接线缺陷:engine.ts:404 hatchFromEgg 读 `state.creatures[event.creatureId]?.genome`(新 id 必不存在)→ 永走 seed_alpha 基底,hybridize 运行时零调用 |
| D09 求偶链路与孵化选择(❌文档无) | —(文档无) | engine.ts:85(willingness 公式)、:89-96(WILLING_AT 70/COURTSHIP_TICKS 8/MAX_EGGS 4)、:111-166(courtshipStep,接线 game.ts:459);孵化四选项 game.ts:534-562 + ui/panels.ts:23-45;self 秘密 engine.ts:257 | 缺失(文档)/代码超前 | 链路在实机可玩;但 forced 孵化无 UI 路径(U03),文档无规格(G3) |
| D10 私有记忆两层结构 | ARCHITECTURE.md:135-176;ONTOLOGY.md §6 | sim/memory.ts:27-33(working 60/consolidated 12);运行时写入:game.ts:377(喂食/清洁)、:428(搬运)、:518(命名),均 slice(-60) | 部分 | working 层已接线 ✅;salience 衰减未实现;consolidated 层运行时永不产生(consolidate.ts 零调用) |
| D11 巩固与 retire 裁决 | ARCHITECTURE.md:174 | sim/consolidate.ts:45-62(fallbackConsolidate top2)、:83-111(applyConsolidation,retire 降级回 working 尾部 :64-76,永不删除 :100-106);测试 tests/sim-consolidate.test.ts | 部分 | 模块+测试完整;session:end 批处理未接线,drift_consolidation/genome_persist hook 无注册 |
| D12 流言传播与三种失真 | ARCHITECTURE.md:166-168 | sim/gossip.ts:6-10(WHISPER_RANGE=2/WHISPER_TICKS=4/BASE_RETENTION=0.9)、:25-29(0.3/0.2/0.1)、:80-105(resolveWhisper:失败存 witnessed+source:null :96-104) | 部分 | 数值与文档逐项一致;**主循环无「2格4秒」调度**,resolveWhisper 零调用(grep 核实) |
| D13 圆桌单调用 + memoryRef 硬校验 | ARCHITECTURE.md:178-207 | director/roundtable.ts:81-105(parseRoundtable 全有或全无)、:163-177(validateTurns,确定性选行 :117-128)、:130-155(isGrounded);sim/memory.ts:43-48(hasMemoryRef 含 cons_);**运行时已接线**:game.ts:261-270 | 已实现(校验器) | 校验器是少数已接线的 LLM 防线;但 game.ts:270 只取 scene[0],2..4 号台词蒸发;buildContext 未接线使模型收不到记忆块(U07 面) |
| D14 Level B 独立验证 | ARCHITECTURE.md:209-221;ONTOLOGY.md §10 | director/verify.ts:36-52(shouldVerify:deceive/accuse+stage≥3+他者在场+每场景一次)、:109-127(applyVerdict:no→换词+原句落 inferred :86-101);测试 tests/director-verify.test.ts | 部分 | 模块完整;运行时零调用——directLine(game.ts:252-271)不读 intent,Level B 是死代码 |
| D15 上下文组装 600 token | CONTEXT.md §1-7 | director/context.ts:35(TOKEN_BUDGET=600)、:217-224(降级梯)、:340-386(buildContext,整只丢弃兜底 :368-382)、:140-147(逐字序列化);测试 tests/director-context.test.ts | 部分 | 实现完整+测试厚;**运行时零调用**(grep `buildContext` 仅定义处) |
| D16 打分公式与降级顺序(⚠️) | CONTEXT.md §3/§8 | context.ts:48-54(权重表)、:99-116(scoreMemory)、:44-45(HALF_LIFE_TICKS=1440) | 部分+数值漂移 | 公式骨架一致;两处数值与文档冲突:①source_penalty 有效贡献 0.5×0.5=0.25 vs CONTEXT.md:69 定义 1(→0.5);②候选记忆 4→3→2(:218-220) vs CONTEXT.md §8 的 3→2→1。缓存键两口径(C4)代码未实现任何一侧 |
| D17 Hook 生命周期 | HARNESS.md §1-4 | sim/hooks.ts:4-31(12 点)、:66-72(首注册表数据化)、:74-79(priority+id 排序)、:92-152(registry,未知点安装期拒绝 :98-100);测试 tests/sim-hooks.test.ts | 部分 | 框架+测试完整;**runPoint/drainAsync 运行时零调用**,game.ts:148-163 注册的 2 个 hook handler 均为空且永不执行;5ms 超限记录未实现 |
| D18 模型路由五档与预算 | HARNESS.md §5 | director/router.ts:30-61(五路由表);client.ts:45-59(同源强制)、:78-113(AbortController 超时) | 部分+数值漂移 | ①**level_b timeoutMs=1500(:53)vs HARNESS.md:102 的 600ms**;②15 次/30min 预算守卫无(budget_guard 无实现,grep 零命中);③缓存(stage+trigger+hash)无;④primary→secondary 多模型链无 |
| D19 演出与体验件(❌) | —(全缺) | 仅残余:onStageChange game.ts:273-285(一句台词+一个效果);awakening_events hook 空(hooks.ts:69) | 缺失 | 觉醒台词表、GV 七档节奏、12 互动、环境、家谱、Ghost Archive、NG+、40 分钟台词、音频、TTS 全部无实现无文档(G3/G6/G10) |
| I01 效应原语一致性(⚠️) | ARCHITECTURE.md:223-250 | sim/effects.ts:3-24(16 种画布)+ render/effects.ts:24-31(SHELL_EFFECT_KINDS 3 种);执行器 render/app.ts:283-370 全 kind;未知 kind 静默丢弃 render/effects.ts:239-243 | 已实现(代码)/文档漂移 | 行为等价,但 ARCHITECTURE.md:245-250 的 19 种 union 与 "executable catalogue is src/sim/effects.ts" 字面为假(C1 未修);3 种 shell 效应无触发路径(U18) |
| I02 WorldState/CreatureState 字段(❌) | ARCHITECTURE.md:80-106 | sim/types.ts:30-48、:67-78 | 缺失(字段) | belief/memory/impression 三字段文档有代码无(C2/C3);运行时以 types.ts 为实,文档未加注记(P2 未做) |
| I03 两层记忆+retire 实现(✅) | — | =D11 同一实现 | 部分 | 模块+测试 ✅,运行时未接线 |
| I04 Hook registry 实现(✅) | — | sim/hooks.ts + tests/sim-hooks.test.ts | 部分 | 同 D17 |
| I05 繁殖链路实现(⚠️) | — | 求偶/产蛋/孵化测试齐全(tests/sim-breeding.test.ts 等);致命缺陷 engine.ts:404 | 部分 | 见 D08 注记;G2 未修 |
| I06 Level B 实现(✅) | — | director/verify.ts | 部分 | 模块 ✅,运行时零调用 |
| I07 上下文组装器实现(✅) | — | director/context.ts | 部分 | 模块 ✅,运行时零调用 |
| I08 SwarmBelief/PlayerModel/RunMemory/NG+/TTS/40min(❌) | ARCHITECTURE.md:265-289 | grep 全 src:零命中 | 缺失 | 三条核心卖点(群体信念耕种/导演玩家模型/NG+)无数据落点 |

### 正向追溯结论

- 14 个 ✅ 项中 **13 项能在代码找到至少模块级实现**(D01 为理念项,映射到接线证据);
- **纯 [文档超前] = 0 项**——没有任何"文档声称完整、代码完全找不到"的设计项;
- 但 ✅ 项中 **11 项是"模块在而主循环断线"**(D03/D10/D11/D12/D14/D15/D16/D17/D18/I03/I06/I07 的运行时形态不成立):`runPoint`、`buildContext`、`resolveWhisper`、`hybridize`、`fallbackConsolidate/applyConsolidation`、`shouldVerify/applyVerdict`、`gvDeltaFor`、`recordShift` 九组函数在 src 内**除定义外零调用点**(grep 全量核实)。设计文档承诺的"恐怖引擎"在实机是断路。

---

## 第二步:反向追溯(代码→设计)——幽灵实现清单

扫描面:src 全部 40 文件的公开导出。可执行公开面 ≈ **212 个**(167 个 `export function/const` + 14 种 SimEvent kind + 19 种 Effect kind + 12 个 lifecycle point)。逐项核对如下。

### U 组:事件类型与死路径(旧版本残留候选)

| # | 幽灵项 | 证据(文件:行) | 注记 |
| --- | --- | --- | --- |
| U01 | `court` 事件定义后无任何调度者 | sim/engine.ts:33(定义);grep `kind: "court"` 仅此一处 | 旧版残留候选:courtshipStep(engine.ts:111)已接管自动求偶,court 事件是死枚举 |
| U02 | `hatch` 事件(无蛋直孵) | sim/engine.ts:43;唯一调用 game.ts:80(初始三只) | 有需求出处(R1.6 防重复 id,requirements.md:19),但设计四件套无此事件;属"半幽灵" |
| U03 | forced 孵化链路整体死路 | types.ts:57(egg.forced)、engine.ts:34(layEgg.forced)、engine.ts:373+157(恒传 false)、ui/copy.ts:127(hatchForcedNote 死文案) | 文档无"强迫配对"规格;玩家永远无法触发,willingness<70 的设计注释(types.ts:42-43)悬空 |
| U04 | 「self 孵化买真结局」悬空引用 | engine.ts:216("buys the true ending" 注释)、:257(秘密台词) | 结局系统为零(CODE_AUDIT #29),该注释是文档外承诺 |
| U05 | Structure.createdBy 的 "script" 变体 | sim/types.ts:64;引擎只写 "director"(engine.ts:278) | 无生产者 |
| U06 | audio 子系统谎言注释 | render/app.ts:320-321("The audio subsystem listens for this") | 该子系统不存在;audio_drop_track 按下不响 |
| U07 | 3 种 shell 效应零触发 | render/effects.ts:24-31;game.ts:209-213 的 handleShellEffect 只接 title_mutate,且无任何代码路径产生 title_mutate/favicon_eye/outside_eyes | favicon 眨眼等"招牌逃生舱"类型齐全、演示不可见 |

### U 组:硬编码数值与文档冲突

| # | 幽灵项 | 证据(文件:行) | 冲突对象 |
| --- | --- | --- | --- |
| U08 | GV 增量双真相:game.ts 内联 7 处,已写好的权重表+夜间倍率零调用 | game.ts:301(凝视+3)、:379-381(点击 4/1)、:429(搬运+1)、:444(瞳孔+3)、:451(发呆+2)、:519(命名+2)、:555(孵化+1);对照 ledger.ts:32-48 | 一致项:stare 3、rapid_click 4、idle 2、feed/clean 1;**冲突项**:搬运 +1 vs `drag_to_hazard` 权重 8(且无 hazard 判定);death 权重 15 无运行时源;夜间 1.5x(R3.3)从未生效(Date.now 未换算 localHour 传入 gvDeltaFor) |
| U09 | Level B 超时 1500ms | director/router.ts:53 | HARNESS.md:102 与 DESIGN_AUDIT D18 均为 600ms |
| U10 | source_penalty 实际贡献 0.25 | context.ts:48-57(权重 0.5 × INFERRED_SOURCE_PENALTY 0.5) | CONTEXT.md:69 定义 source_penalty=1(贡献 0.5) |
| U11 | 候选记忆降级 4→3→2 | context.ts:217-224(DEGRADATION_LADDER 首档 memories:4) | CONTEXT.md §8 为 3→2→1 |
| U12 | seed 1997 硬编码 | game.ts:75 | ARCHITECTURE.md:333 要求 seed 入存档;每局同种子同世界 |
| U13 | 初始基因组 distortionBias=0.15 | game.ts:61、engine.ts:232 | 文档无数值;实际流言保留率 = 0.9−0.15 = 0.75,无任何文档记载 |
| U14 | memoryFor salience 0.5 固定 + valence 手写 | game.ts:120(salience 0.5)、:375/426/516(0.8/0.3/-0.2/0.9) | CONTEXT.md §10 声称 salience/valence 是设计内字段,但取值规则只在代码 |

### U 组:文档无数值的合理内常量(幽灵数值,建议补文档而非改代码)

| # | 项 | 证据(文件:行) |
| --- | --- | --- |
| U15 | STARE_MS=3000 / IDLE_MS=30000 / RAPID_CLICK_WINDOW_MS=1200 / RAPID_CLICK_COUNT=4 | game.ts:44-48 |
| U16 | 四项属性衰减率 0.35/0.2/0.15/0.1 + 喂食+45/+10、清洁+50、玩+15/−8、摸+8 | sim/engine.ts:14-19、:329-351 |
| U17 | MIN_SHARED_WORDS=2(关键词重叠阈值——G7 的答案其实已在代码里) | director/roundtable.ts:33 |
| U18 | INFERRED_SALIENCE=0.5 / INFERRED_VALENCE=−0.5 | director/verify.ts:24-27 |
| U19 | LOW_SALIENCE=0.15 / TOP_N=2(巩固兜底参数) | sim/consolidate.ts:9-11 |
| U20 | MIRROR_WINDOW_MS=6000;MAX_TIMED_EFFECTS=8;MAX_EFFECT_WINDOW_MS=15000;对话抖动 1500-4000ms | render/effects.ts:107;sim/effects.ts:31-32;ui/dialogue.ts:19-20 |

### U 组:结构级幽灵

| # | 项 | 证据(文件:行) |
| --- | --- | --- |
| U21 | sim/roundtable.ts:20-48 重复声明 LifecyclePoint/HookContext/HookDef,且 HookContext 形状(tick/stage/creatureId)与 sim/hooks.ts:33-39(point/tick/state/event/payload)冲突 | 两文件对照;同名类型双声明,CODE_AUDIT #12 |
| U22 | playScript/runPlayback 完整多轮播放器零调用;directLine 只取 scene[0] | ui/dialogue.ts:71、:108;game.ts:270 |
| U23 | 假路径彩蛋 `C:\GAZER\1997\LIVE\roundtable.exe` | ui/copy.ts:11 |
| U24 | SwarmBelief / PlayerModel / RunMemory / voice_degraded / budget_guard / blocklist:文档反复出现,grep 全 src 零命中 | ARCHITECTURE.md:72-76,265-289;HARNESS.md §6;ARCHITECTURE.md:347(红线 2 的 blocklist) |

**幽灵率:20 项(合并 U 组主项)/ 212 可执行公开面 ≈ 9.4%。** 其中真正危险的是 U08/U09/U10/U11(与文档数值直接冲突)与 U01/U05/U06/U21/U22(旧版残留或死路径,评审时易被追问)。

---

## 第三步:prompt 模板与文档逐字 diff

仓库内 **不存在 v3.5 的 Part IV / Part IX 文档**(全仓 glob 核实;`docs/submission/checklist.md:21` 引用的 "Part IX" 规格文件不在仓内 = DESIGN_AUDIT G11)。可执行的 diff 只能对 v3 四件套做,结果如下:

| 模板片段 | 代码 | 文档 | diff 结果 |
| --- | --- | --- | --- |
| RT-SYSTEM(圆桌系统提示词) | **全仓不存在** | HARNESS.md:123 已否决自迭代但要求定稿落仓(G5) | ❌ 双侧皆无;校验器校验输出,提示词本体无版本控制 |
| 记忆序列化行 `[ID|source] "fact" (sal x, val y)` | director/context.ts:140-142 | CONTEXT.md:80-88 | ✅ **逐字一致**(字段名/引号/括号/一位小数格式全同) |
| 巩固行 `always: [cons_XXX] "…"` | director/context.ts:144-147 | CONTEXT.md:44-45 | ✅ **逐字一致** |
| BUDGET 行 `2..4 turns \| cite only your own memoryRef \| mood from: curious,sad,loving,wrong,hungry` | director/context.ts:310-312 | CONTEXT.md:149 | ✅ **逐字一致**;mood 值域与 sim/types.ts:19 一致 |
| 事实截断 25 词 + `...` | director/context.ts:65,122-128 | CONTEXT.md:87 | ✅ 一致(MAX_FACT_WORDS=25) |
| 兜底台词池 65 行 | director/manual.ts:12-98 | 无独立文档;定位为"脚本化兜底" | ⚠️ 部分行可溯源到文档示例句:"02 starved while you watched"(manual.ts:47 ↔ CONTEXT.md:124)、"the keeper counts our breaths"(manual.ts:54 ↔ CONTEXT.md:125) |
| 静默 40 分钟台词 | 无 | R6.2 / ARCHITECTURE.md:313 / README.md:56 引用 | ❌ 内容全仓缺失(G6);且 README:56 还承诺静默"不说话",实机违反(U 组:无 endpoint 时 game.ts:387,453,558 照样吐 manual 台词) |

**结论:已有 prompt 片段与文档零逐字冲突;真正的缺口是 RT-SYSTEM 与 40 分钟台词根本不存在,而非写错。**

---

## 统计页

| 指标 | 数值 | 口径 |
| --- | --- | --- |
| 设计项总数 | 27(D01-D19 + I01-I08) | DESIGN_AUDIT §2 |
| 已实现(运行时生效) | **4**(D02 / D04 / D13 / I01)→ 覆盖率 **15%** | 严格口径:主循环真实生效 |
| 部分实现(模块在、断线或不全) | 18 → 模块层覆盖 22/27 ≈ **81%** | 含 9 组零调用函数 |
| 缺失 | 5(D08/D09 文档缺失、D19、I02、I08) | — |
| 文档超前率 | **0 / 27** | ✅ 项全部能找到至少模块级实现;风险形态是"断线"而非"无实现" |
| 幽灵实现 | **20 项 / 可执行公开面 ≈212 → 幽灵率 ≈ 9.4%** | 其中数值冲突 4 项(U08-U11)、死路径 7 项 |
| prompt 逐字冲突 | **0** | 已落仓模板片段与 CONTEXT.md 全部一致 |
| RT-SYSTEM / 40min 台词 | 缺失(G5/G6) | 两侧皆无 |

一句话读法:**这份代码库的问题不是"文档吹了没做"(文档超前 0),而是"做好的没插电"(11/27 模块断线)加上"做出来的没登记"(幽灵 20 项)。**

---

## 结论页:对外演示/提交评审,最优先补齐的 10 件事

排序依据:玩家可感知度(1-5)× 工作量收益比;低工作量+高可感知优先。工作量均为小时级粗估(接线类改动,不动架构)。

| # | 事项 | 玩家可感知度 | 工作量 | 依据(文件:行) |
| --- | --- | --- | --- | --- |
| 1 | **buildContext 接入 directLine**:触发圆桌前组装记忆块/账本/信念,替代裸 `client.ask(trigger)` | ★★★★★(决定演示时"AI 写的台词"能否自然出现) | 3-4h | game.ts:252-271;director/context.ts:340 |
| 2 | **hybridize 接入孵化**:Egg 携带双亲 genome,hatchFromEgg 以 hybridize 为基底 | ★★★★★(「繁殖=延续、它活在后代 lineage 里」核心卖点) | 2-3h | engine.ts:404;breed.ts:53;types.ts:52-59 |
| 3 | **Silent Run 合规**:无 endpoint 时停止一切台词输出(只留第 40 分钟一句) | ★★★★☆(评审现场无 key 即触发,违规会被当场抓到) | 1h | game.ts:387,453,558 vs requirements.md:81-83 |
| 4 | **多轮台词播放**:directLine 返回全 scene,playScript/runPlayback 逐轮揭示 | ★★★★☆(单调用多说话者的可见形态) | 2-3h | game.ts:270;ui/dialogue.ts:71,108 |
| 5 | **whisper 调度**:主循环每 tick 扫描 2 格伴留 4 tick 的生物对,调 resolveWhisper | ★★★★☆(Bestiary 里出现 heard 记忆=私有记忆机制可见) | 2-3h | gossip.ts:6-7,80;game.ts:458-462 |
| 6 | **GV 单一真相**:7 处内联增量改走 gvDeltaFor,补 death 事件与夜间 1.5x | ★★★☆☆(评审问"GV 数值哪来的"时救命) | 2h | game.ts:301 等 7 处;ledger.ts:32-48 |
| 7 | **session:end 巩固接线**:fallbackConsolidate+applyConsolidation 挂 drift_consolidation hook,genome.drift 开始增长 | ★★★☆☆(Bestiary 出现 cons_ 条目=两层记忆可见;drift=衰老开始走) | 2-3h | consolidate.ts:45,83;hooks.ts:71 |
| 8 | **最小存档**:world+memories+genomes 序列化入 localStorage(哪怕只有手动导出 JSON) | ★★★☆☆(刷新即失忆是演示大忌) | 3-4h | game.ts:139,466;ARCHITECTURE.md:333 |
| 9 | **文档数值对齐三连**:router level_b 1500→600ms;source_penalty 与候选记忆档位对齐 CONTEXT;数值类幽灵(U15-U20)补进 ONTOLOGY/EXPRESSION 文档 | ★★☆☆☆(防评审逐行对文档时翻车) | 2h | router.ts:53;context.ts:57,218;U15-U20 清单 |
| 10 | **提交件补仓**:RT-SYSTEM 定稿落仓 + 40 分钟台词定稿 + sw.js 构建入口(vite 多入口) | ★★☆☆☆(均为被引用却不存在之物) | 3h | HARNESS.md §8 后;R6.2;main.ts:5 |

**前三件事合计约 7-9 小时,即可把"演示时最容易被看穿的三个断点"(AI 台词空转 / 繁殖不延续 / 静默违规)全部闭合。**

---

*本矩阵为只读审查产物;所有引用行号以 2026-11-12 工作区状态为准。*
