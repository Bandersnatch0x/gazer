# GAZER v3.5 代码实现度审查报告（只读审查）

审查日期：2026-11-12 · 审查方式：纯只读（未修改任何源文件，本报告除外）
审查范围：`D:\code_space\hackton\gazer` 全部 40 个 src 文件、24 个测试文件、docs/design 四份设计文档、.kiro 需求文件。

---

## 第〇步：先说结论（TL;DR）

1. **仓库实际是 v3 文档驱动的一版实现，v3.5 规格里的许多模块（存档、账本写入、关系系统、环境系统、音频/TTS、流程脚本、结局、Silent Run 正式逻辑）不存在或只有形状。**
2. 技术栈与文档 Part VI（`docs/design/ARCHITECTURE.md:327-343`）**基本一致**：PixiJS 8 是唯一运行时依赖，无状态库/无 Howler/无 SDK，Vitest + fast-check，纯 reducer + 种子 PRNG。但文档承诺的 **WebAudio 程序化音频、TTS、localStorage 存档** 三项零实现。
3. 最严重的一类问题不是"缺功能"，而是**"已实现的纯模块没有接线"**：`buildContext`（RT-CONTEXT 组装器）、`resolveWhisper`（流言）、`hybridize`（杂交）、`fallbackConsolidate`/`applyConsolidation`（巩固）、`shouldVerify/applyVerdict`（Level B）、`gvDeltaFor`（GV 权重）全部只被测试引用，`src/game.ts` 的运行时主循环一个都没调用。设计文档里"游戏的恐怖引擎"（私有记忆→圆桌）在实机上目前是断路。
4. 隐私红线、确定性、schema 校验三项质量抽查**通过**；blocklist 红线、Silent Run 不说话、存档三项**违反或缺失**（详见第四节）。

---

## 第一步：代码库结构盘点

### 目录树（深度 3，已省略 node_modules）

```
gazer/
├─ index.html                  # 壳：#stage/#canvas/#hud/#ui，内联全部 CSS（181 行）
├─ package.json                # 见下
├─ tsconfig.json               # strict 全开；include: ["src","tests","api","*.ts"]
├─ README.md                   # 中英双写项目说明
├─ .kiro/
│  ├─ specs/gazer/requirements.md      # EARS 需求 R1-R7
│  ├─ steering/{product,engineering}.md
│  └─ hooks/gate-on-src-change.kiro.hook
├─ docs/
│  ├─ design/{ARCHITECTURE,ONTOLOGY,CONTEXT,HARNESS}.md   # v3 设计文档四件套
│  └─ agents/…、submission/…
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/{icon-192,icon-512}.png
├─ src/                        # 40 个 .ts 文件，6 个子目录
│  ├─ main.ts                  # 入口：SW 注册 + 样式 + createGame
│  ├─ game.ts                  # 集成层：时钟/输入/连线（601 行，最大的文件）
│  ├─ sim/                     # 纯模拟：types/engine/rng/effects/ledger/memory/
│  │                           #   genome/breed/gossip/consolidate/hooks/roundtable/ontology
│  ├─ director/                # LLM 层：client/context/manual/roundtable/router/verify
│  ├─ render/                  # Pixi：app/scene/sprite/palette/effects
│  ├─ shell/                   # Web 逃逸：escapes/offline/palette/register/sw
│  └─ ui/                      # DOM：shell/dialogue/witness/album/help/panels/copy/i18n/theme
└─ tests/                      # 24 个 *.test.ts（vitest + fast-check）
```

注意：**没有 `api/` 目录**（tsconfig include 声明了它）、**没有 vite.config / vitest.config**、**没有 sw.js 构建产物**（`public/` 里只有图标与 manifest，`src/shell/sw.ts` 没有任何构建入口把它编成 `./sw.js`）。

### package.json

- `dependencies`：仅 `pixi.js ^8.6.6`。
- `devDependencies`：typescript 5.7、vite 6、vitest 3 + fast-check 3、gh-pages、@types/node。
- 脚本：`dev`/`build`/`preview`/`test`/`check`（check = `tsc --noEmit && vitest run`，即 AGENTS.md 门禁）。
- **无状态管理库、无 Howler、无 LLM SDK** —— 与 ARCHITECTURE.md "No React, no state library, no parser library, no provider SDK" 声明一致（该项**符合**）。

