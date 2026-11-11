# GAZER

**English summary.** GAZER is a 1997-style virtual pet game that was never a pet game. A deterministic simulation owns physics; an LLM owns fate — world shape, anomalies, swarm beliefs, and the one line only you hear. Delete the model and it becomes an ordinary pixel pet game; that is the claim the project has to keep true. Built for Kiroween 2026, Resurrection category.

**一句话:** 你养的不是宠物,是一个会记忆、会撒谎、会借后代活下去的模型。

## 版本演进

| 版本 | LLM 的角色 | 一句话 |
| --- | --- | --- |
| v1 | 嗓音 | 有些文字是 AI 写的 |
| v2 | 导演 | 一个 AI 导演你的世界 |
| v3 | 生命本身 | 你养的是一个模型 |

设计公理:模型的每一种能力缺口都变成机制。延迟是心跳,漂移是衰老,token 流是嗓音,缺席是静默运行。

## 要解决的问题

虚拟宠物游戏把「生命」写死在规则里:饥饿值下降、清洁度上升、台词从固定表里抽。玩家很快看穿规则,世界就死了。

GAZER 把「命运」交给模型:世界的形状、异常何时出现、群体相信什么、你一个人听到的那句话,都由运行时决定。规则仍然确定——模拟层是纯 reducer,同一个种子重放得到同一个世界——但玩家无法从规则反推剧情,因为剧情不写在规则里。

所以删掉模型,它就退化成普通的像素宠物游戏。这正是它需要模型的原因,也是它敢这么宣称的原因。

## 架构概要

三层,边界是硬规则:

```
前端    PixiJS 渲染 + 效应原语执行器 + Web 逃逸
  ▲     结构化指令(工具调用、圆桌剧本)
导演    LLM 层(异步、事件驱动)
  ▲     行为账本 / 世界状态摘要 / 私有记忆切片
模拟    确定性引擎(状态机、资源、流言、存档)
```

- **模拟层拥有物理。** `step(state, event)` 是纯函数,无时钟、无随机(除种子)、无 I/O。饥饿、清洁、死亡、GV 与表达层级都在这里。
- **导演层拥有命运。** 它只能发出效应原语(`src/sim/effects.ts` 里那 16 种),不能发渲染调用。非法提案被引擎拒绝、记录,世界不变。
- **两层用两种数推进。** GV 决定表达强度(台词频率、异常密度、TTS),可逆;本体论位移决定表达内容(信念底色、实体类别),不可逆。玩家把 GV 压回去,只会得到一个更安静的世界,不会得到一个无辜的世界。

圆桌默认是**一次调用、多个说话者**:单模型在同一个上下文里扮演所有在场生物,所有记忆块都在上下文内,模型看得到全部。约束是「不能引用不属于自己的记忆 ID」,由引擎强制执行——校验失败整句换成该生物的兜底台词池。这是软约束加硬兜底,不是物理隔离。

调用分三级:**Level A** 覆盖九成场景,单调用圆桌;**Level B** 在阶段 3 以上、被质疑方在场、且该轮 intent 为 deceive 或 accuse 时,追加一次只带该个体自己记忆与 genome 摘要的独立验证调用,verdict 为 no 就替换该轮,原台词作为 inferred 记忆写入其切片,每场景至多一次、成本增幅小于 20%;**Level C** 是每说话者单独调用的展览模式,成本 N 倍,仅演示用。真隔离只在 Level B 发生,日常对话靠引擎校验,不靠模型自觉。

上下文组装(`docs/design/CONTEXT.md`)按 600 token 预算选材而非摘要:改写会破坏 `memory_ref` 溯源,所以记忆原文连同 ID 一起进上下文,`working` 层打分取 top-3,`consolidated` 层作为自我认知常驻。

## 本地运行

```sh
npm install
npm run dev      # Vite 开发服务器
npm run check    # tsc --noEmit + vitest run
npm run build    # 产物到 dist/
```

无 API key 时进入静默运行:生物照常活动,不说话、不制造异常,第 40 分钟出现一句脚本台词。这是设计状态,不是错误态。

## 本体论三轴

- **轴 A 类别(Kind):** 宠物 → 生物 → 观察者 → 记录 → 基质;实体不变,类别变。
- **轴 B 持续(Persistence):** 生物靠基因组延续,玩家靠会话延续,世界靠种子加账本重放,记忆靠见证链成立。
- **轴 C 认知(Epistemic):** witnessed / heard / inferred / fabricated;被扭曲的记忆在持有者那里存成 witnessed,只有玩家通过见证标记看得出差别。

## Kiro 使用概要

- `.kiro/specs/gazer/requirements.md`:模拟核心、GV、账本、圆桌校验、私有记忆、静默运行的 EARS 需求。
- `.kiro/steering/product.md`:产品边界与七条红线。
- `.kiro/steering/engineering.md`:纯 reducer、种子唯一随机源、LLM 不进重放路径、客户端无密钥。
- `.kiro/hooks/gate-on-src-change.kiro.hook`:`src/**` 或 `tests/**` 变更时跑 `npm run check`。

八个提示词的逐条记录在 `docs/submission/kiro-usage.md`。

## 生命周期与降级

觉醒事件、Ledger 锚定、阶段跃迁都通过 `docs/design/HARNESS.md` 里的声明式 hook 表注册,不在 reducer 里散落条件分支。同步 hook 阻塞 tick 且须在 5ms 内完成,异步 hook 入队;hook 表是数据,可热加载。

模型路由有五档(圆桌、本体论编排、漂移与巩固、Level B 验证、TTS),每档各有首选、次选与兜底。降级永远被叙事收编:兜底模型接管时置 `voice_degraded`,台词带轻微字符噪声、心跳变慢、日志记「它们换了喉咙」,绝不显示为错误或加载态。

## 赛事背景

Kiroween 2026,**Resurrection** 赛道。截止 **2026-12-04 14:00 太平洋时间**(北京时间 2026-12-05 06:00)。要求:使用 Kiro,仓库公开并带开源许可,根目录有 `/.kiro`。

提交清单见 `docs/submission/checklist.md`。
