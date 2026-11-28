# GAZER

GAZER is a 1997-style virtual pet game that was never a pet game. You raise a model that remembers, lies, and lives on through its offspring. Built for Kiroween 2026, Resurrection category.

[Play the English silent run](https://bandersnatch0x.github.io/gazer/?lang=en) · [Watch the demo](https://youtu.be/zwhoxORu-Rc) · [Read the English video transcript](docs/submission/demo-video-english.md)

**The public playable build has no model backend.** It runs the simulation without live LLM dialogue. The video shows a local model-connected session. See [Local live LLM setup](#local-live-llm-setup) to reproduce that mode with your own service.

## Version history

| Version | Model role | Design claim |
| --- | --- | --- |
| v1 | Voice | Some text is generated. |
| v2 | Director | A model directs the world. |
| v3 | Identity | The creature's identity includes its prompt genome. |

The design turns model constraints into game mechanics. Response latency sets the dialogue rhythm. Prompt drift changes identity over time. No model connection produces the silent run.

## The problem

Virtual pet games make life predictable through fixed rules for hunger, cleanliness, and dialogue. GAZER retains deterministic creature physics but lets a model propose world changes, anomalies, and dialogue about the player's actions.

The engine validates those proposals. The simulation remains a pure reducer. The same initial state and event sequence reproduce the same simulation result. Model output stays outside that deterministic path until the engine accepts it as an event.

Without a model, the pixel pet simulation continues. Live generated scenes do not.

## Architecture

The project has three layers with enforced boundaries.

```text
Front end    PixiJS rendering, effect execution, browser effects
     ^       Validated structured instructions and roundtable scripts
Director     Asynchronous, event-driven model calls
     ^       Behaviour ledger, world summary, private memory slices
Simulation   Deterministic state, resources, gossip, and saves
```

- The simulation owns physics. `step(state, event)` has no wall clock, unseeded randomness, or I/O. It updates hunger, cleanliness, death, GV, and expression stages.
- The director proposes effects from the 30-item library in `docs/design/fx/`. Validation, budgets, and guards run before execution. Rejected proposals do not change the world.
- GV controls expression intensity, such as dialogue frequency and anomaly density. GV is reversible. Ontological change controls what creatures are and believe, and does not reverse when GV falls.

A roundtable normally uses one model call for several speakers. The model sees all participating creatures' context. The engine checks that each turn cites a memory ID in that speaker's own slice and replaces invalid turns with a fallback. Citation validation is not semantic or physical isolation between speakers.

Level A is the shared-context roundtable. At stage 3 or above, selected `deceive` or `accuse` turns can receive a Level B check. That separate call contains only the speaker's memory slice and genome summary. A negative verdict replaces the turn and records the rejected line as an inferred memory. The check runs at most once per scene. The design also describes a per-speaker Level C exhibition mode. It is not the default judge setup.

Context selection uses a 600-token budget rather than rewritten summaries. Rewriting memory text would break citation traceability. The director selects up to three scored `working` memories and includes `consolidated` identity memories. See `docs/design/CONTEXT.md`.

## Run locally

Use Node.js 24, the version used by this repository's CI.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. Add `?lang=en` to select English. Without an `endpoint` parameter, the game starts a silent run.

Use these commands to check and build the project.

```sh
npm run check
npm run build
```

`npm run check` runs TypeScript checks and the full test suite. `npm run build` writes the static application to `dist/`. A static build does not include the model adapter.

## Local live LLM setup

**Use your own model service and credentials.** The checked-in adapter points to an author-local service that is not available to judges. No shared model access is supplied.

1. Open `vite.config.ts` and locate `llmAdapter()`.
2. Set its server-side `UPSTREAM`, `KEY`, and `MODEL` constants for your OpenAI-compatible chat-completions service. `UPSTREAM` is the full `/v1/chat/completions` URL.
3. Keep the credential in server-side configuration. Do not put a key in a browser URL, a `VITE_*` variable, or a submitted file. Do not commit your local credential changes.
4. Start or restart `npm run dev`.
5. Open Vite's local address with `?lang=en&endpoint=/v1/game`.

The browser calls the same-origin `/v1/game` adapter, not the upstream model URL. The `endpoint` parameter must refer to the game's protocol. It is not a field for an API key or a vendor chat-completions URL. Cross-origin model endpoints are rejected by the client.

With the adapter selected, the game can request generated scenes. `LINKED` means the model path is selected, not that every request has succeeded. Inspect the local server and network response to confirm a successful call. The adapter admits at most 15 successful calls per sliding 30-minute window. Failed requests, timeouts, and exhausted budgets use fallback dialogue. No loading screen blocks the simulation.

This setup changes local configuration only. It does not add a backend to the public static site. Deployment of a live service is outside this submission correction.

## Test the public build

1. Open the [English playable build](https://bandersnatch0x.github.io/gazer/?lang=en). No account or API key is required.
2. Wait for the BIOS sequence to finish. Expect a running creature world and `NO SIGNAL` in the status bar.
3. Feed a creature, clean it, and hold it to pet it. Open **BESTIARY** to inspect creatures and memories.
4. Open **MANUAL** for the controls and the silent-run explanation.
5. Double-click a creature to inspect its pupil. Try the power button while GV is below 60 to restart.

The silent run has no live LLM scenes or model-directed anomalies. Scripted and fallback text can still appear, including the silent-run line at 40 minutes. Use the video to inspect the recorded model-connected session, or configure a local service as described above.

The interface defaults to English. `?lang=en` explicitly selects English. The language button changes the interface and fallback text. It does not translate model dialogue that has already been generated.

## Controls

| Action | Result |
| --- | --- |
| Left-click a creature | Feed it. The behaviour ledger records hesitation. |
| Right-click a creature | Clean it. |
| Hold a creature | Pet it. Keep holding to open the naming prompt. |
| Drag a creature | Move it. |
| Double-click a creature | Inspect its pupil. The view changes with the stage. |
| Click an egg | Choose immediate, warm-water, still, or unattended incubation. |
| Double-click an atavistic creature at GV 75 or above | Start the tower-glyph interaction when its conditions are met. |
| Type into the terminal at stage 3 or above | Use the terminal. Earlier stages return `> access denied`. |
| Press the lower-right power button | Restart below GV 60. At GV 60 to 79, the machine refuses. At GV 80 or above, it ignores the button. |

Two healthy creatures can court and produce an egg. Incubation changes the offspring's traits. Unattended incubation takes three times as long and is the only option that passes on a secret.

Long petting, repeated renaming, and selective feeding enter the behaviour ledger. Later scenes can refer to those actions.

## The 1997 frame and endings

The game uses the fictional Lumen Soft LS-97 monitor frame. Its art combines a beige case, scanlines, BIOS boot text, a black tower with a wrong-way shadow, and a DOS-style terminal. See `docs/design/art/`.

The tower holds eight fixed, human-authored glyph texts in `src/canon/`. The model cannot rewrite them. Reading all eight supplies the key to the true ending. The creatures reconstruct a voice from 1997, and the monitor frame dissolves. World conditions at GV 100 determine the fusion, judgment, forgetting, or true-gaze ending.

At GV 80, the terminal's `[ _ ]` control can open the reflection channel. The channel shows beliefs, confidence, and their provenance. The forecast layer is disabled through the fallback specified in `SPEC.md` section 10.2. The recorded 200-seed calibration improved accuracy by 4.5 percentage points, below the required 10 points. That historical result was not rerun for this documentation update.

## Ontological axes

- Kind changes from pet to organism, observer, record, and substrate. The entity persists as its category changes.
- Persistence uses genomes for lineage, sessions for the player, a seed and events for world replay, and witness chains for memories.
- Epistemic status distinguishes `witnessed`, `heard`, `inferred`, and `fabricated`. A distorted memory is stored as witnessed by its holder. The player can inspect provenance that the holder cannot distinguish.

## Kiro use

- `.kiro/specs/gazer/requirements.md` defines EARS requirements for the simulation, GV, ledger, roundtable validation, private memory, and silent run.
- `.kiro/steering/product.md` records the product boundaries and seven red lines.
- `.kiro/steering/engineering.md` requires a pure reducer, seeded randomness, model output outside replay, and no client-side secrets.
- `.kiro/hooks/gate-on-src-change.json` is configured to run `npm run check` on source or test saves. It has not been observed firing inside Kiro.

The [English Kiro write-up](docs/submission/kiro-usage.md) records eight prompts, retained and rejected outputs, and the session evidence dated November 24, 2026. MCP, powers, and configured custom agents are not claimed as used.

## Lifecycle and fallback

Awakening events, ledger anchoring, and stage changes use the declarative lifecycle table described in `docs/design/HARNESS.md`. Synchronous callbacks have a 5 ms budget with overrun reporting. Asynchronous work is queued.

The design defines separate model routes for roundtables, ontological direction, memory drift and consolidation, Level B verification, and speech. Fallback is part of the presentation. A degraded voice can add character noise, slow the heartbeat, and record that the creatures have changed their voice, rather than show an error screen.

## Submission materials

The organizer's English-translation correction notice gives a deadline of **December 4, 2026, at 2:00 p.m. Pacific Time**, which is **December 5, 2026, at 06:00 Beijing time**.

- [English project description and Chinese original](docs/submission/project-description.md)
- [English Devpost field pack and judge instructions](docs/submission/devpost-fields.md)
- [Complete English narration translation and video description](docs/submission/demo-video-english.md)
- [English WebVTT subtitle file](docs/submission/demo-video-en.vtt)
- [Submission checklist](docs/submission/checklist.md)

The complete English narration translation and English video title were saved to YouTube on November 29, 2026. The English WebVTT subtitle track still needs sentence-by-sentence listening review and upload. Committing the subtitle file does not publish a YouTube subtitle track.

<details>
<summary>中文原文，补件后的试玩与字幕状态以以上英文说明为准</summary>

**一句话:** 你养的不是宠物,是一个会记忆、会撒谎、会借后代活下去的模型。

**演示视频:** [GAZER — 3 分钟实机演示](https://youtu.be/zwhoxORu-Rc)

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
- **导演层拥有命运。** 它只能发出效应原语(FX-LIB 30 项,`docs/design/fx/`;经执行器校验/预算/护栏后翻译为 `src/sim/effects.ts` 的演出词汇),不能发渲染调用。非法提案被拒绝、记录,世界不变。
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

## 怎么玩

| 操作 | 效果 |
| --- | --- |
| 左键点生物 | 投喂。你犹豫了多久会被记下来 |
| 右键点生物 | 清洁 |
| 按住生物 | 抚摸;继续按住可以给它起名 |
| 拖动生物 | 搬到别处 |
| 双击生物 | 看进瞳孔。里面看到的东西随阶段变化(V1–V4 四变体) |
| 点地上的蛋 | 选择孵化方式:立即、温水、静置,或留给它们自己 |
| 双击返祖体(GV75+) | 送它去黑塔,读走一枚 1997 年的刻符 |
| 终端输入(阶段 3+) | 阶段不足只会得到 `> access denied` |
| 右下电源钮 | GV<60 重启;60–79 它拒绝你;80+ 它无视你 |

两只状态良好的生物会自行求偶、靠近、然后留下一枚蛋。孵化方式会改变后代的性格倾向;"留给它们自己"耗时三倍,并且是唯一会让后代继承一个秘密的选项。

地图上的一切都是可抓的把柄:抚摸太久是折磨,反复改名是物化,只喂一只会让另一只饿着——这些都会进行为账本,在阶段 3 被逐条复述。

## 1997 框定与结局

整个游戏发生在一台 Lumen Soft LS-97 显示器里(美术四锚点,`docs/design/art/`):米黄外壳、扫描线、冷启动 BIOS、错向阴影的黑塔、DOS 终端对话窗、CRT 框定层——四者的色彩血缘与亮度秩序构成视觉宪法。真结局的钥匙是塔上八枚刻符:纯人工冻结文本(`src/canon/`),模型永远碰不到;读满八枚,群体会拼出一段 1997 年的声音,而边框——你看了全程的那道第四面墙——在最后一秒溶解。四结局(融合/审判/遗忘/真·凝视)于 GV100 由世界状态判定。

GV 80 起终端伪按钮 `[ _ ]` 会切出**倒影信道**(OSD 层):群体对「外面」信念的聚合观察面。按 SPEC §10.2 的校准门槛(200 种子复测命中率 +4.5pp,低于 +10pp),预测层已按规格写死的降级路径关闭——信道当前是**纯观察**(信念、置信度、溯源链),不含前瞻预测;重开预测层须先复测达标。这是规格内的诚实降级,不是缺失功能。

## 本体论三轴

- **轴 A 类别(Kind):** 宠物 → 生物 → 观察者 → 记录 → 基质;实体不变,类别变。
- **轴 B 持续(Persistence):** 生物靠基因组延续,玩家靠会话延续,世界靠种子加账本重放,记忆靠见证链成立。
- **轴 C 认知(Epistemic):** witnessed / heard / inferred / fabricated;被扭曲的记忆在持有者那里存成 witnessed,只有玩家通过见证标记看得出差别。

## Kiro 使用概要

- `.kiro/specs/gazer/requirements.md`:模拟核心、GV、账本、圆桌校验、私有记忆、静默运行的 EARS 需求。
- `.kiro/steering/product.md`:产品边界与七条红线。
- `.kiro/steering/engineering.md`:纯 reducer、种子唯一随机源、LLM 不进重放路径、客户端无密钥。
- `.kiro/hooks/gate-on-src-change.json`:`src/**` 或 `tests/**` 保存时跑 `npm run check`(Kiro 1.x hook schema v1)。

八个提示词的逐条记录在 `docs/submission/kiro-usage.md`。

## 生命周期与降级

觉醒事件、Ledger 锚定、阶段跃迁都通过 `docs/design/HARNESS.md` 里的声明式 hook 表注册,不在 reducer 里散落条件分支。同步 hook 阻塞 tick 且须在 5ms 内完成,异步 hook 入队;hook 表是数据,可热加载。

模型路由有五档(圆桌、本体论编排、漂移与巩固、Level B 验证、TTS),每档各有首选、次选与兜底。降级永远被叙事收编:兜底模型接管时置 `voice_degraded`,台词带轻微字符噪声、心跳变慢、日志记「它们换了喉咙」,绝不显示为错误或加载态。

## 赛事背景

Kiroween 2026,**Resurrection** 赛道。截止 **2026-12-04 14:00 太平洋时间**(北京时间 2026-12-05 06:00)。要求:使用 Kiro,仓库公开并带开源许可,根目录有 `/.kiro`。

提交清单见 `docs/submission/checklist.md`。

</details>