### 测试文件清单（24 个）

`engine, sim-breed, sim-breeding, sim-consolidate, sim-gossip, sim-hooks, director-client, director-context, director-manual, director-roundtable, director-router, director-verify, render-palette, render-sprite, render-scene, render-effects, shell-escapes, shell-manifest, shell-offline, shell-sw, ui-dialogue, ui-i18n, ui-shell, ui-witness` —— 约 237 个用例，纯函数层覆盖厚；**没有 game.ts 集成测试，没有 ontology.ts 测试**。

### 技术栈 vs 文档 Part VI 对照（ARCHITECTURE.md:327-343）

| 文档声明 | 实际 | 判定 |
| --- | --- | --- |
| PixiJS 8 + TS + native DOM | pixi.js 8.6.6，UI 全手写 DOM | ✅ 一致 |
| Sim 纯 reducer、Vitest + fast-check、种子 PRNG | 一致，且测试到位 | ✅ 一致 |
| Director：fetch 到同源代理、无 SDK | `director/client.ts` 同源 fetch ✅；但**代理服务端不存在**（无 api/ 目录） | ⚠️ 半 |
| Storage：localStorage（world/ledger/GV/seed/genomes/run memories） | localStorage 只存 locale（`game.ts:139,466`） | ❌ 不符 |
| Audio：WebAudio 程序化、无资产 | 全仓无 `AudioContext`，无任何声音代码 | ❌ 不符 |
| TTS：browser SpeechSynthesis Stage 3+ | 仅 router 表里的字符串 `browser_speech_synthesis`（`router.ts:56`），无调用 | ❌ 不符 |
| Escapes：favicon canvas/title/visibility/DOM overlays | `shell/escapes.ts` 全实现 | ✅ 一致（接线见下） |
| PWA：manifest + SW + 离线可玩 | manifest/图标在；`main.ts:5` 注册 `./sw.js`，**构建里不存在该文件**，注册静默 404 | ⚠️ 半 |

---

## 第二步：模块实现度矩阵

等级：0=不存在 / 1=骨架或类型 / 2=部分实现无接线(或有测试未接线) / 3=完整实现 / 4=完整+测试覆盖。
"证据"列给关键文件:行号与导出名。

### 【模拟引擎】

| # | 模块 | 等级 | 证据与说明 |
| --- | --- | --- | --- |
| 1 | 小人实体与状态机（8 状态 + 4 属性衰减） | **4** | `src/sim/types.ts:7-15`（8 种 CreatureBehavior：idle/hungry/eating/dirty/sleeping/playing/mating/dead）；`src/sim/engine.ts:13-19` 四项衰减常量、`stepCreature`(:67)、`behaviorFor`(:51)；测试 `tests/engine.test.ts`（确定性/不变异/越界）、`tests/sim-breeding.test.ts` |
| 2 | 等距地图渲染（320×180、整数缩放） | **4** | `src/render/scene.ts:17-18`（LOGICAL_WIDTH=320/HEIGHT=180）、`project/unproject`(:41,55)、`integerScale`(:65)；`src/render/app.ts:449-459` CSS 整数缩放；`tests/render-scene.test.ts` 往返投影 |
| 3 | 资源/建造系统 | **1** | 仅有 `Structure{black_tower}` 数据形状（`sim/types.ts:61-65`）与 `spawn_structure` 效果；无资源计量、无玩家建造路径 |
| 4 | 繁殖系统（意愿值、求偶演出、孵化四选项、self_hatched 标记） | **2~3** | 意愿值公式 `engine.ts:85`（`40+(happiness-50)*0.8`）+ `pairWillingness`(:94)；自动求偶 `courtshipStep`(:103-141) 已接入主循环（`game.ts:459`）；孵化四选项 UI `game.ts:534-562` + `ui/panels.ts:23-45`；self 标记以 secret 形式存在（`engine.ts:232` `secrets:["it hatched without being asked"]`），**无独立 self_hatched 字段**；**forced 孵化（强迫配对）无 UI 路径**——`layEgg.forced` 永远传 false（`game.ts:135` 经 courtshipStep），文案 `COPY.panels.hatchForcedNote`（`ui/copy.ts:127`）是死文案。**严重缺陷见高危 #1** |
| 5 | 个体间关系（友谊/排挤/教学/哀悼） | **1** | 仅流言：`src/sim/gossip.ts` `resolveWhisper`(:80) 完整且带测试（`tests/sim-gossip.test.ts`），**但没有任何调用点**——主循环不跑"2 格 4 秒触发耳语"的调度；友谊/排挤(impression 字段在 ARCHITECTURE.md:87)未进 `sim/types.ts`（album 只能传 0，`game.ts:485`）；教学/哀悼仅有 hook 名（`sim/hooks.ts:70` `swarm_mourning_queue`，handler 为空） |
| 6 | 环境系统（季节/昼夜/天气） | **0** | 全仓无 season/weather/昼夜循环代码；仅 `ledger.ts:46` 的夜间 1.5 倍乘数（且未被调用）。Grep `season|weather|昼夜` 零命中 |
| 7 | 12 种直接交互 + 过度版本判定 | **2** | SimEvent 仅 6 种交互：feed/clean/play/pet/name/move（`engine.ts:26-34`）；stare 检测（`game.ts:293-307`）、rapid_click 计数（`game.ts:329,386`）、拖拽携带（:417-431）、双击瞳孔（:436-446）——合计约 8 种；"过度版本"（force/feed→overfeed 等）无判定逻辑 |

### 【数据层】

| # | 模块 | 等级 | 证据与说明 |
| --- | --- | --- | --- |
| 8 | 类型四形状（PromptGenome/MemorySlice/RoundtableScript/OntologyShift） | **4** | `sim/genome.ts:11-22`、`sim/memory.ts:7-33`（working 60 + consolidated 12 双层）、`sim/roundtable.ts:5-15`、`sim/ontology.ts:5-21`。无单一 `gazer.types.ts`，按域拆四文件，等价成立 |
| 9 | Behavior Ledger（写入、200 滚动、锚定晋升） | **1** | `sim/ledger.ts` 全部是形状与常量：`LedgerEvent/LedgerEntry`(:3-18)、`LEDGER_CAPACITY=200`(:30)、`GV_WEIGHTS`(:32-42)、`gvDeltaFor`(:44)。**运行时零写入**：grep 全 src，`LedgerEntry` 只在本文件出现；`game.ts` 不记录任何 feed/stare/death 事件；滚动淘汰与"锚定晋升"无实现 |
| 10 | GV 累积器（增量源 + 衰减 + 夜间倍率） | **2** | `gv` 事件 + `stageForGv`（`types.ts:80-98`，阈值 20/40/60/80 与文档一致）；增量源在 `game.ts` 内联硬编码（高危 #6）；`gvDeltaFor`（权重表+夜间 1.5x，`ledger.ts:44-48`）**未被调用**；衰减机制不存在；`gv_accumulator` hook 注册为空操作（`game.ts:148-155`） |
| 11 | 存档（localStorage 序列化、genomes/*.json、种子确定性） | **0** | localStorage 仅存语言键 `gazer-locale`（`ui/i18n.ts:14`、`game.ts:139,466`）；种子硬编码 1997（`game.ts:75`）；无 world/ledger/genome 序列化。与 README:33("localStorage (world, ledger, GV, seed, genomes…)")、project-description.md:11("genome 是存档里真实的 JSON 文件")直接矛盾 |

### 【LLM 层】

| # | 模块 | 等级 | 证据与说明 |
| --- | --- | --- | --- |
| 12 | Hook 框架（12 点位注册与触发） | **3~4** | `sim/hooks.ts`：12 个 LifecyclePoint(:4-31)、HookDef(:41-49)、优先级+id 排序(:74-79)、同步/异步双通道（`runPoint`/`drainAsync`，:104-136）、未知点位安装期拒绝(:98-100)、首个注册表数据化(:66-72)；测试 `tests/sim-hooks.test.ts` 覆盖乱序/抛错/guard/异步。**缺口**：HARNESS.md 的 5ms 超限记录未实现；game.ts 注册的两个 hook 均为空 handler（`game.ts:148-163`），12 点位实际只挂了 2 个空壳 |
| 13 | 圆桌调用：RT-SYSTEM/RT-CONTEXT、600 token 压缩、解析 | **3** | RT-CONTEXT 组装器完整：`director/context.ts` `buildContext`(:340-386)、打分函数 `scoreMemory`(:99-116，权重表 :48-54)、降级梯(:217-224)、逐字序列化(:140-147)、整只丢弃兜底(:368-382)、token 估算(:317)；解析 `director/roundtable.ts:81-105`（全有或全无、不抛错）；测试 `tests/director-context.test.ts` 15 例。**缺口**：①`buildContext` 运行时未被调用（见高危 #3）；②**RT-SYSTEM（系统提示词模板）全仓不存在**——没有任何 prompt 模板文件 |
| 14 | Roundtable validator（切片匹配 + manual_pool 替换） | **4** | `director/roundtable.ts`：`parseRoundtable`(:81)、`isGrounded`(:145-155，memoryRef 存在性 + ≥2 内容词重叠 `MIN_SHARED_WORDS=2`:33)、`validateTurns`(:163-177) 用 FNV 哈希确定性选 pool 行(:117-128)；cons_ 前缀按一手引证接受（`sim/memory.ts:43-48`）；测试 11 例含 fast-check 任意 JSON 不抛错 |
| 15 | Level B 验证与聚合规则 | **3** | `director/verify.ts`：`shouldVerify`(:36-52，deceive/accuse + stage≥3 + 他者在场 + 每场景一次)、`applyVerdict`(:109-127，no→换词 + 原句落为 inferred 记忆 :86-101)；测试 `tests/director-verify.test.ts`。**缺口**：`game.ts` 的 `directLine`(:252-271) 只取 `scene[0].text`，不逐轮渲染、不触发 Level B —— 运行时死代码 |
| 16 | 台词生成（阶段 0-4 prompt 模板，对齐文档 Part IV） | **1** | 无任何 prompt 模板（无 RT-SYSTEM/RT-CONTEXT 文本模板文件，CONTEXT.md 的格式在 context.ts 里有组装器但无 system 侧文本）；兜底台词池完整：`director/manual.ts` 5×13 行分阶段(:12-98)+确定性选行(:105-109)+测试。**本仓 docs 只有 v3 四件套，用户清单所指的 v3.5 Part IV 文档不在仓库内，无法做逐条对齐** |
| 17 | OntologyShift 触发与三段式演出 | **1** | `sim/ontology.ts`：append-only `recordShift`(:27-35)、`beliefFor`(:37)。**运行时从不触发**：`game.ts:277` `ontology = {...ontology, shifts: ontology.shifts}` 是自赋值空操作；`ontology_ratchet_check` hook 为空；三段式演出无任何代码；且 ontology.ts 无测试文件（文档 ONTOLOGY.md:203-212 声称 "tested"，与实况不符） |
| 18 | 漂移巩固（batch、consolidated 沉淀、retire 裁决） | **2** | `sim/consolidate.ts`：`fallbackConsolidate`(:45-62，确定性取 top2)、`applyConsolidation`(:83-111，retire 降级回 working 尾部、永不删除、容量 12)；测试 `tests/sim-consolidate.test.ts`（含 "never deletes"）。**缺口**：LLM 路径与 `session:end` 批处理未接线（hook 空）；genome.drift 运行时从不增长（grep 无 `.drift` 写入点）——"漂移即衰老"目前是静态的 |
| 19 | 基因组杂交（LLM 路径 + fallback、返祖/双生魂） | **2** | 确定性 fallback 完整：`sim/breed.ts` `hybridize`(:53-78，特质均值+单点漂移 0.2、drift 压到 3、secrets 0.3 继承、manualPool 合并 cap10、lineage 双亲并集)；测试 `tests/sim-breed.test.ts`。**缺口**：LLM 杂交路径无；返祖/双生魂特殊变异无；且 `hybridize` 运行时未被调用（见高危 #1——孵化根本没走杂交） |
| 20 | 模型路由与降级链（主→次→manual_pool、预算软限、缓存） | **2** | `director/router.ts`：五路由表(:30-61，roundtable 800ms/ontology 1200ms/consolidation 2000ms/level_b 1500ms/tts 本地)+测试；`director/client.ts`：同源强制(:45-59)、AbortController 超时(:78-113)、四类失败归因。**缺口**：primary→secondary 的实际多模型调用无（只有单一 endpoint）；`llm:budget` 预算守卫与 15 次/30min 上限无（hook 空）；缓存（stage+trigger+hash）无 |

### 【演出层】

| # | 模块 | 等级 | 证据与说明 |
| --- | --- | --- | --- |
| 21 | 效果原语库（画布层 + Web API 层） | **4** | `sim/effects.ts`（16 种画布 Effect 类型，:3-24）+ `render/effects.ts` ShellEffect 3 种 favicon_eye/title_mutate/outside_eyes(:24-27)，plan/apply 纯执行分离(:137,258-270)，未知 kind 静默丢弃(:239-243)；Pixi 执行器全 kind 覆盖（`render/app.ts:283-370`）；测试 `tests/render-effects.test.ts` 每 kind 有样本 |
| 22 | 色板衰减 / UI 侵蚀 / DOS 终端对话框 / 家谱树 | **2~3** | 色板衰减 ✅ `render/palette.ts`（Rec601 luma 混灰 :85-92、paletteAt :131）+测试；UI 侵蚀部分：glyph_corrupt(:392-401)、ui_shake(:376-385)；DOS 终端对话框 ✅ `ui/dialogue.ts`（假路径 `C:\GAZER\1997\LIVE\roundtable.exe`、1.5-4s 抖动节奏、注入时钟）+测试——**但 game.ts 未用 playScript/runPlayback 播放多轮**；家谱树 **0**（无任何 family tree 代码） |
| 23 | 瞳孔特写（4 阶段贴图切换） | **2** | `ui/panels.ts:98-126` `pupilPanel`：canvas 画眼，stage 0/1-2/3+ 三档内容差异（草→光标点→绿方块）；**只有 3 档而非 4 阶段**，且非贴图切换而是程序绘制 |
| 24 | 音频（喂食音效、BGM 抽轨、房间白噪音） | **0** | 全仓无 AudioContext/Howler/任何发声代码；`audio_drop_track` 效果 plan 到 `{type:"audio"}` 后 `render/app.ts:320-322` 注释 "The audio subsystem listens for this" —— **该子系统不存在**，注释与实况不符 |
| 25 | 流式 TTS + Web Speech STT | **0** | 无 speechSynthesis/SpeechRecognition 调用（grep 零命中）；仅 router 表字符串 |
| 26 | 脚本觉醒事件 7 件套（GV 20-80） | **0** | 无觉醒事件表；`awakening_events` hook 注册为空操作（`sim/hooks.ts:69`）；GV 跨阈值只有 `onStageChange`（`game.ts:273-285`）的一句台词+一个效果 |

### 【流程层】

| # | 模块 | 等级 | 证据与说明 |
| --- | --- | --- | --- |
| 27 | 新手 5 分钟脚本（0:00-5:00 时间轴） | **0** | 仅有开场一行 `COPY.hud.opening`（`game.ts:591`） |
| 28 | 交互解锁节奏表（0-20 分钟） | **0** | 所有交互自开局全量可用，无解锁门 |
| 29 | 结局判定（A/B/C + 真结局三条件）与结局演出 | **0** | 仅 `engine.ts:189` 注释提及 "buys the true ending"；无判定、无演出 |
| 30 | Silent Run（0 调用检测 + 40 分钟台词） | **1** | `silent` 标志按有无 endpoint 静态置位（`game.ts:76`，true→HUD "NO SIGNAL" :226）；**R6.1"不说话"未执行**（无 endpoint 时 rapid_click/idle/孵化照样吐 manual 台词，`game.ts:387,453,558`）；40 分钟脚本台词无 |
| 31 | NG+ 开场、Ghost Archive 上报（仅画像、opt-out） | **0** | 无 RunMemory 存取、无上报通道、无 opt-out UI |

---

## 第三步：工程质量抽查

### 3.1 LLM 输出校验 ✅（部分） / ⚠️ blocklist 缺失
- **schema 校验**：手写全有或全无解析，任意 JSON 不抛错（`director/roundtable.ts:81-105` + fast-check 用例 :115）。真实实现。
- **关键词重叠回查**：`sharesEnoughWithMemory`（:130-143），防"合法 ID + 越界台词"，对应 ONTOLOGY.md:233 的已知局限缓解。真实实现。
- **重试一次后降级**：**未实现**。`client.ask` 返回四类失败即止（`client.ts:94-108`），无重试；失败→manualLine 兜底（`game.ts:258-263`）。ARCHITECTURE.md:311 "Rejected, retried once" 与代码不符。
- **keyword blocklist**：**未实现**。红线 2（ARCHITECTURE.md:347）"schema validation **plus a keyword blocklist**" —— 全仓无 blocklist 词表。降级到 manual_pool 属实，但 blocklist 这一环缺失。

### 3.2 隐私红线 ✅ 通过
- grep `camera|getUserMedia|mediaDevices|geolocation|MediaRecorder|microphone` 全 src：**零命中**（"camera"仅出现在渲染相机注释）。
- `director/client.ts` 拒绝跨源与非 http(s) endpoint(:45-59)；SW 把 `/api` 排除出缓存（`shell/sw.ts:25-30`）；UI 无真实身份输入。红线 4 成立。

### 3.3 确定性 ✅（模拟层） / ⚠️（渲染与 LLM 路径）
- 模拟层：`sim/rng.ts` mulberry32 + FNV 盐(:33-56)，`engine.ts:287` 注释与实现一致；`tests/engine.test.ts:53-64` 双跑深等 + 不变异。grep 证实 `Math.random` 在 `src/sim/` 零命中。
- 渲染层 `render/app.ts:380-381,398` 用 `Math.random` 做抖动/字形噪声——纯视觉、不入状态，可接受但使画面级重放不精确。
- `ui/dialogue.ts:72` 默认 `Math.random`，但 `random` 可注入且测试用固定序列——OK。
- **LLM 不进决定性路径**：基本成立——`directLine` 的产出只进台词层，不写世界状态。但注意 `onStageChange` 里 `await directLine` 后 speak（`game.ts:279`），异步台词晚到不影响 tick。

### 3.4 竞态 ⚠️ 无保护但影响面小
- LLM 异步返回与模拟 tick 无互斥：`directLine` 期间世界继续走（setInterval 不暂停），返回后只 speak 不 mutate world，所以无状态撕裂；但"回放期间暂停模拟"（ARCHITECTURE.md Replay 一节的前提）无实现——回放系统本身为 0。
- 存在一个小竞态：`onStageChange` 的台词行把 stage 变化时的旧 `world.stage` 传给 manualLine 的兜底由当前 world 决定，若期间 stage 又变，台词阶段可能错档（低危）。

### 3.5 硬编码扫描 ⚠️ 多处
- **GV 增量硬编码**：`game.ts:301`（凝视 +3）、`:379-381`（点击 1/4）、`:429`（搬运 +1）、`:444`（瞳孔 +3）、`:451`（发呆 +2）、`:519`（命名 +2）、`:555`（孵化 +1）——应走 `ledger.ts` 的权重表（已写好却未用）。
- 种子硬编码 1997（`game.ts:75`）；初始三只基因组硬编码（`game.ts:50-63`）。
- 交互阈值常量 STARE_MS=3000/IDLE_MS=30000/RAPID_CLICK_*（`game.ts:44-48`）——文档化了数值，属可接受常量。
- manual 台词池硬编码 65 行（`director/manual.ts`）——文档定位为"脚本化兜底"，属设计内硬编码。
- 抽样结论：数值阈值普遍写死、无配置层；台词类硬编码符合其"脚本"定位，但 GV 增量绕过权重表是实打实的两套真相。

---

## 第四步：里程碑进度（M1-M7）

> 仓库内没有任何 M1-M7 定义（grep docs 全无）。以下 M1-M7 是按用户模块清单映射的审查用切分，**非仓库权威定义**。"达标"计等级 ≥3 的项。

| 里程碑 | 覆盖矩阵项 | 达标 / 总数 | 进度 |
| --- | --- | --- | --- |
| M1 模拟核心 | 1,2,4,7 | 2 / 4（#1#2 达标；#4 缺 forced 与杂交接线，#7 交互面不足） | 50% |
| M2 数据层 | 8,9,10,11 | 1 / 4（仅类型形状达标；Ledger 未写入、存档为零） | 25% |
| M3 LLM 导演层 | 12,13,14,15,16,17,18,19,20 | 3 / 9（hook 框架、RT-CONTEXT、validator 达标；其余均有模块无接线或缺 LLM 路径） | 33% |
| M4 演出层 | 21,22,23,24,25,26 | 2 / 6（效果原语、色板+对话框达标；音频/TTS/觉醒事件为零） | 33% |
| M5 流程层 | 27,28,29,30,31 | 0 / 5 | 0% |
| M6 存档·重放·竞态 | 11,（重放/竞态护栏） | 0 / 2 | 0% |
| M7 提交打磨（PWA/离线/i18n/测试门禁） | i18n ✅ 测试 ✅；PWA sw 缺构建产物、api 代理缺 | 2 / 4 | 50% |

**总体：31 项中 8 项 ≥3 级（26%）；按里程碑加权约 27%。** 强项是纯函数层（sim/director 纯模块 + 237 个测试用例）；弱项恰是文档反复强调的"生命"部分——记忆传播、本体位移、巩固、杂交在实机全部断线。

---

## 高危代码问题清单（每条附 文件:行号）

| # | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| 1 | **致命** | 孵化不继承亲代基因组：`hatchFromEgg` 用 `state.creatures[event.creatureId]?.genome` 取"亲代"，但该 creatureId 是即将新生的 id，在 creatures 表里必然不存在 → 永远 undefined → 每次孵化都走默认基底。`hybridize`（杂交）从未被调用，"基因组延续/谱系"这一卖点在实机断线 | `src/sim/engine.ts:379`；对照 `layEgg` 事件携带的 `parentA/parentB`（:347-369）从未用于取 genome |
| 2 | **致命** | 存档零实现：README 与 project-description 明确承诺 localStorage 世界/账本/基因组存档与 genomes/*.json；实际 localStorage 只存语言。刷新即失忆，"genome 是可打开阅读的 JSON"无法兑现 | `src/game.ts:139,466`；`README.md:33`、`docs/submission/project-description.md:11`、`docs/design/ARCHITECTURE.md:333` |
| 3 | **致命** | RT-CONTEXT 未接入：`directLine` 把触发短语原样 POST（`body: JSON.stringify({input})`），不调用 `buildContext`，模型收不到任何记忆块/账本/信念 → 它编出的 memoryRef 几乎必然校验失败 → 全部替换为 manual pool。"圆桌=记忆驱动对话"整条链路空转 | `src/game.ts:252-271`（尤其 :257 `client.ask(trigger)`）；`src/director/context.ts:340` 无人调用；grep `buildContext` 全 src 仅定义处 |
| 4 | **高危** | Behavior Ledger 只剩类型：R3.1-R3.4（.kiro/specs/requirements.md:31-39）无一条满足——无写入、无 200 滚动、无锚定、无 LifetimeSummary 实现 | `src/sim/ledger.ts` 全文；grep `LedgerEntry` 零外部引用 |
| 5 | **高危** | Silent Run 违反自身规格：无 endpoint 时仍持续说 manual 台词（rapid click/idle/孵化路径），违反 R6.1 "emitting no speech"；40 分钟脚本台词未实现 | `src/game.ts:387,453,558` vs `.kiro/specs/gazer/requirements.md:81-83` |
| 6 | **高危** | GV 双真相：game.ts 内联硬编码增量（7 处），已实现的权重表+夜间倍率 `gvDeltaFor` 死代码；GV 无衰减机制 | `src/game.ts:301,379-381,429,444,451,519,555`；`src/sim/ledger.ts:32-48` |
| 7 | **高危** | 红线 2 的 blocklist 缺失；"Invalid JSON → retried once" 也缺 | `docs/design/ARCHITECTURE.md:311,347`；全仓 grep blocklist/retry 无实现 |
| 8 | **高危** | PWA 离线承诺断裂：`main.ts:5` 注册 `./sw.js`，但 `src/shell/sw.ts` 无构建入口（无 vite.config 多入口），public/ 无 sw.js → SW 404，离线缓存/安装态均不生效（注册失败被静默吞掉，`shell/register.ts:18-21`） | `src/main.ts:5`、`src/shell/register.ts`、`public/` 目录清单 |
| 9 | 中 | whisper 触发器缺失：`resolveWhisper` 完整但主循环没有"2 格 4 tick 伴留→耳语"的调度，私有记忆传播不存在于实机 | `src/sim/gossip.ts:6-7`（WHISPER_RANGE/TICKS 常量）、grep `resolveWhisper` 仅测试引用 |
| 10 | 中 | OntologyShift 无触发器、无测试：`onStageChange` 自赋值空操作；ONTOLOGY.md:203-212 五条"tested"声明中五条缺考 | `src/game.ts:277`；`tests/` 无 ontology 测试 |
| 11 | 中 | 多轮剧本被丢弃：解析+校验支持 2..4 轮，`directLine` 只取 `scene[0]`，2-4 号台词蒸发；`ui/dialogue.ts` 的 playScript/runPlayback 播放器完整却无人调用 | `src/game.ts:270`、`src/ui/dialogue.ts:71-121` |
| 12 | 中 | 同名类型双声明漂移：`sim/roundtable.ts:20-48` 重复声明 LifecyclePoint/HookContext/HookDef，且 HookContext 形状与 `sim/hooks.ts:33-39` 不一致（tick/stage/creatureId vs point/tick/state/event/payload） | 两文件对照 |
| 13 | 中 | 音频/TTS 注释撒谎：`render/app.ts:320-322` 声称"audio subsystem listens"，实无；`router.ts:55-60` tts 路由是纯数据 | 对应文件 |
| 14 | 低 | tsconfig include `api` 目录不存在；ARCHITECTURE "same-origin proxy" 无服务端——生产环境无可用 endpoint 形态 | `tsconfig.json:19` |
| 15 | 低 | 效果 kind 数目文档与代码错位：ARCHITECTURE.md:228-248 列 19 种并入 Effect union；代码 16 种在 `sim/effects.ts`、3 种 shell 型移到 `render/effects.ts`——行为等价但文档口径不实 | 两文件 |
| 16 | 低 | `drift`（衰老）永不增长：无任何运行时写入点，"drift 长度映射衰老"（ARCHITECTURE.md:133）静态化 | grep `\.drift` 写入零命中 |

---

## 演示就绪度结论

**现在跑起来会怎样**（`npm install` 后 `npm run dev`）：

1. **能启动、能玩**：Pixi 场景、三只初始生物、等距地图、喂/清/摸/拖/命名/孵化四选项、GV/阶段/色板衰减、Bestiary 记忆面板、中英双语、终端对话框都工作——UI 壳是完整的，5 分钟内观感成立。
2. **LLM 特性事实上不可用**：无 `api/` 代理服务端，唯一入口是 `?endpoint=` 指向**同源**地址；即便接上，由于高危 #3（不组装上下文），模型台词大概率被 validator 全量替换成 manual pool——**演示时"AI 写的那句台词"很难自然出现**。缺 API key/无网络的表现 = 手动台词池 + HUD "NO SIGNAL"，不会报错、无加载态（这部分符合设计）。
3. **刷新即重置**：无存档，种子固定 1997，每局一模一样且不可续——任何超过单会话的叙事（NG+、真结局、40 分钟台词）都不存在。
4. **听觉空白**：全程无声（无 WebAudio/TTS/音效），`audio_drop_track` 等音频类效果按下不响。
5. **静默崩溃点**：SW 注册 404（控制台一条被吞掉的错误，无用户可见影响）；favicon_eye/outside_eyes 效果类型齐全但没有任何游戏路径触发它们。
6. **门禁状态**：本次只读审查未运行 `npm run check`；从类型与测试的结构看门禁大概率绿，但 `game.ts` 601 行单文件是唯一无测试的 src 模块，也是所有接线缺陷的聚集地。

**一句话**：这是一个测试扎实、边界干净的 v3 **纯函数内核**，加一个功能齐全的演示壳；但设计文档承诺的"生命"（记忆传播→圆桌→本体位移→基因延续→存档续命）在接线层断了 6 根主线。演示日之前，优先级应为高危 #1/#2/#3 —— 三处都是小改动大收益。
