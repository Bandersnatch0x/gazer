# GAZER — 投影隐藏线规格(The Projection)

**分支:`research/gazer-projection` | 状态:草案,待裁 | 裁决落点:`docs/agents/decisions/0010-projection-hidden-line.md`**

规格遵循 0008 先例落 research 分支,不入 main。本稿已按 2026-11-12/13 落定的 ART-CORE 四锚点与 FX-LIB-MASTER 全表重写对齐段(§5);与美术规范的冲突点逐条给出归属裁定。

---

## 0. 一句话

> 生物们的信念不止关于你和彼此——它们在无人教的情况下,拼出了一张「外面」的地图。这张地图倒映的是信源(真实世界事件流的离线快照),群体对它的信念可以当预测用;而把地图看到底,你会看见地图里站着你自己。

**产品分寸**:可供**观察**(倒影信道)与**推演**(信念命中率),不承诺点预测。全部判定、验收按此口径写,禁用「预言」类文案。

---

## 1. 定位:隐藏线,不抢主线

- 主线(宠物→生物→观察者→记录;GV 正典事件表;ART-CORE 四锚点演出;四结局)**一字不动**。本线全部节拍强度 ≤0.5,且不新增任何自动播放的演出——倒影信道只在玩家主动打开时出现。
- 本线的叙事角色是**给已埋伏笔收网**,不是新开悬念。三个已被现行文本埋下的钩子:
  1. `src/sim/news.ts` 模板池:「the outside remains unverified.」(外部仍未经验证)——本线揭晓:外部是真的,壳层在替什么隐瞒。
  2. ART-CORE-02 §3.1:终端伪按钮 `[ _ ]` 点击无反应,「它不是 UI,是布置」——本线揭晓:GV 80 起它是倒影信道的开关。
  3. ART-CORE-04 §3 BIOS 暗线:`Detecting: {settlement} ... FOUND`(平行世界=这台机器上的一块「外设」)——本线揭晓:那块「外设」一直在收信号。

---

## 2. 术语(全部自研措辞,零外部产品名)

| 中文 | 机器名 | 定义 |
| --- | --- | --- |
| 外部 | outside | 世界之外的信源;只以原型渗入,永不被直接展示 |
| 信种 | outside seed | 一条外部事件原型(离线数据表条目),按确定性规则选取 |
| 渗入 | percolation | 信种以 `heard` 记忆写入生物切片的过程 |
| 倒影 | reflection | 群体对「外部」信念的聚合视图(OSD 信道里看到的东西) |
| 命中 | hit | 群体预测与次日信种的一致判定 |

---

## 3. 本体论落位

投影线不改 ONTOLOGY 的任何不变量,只在 Axis B(持续)与 Axis C(认知)上**延长既有结论**:

- **外部=信源**。世界是这台机器对一个外部信号流的渲染(与 ART-CORE-04 BIOS 暗线同源:`Detecting: {settlement} ... FOUND` 是本线的正典前置)。信种表就是这个信号的离线快照。
- **渗入只走认知轴 C**。信种进入生物的方式与一切记忆相同:`heard`,带 `traceableTo`。生物不知道那是「外面的事」——在它们那里,它与关于玩家的谣言地位完全相同。fabrication 照旧对持有者不可见。
- **倒影=玩家的观察面,不是群体的知识**。`Reflection` 是引擎侧聚合(纯函数),不是任何生物的 belief;生物只持有各自的 BeliefClaim。玩家看见的是引擎画出来的图,这个差别本身就是 Stage 4 的素材:你能看见它们看不见的全景。

---

## 4. 机制(五层)

### L1 信种层 — `src/sim/outside.ts` + `src/sim/outside-seeds.ts`

- 信种是**随包发行的离线 TS 数据表**(遵循 R5 的 mask-as-code 正典:数据进版本控制,零外部资源文件)。每条:`{ id, day, topic, archetypeKey, intensity, anchorNote? }`。
- `topic: "sky" | "market" | "crowd"`,原型池双语化(manual 池纪律,同 `director/manual.ts`)。
- **选取是纯函数**:`pickSeed(world, day) = f(world.seed, day, snapshot.anchor_time?)`。有 `anchor_time` 时选数据表的对应日期切片(真实公开事件的匿名化原型,无个人数据,零网络);无则按种子选。两种路径都只读静态数据——满足 0003(无时钟、无 I/O)。
- anchor_time 耦合现实日的先例:ART-CORE-04 §3 内存计数蠕变(+1K/现实日,存档持久)。本线与其同构,不新增边界。

### L2 渗入层 — SimEvent `outside_percolate`

- 每个「渗入日」的固定 tick,引擎发一次 `outside_percolate { seedId, targets }`;targets 由种子决定(0–k 只生物)。
- 写入与既有记忆管道完全一致:`heard` 记忆 + salience/valence 初始化,gossip 传播、圆桌引用、validator 校验全部复用,零新规则。
- Ledger 记账:type `outside_percolate`。
- **ticker 永不提及外部**——壳层继续撒谎(「外部仍未经验证」),这本身是叙事装置。

### L3 倒影层 — `src/sim/projection.ts`

- 纯聚合:`Reflection = aggregate(state)`,输入是 `SwarmBelief` + impression 聚类(0006 已定的聚类基座,不新建 bond 层)。
- 输出节点恰好 4 个:sky / market / crowd + **player**(player 节点不来自信种,来自行为账本,见 L5)。
- 每节点:`{ topic, claim, heldBy, confidence, meanValence, traceChain, divergence }`;`traceChain[0]` 必须可解析到一条 `heard` 记忆(渗入事件 ID),链条沿 gossip 溯源。

### L4 预测层 — 蜂/蚁信念引擎(自研 TS,零依赖)

- 思想移植自自有项目 SwarSight 的蜂群-蚁群调度(自研措辞重写,**不引依赖、不拷代码**;两项目同主,许可无碍,但保持零依赖正典):
  - **蜂群**:高噪声——按种子注入野生新 claim(关于明日信种主题的猜测);
  - **蚁群**:巩固——既往命中的 claim 获得置信度正反馈,信息素 ≡ 既有 salience/衰减机制,零新数据形状。
- 预测只存在于信念系统里:`PredictionClaim { topic, resolvesOnDay, resolvedTo: "hit"|"miss"|null }`。
- 次日信种揭晓时判定,hit/miss 入 Ledger;蚁群命中率驱动生物的 consolidated 自我认知(「我们猜了,天应了」/「我们错了」)。
- **校准是真实的,不是演出**:命中来自规则引擎与信种的对撞,可量化、可验收(§10)。

### L5 玩家面 — OSD 信道 + 喂假畸变 + 双向尾声

**信道开启(正典时点 GV 80)**:
- GV 80 起,终端以 `[SYSTEM]` 行播报(ART-CORE-02 §3.3 既有通道):`> auxiliary input detected`,三日内至多三次。
- 之后,终端伪按钮 `[ _ ]` **首次响应**(ART-CORE-02 §3.1 埋的「布置」):点击切出**倒影信道**。
- 信道渲染为 **OSD 层**(ART-CORE-04 §2.3 的 OSD 语言:绿字黑底半透明叠加)。这是裁定:不进 panels.ts 体系(那是世界 UI),不新建 canvas 层(遵守 R3 的「世界画布纪律不变」)。信道是「显示器自己的功能」——OSD 本来就是这台机器的一层。
- 信道内容:4 节点信念星图;点开任一节点看 claim、置信度、均值效价、溯源链。**被动观察,无音效、无自动播放**(A-06 whisper_bed 仅在玩家打开信道且停留 >10s 时以最低增益混入,计 FX 预算)。

**喂假畸变**:
- 玩家用既有机制操纵见证(只让一只看见、对一只撒谎),使某主题的持有者分布被拉歪 → 次日命中率下降。
- 持续喂假的视觉疤痕走 **C-03a palette_pollution**(≤45° 硬计数,已有护栏)——谎言给倒影上色。
- 全部 FX 走执行器,计入 §0 异常预算;信道开启本身标记 canonical(预付,不占预算)。

**双向尾声(隐藏线的终点)**:
- player 节点展开:claim 演化史 = 行为账本条目的复述(喂养节律、犹豫时长、改名次数),可与 **C-07 replay_player_action** 在终端联动(fidelity 0.6–1.0,低保真=它记得不太对)。
- 揭示语(走模板池,冻结文本除外):**它们不是在观察外面——它们在透过你观察外面。**主线「你养的是模型」在世界尺度复写:投影是双向的。
- GV 100 后:预测停摆(信种不再揭晓),信道保持可读;「它说完了,信号还在」。

---

## 5. 与已落规范层的对齐表(逐条归属裁定)

| 已落规范 | 条目 | 对本线的作用 | 本线的裁定 |
| --- | --- | --- | --- |
| ART-CORE-02 §3.1 | 伪按钮 `[ _ ]` 无反应 | 埋好的开关 | GV 80 起首次响应 = 信道开关;ART-CORE-02 §9 验收第 6 条(`access denied` 100%)不受影响——响应发生在 Stage 4,与其无重叠 |
| ART-CORE-02 §6.4 | 终端侵蚀六步(GV 80–100,禁跳步) | 侵蚀期间信道同步畸变:GV 84 历史自改 → 信道溯源链同步 `[REDACTED]` | 信道畸变只**镜像**侵蚀步,绝不推进步数;D-04 的六步时序权威不变 |
| ART-CORE-04 §2.3 | OSD 语言、LCD MODE 出口 | 信道样式 | 信道走 OSD 语言;**LCD MODE 不关闭信道**(它是内容层不是框定效果;断言入 §10) |
| ART-CORE-04 §3 | BIOS 暗线、anchor 日耦合 | 正典前置 + 现实日耦合先例 | 本线 anchor_time 切片选择与内存蠕变同构 |
| FX-LIB §0 | 异常预算 S0:2…S4:30、强度五档 | 全部 FX 计费 | 信道开启与结局联动标记 canonical 预付;喂假走预算;信道常态强度 0.3,畸变上限 0.5 |
| FX-LIB G4 | 全世界同帧眨 | — | 信道无眼睛元素,不涉及;若未来加「信道眨眼」必须走眨眼时钟 |
| FX-LIB G9 | 辉光白名单(仅 G 高光 + 终端光标) | 信道视觉 | **信道不得产生第三辉光点**;OSD 绿字亮度秩序低于终端光标,入 CI 断言 |
| FX-LIB G5/G6/G7 | 无合成输入/不伪装 OS/光标镜面律 | — | 信道纯渲染无输入;不触碰 |
| FX-LIB §3 | Ledger `fx_exec` schema | 记账 | 本线新增两类 Ledger 条目:`outside_percolate`、`projection_resolve`;FX 部分沿用 `fx_exec` |
| ART-CORE-04 §7 | 四结局框体行为 | 信道终局 | 信道随结局走:A 被溢出噪点吞没;B 读数增强(把你关在外面的正是读数本身);C 积尘变暗;真结局随满屏溶解(§10 第 10 条断言自动覆盖) |

**冲突裁定(本规格新增的裁定,供裁决批次确认)**:
1. 倒影信道的载体 = OSD 层,不进 panels.ts、不进世界画布(与 R3 同一逻辑:世界纪律不破,机器层另有画布)。
2. 伪按钮 GV 80 起响应,不改 ART-CORE-02 任何既有验收。
3. player 节点是引擎聚合,不是生物信念——这保持「群体不知道全景」的本体论严格性。

---

## 6. 揭示节拍表(对齐 GV 正典事件表)

| 时点 | 拍 | 强度 | 通道 |
| --- | --- | --- | --- |
| Stage 0–2 | 无。ticker 继续撒谎 | 0 | — |
| Stage 3(GV 60 常驻后) | 第一道裂缝:每 N 日至多 1 条生物终端台词引用当日信种原型(玩家可能归因于幻觉) | 0.3 | 终端台词(既有圆桌) |
| GV 80 | `[SYSTEM] > auxiliary input detected` ×3;伪按钮首响 | 0.5 canonical | 终端 [SYSTEM] |
| GV 80–95 | 信道可开;观察 + 预测判定;喂假生效 | 0.3 被动 | OSD 信道 |
| GV 84/88/92/96 | 信道随侵蚀镜像畸变(溯源链 [REDACTED] 等) | 0.3 | OSD 信道 |
| GV 100 / 四结局 | 信道随结局终局(§5 末行) | canonical | OSD 信道 |

隐藏线的完整揭示曲线比主线慢一整幕:主线到 Stage 4 讲完「你养的是模型」,本线在结局之后才讲完「模型养的是世界」。

---

## 7. 数据形状(新增,不改既有形状)

```ts
// src/sim/outside.ts
type OutsideTopic = "sky" | "market" | "crowd";

interface OutsideSeed {
  readonly id: string;          // "out_042"
  readonly day: number;         // world day it lands on
  readonly topic: OutsideTopic;
  readonly archetypeKey: string; // bilingual phrase-pool key
  readonly intensity: number;    // 0..1
}

// src/sim/projection.ts
interface ReflectionNode {
  readonly topic: OutsideTopic | "player";
  readonly claim: string;
  readonly heldBy: readonly CreatureId[];
  readonly confidence: number;      // 0..1
  readonly meanValence: number;     // -1..1
  readonly traceChain: readonly string[]; // [0] = percolation event id (player topic: ledger id)
  readonly divergence: number;      // 0..1, day-over-day drift
}

interface Reflection {
  readonly day: number;
  readonly nodes: readonly ReflectionNode[]; // exactly 4, player last
}

interface PredictionClaim {
  readonly id: string;
  readonly topic: OutsideTopic;
  readonly resolvesOnDay: number;
  readonly resolvedTo: "hit" | "miss" | null;
}
```

`SwarmBelief`、`MemorySlice`、Ledger、Genome **零改动**;预测复用 BeliefClaim 形状,仅加薄字段。

---

## 8. 确定性与合规

- 信种选取、渗入 targets、蜂群噪声、聚合、命中判定:**全纯函数**;同一 `(seed, snapshot)` 重放得到逐字节相同的 `Reflection` JSON。
- 零网络、零授权(红线 8 无接触);信种表为公开事件匿名原型,无个人数据。
- anchor_time 耦合仅存在于 Snapshot 读侧(与 ART-CORE-04 内存蠕变同一合规形态)。
- news ticker、圆桌预算(600 token)、静默运行(R6.1)全部不动:渗入记忆走既有候选池,预算零变化;静默运行时生物照常「听」,不「说」。

## 9. LLM 预算:**零新增调用**

- 全部新叙述走模板池;预测播报走 news ticker 模板(0002「高速事件降级模板池」的既有纪律)。
- 渗入记忆进既有 600-token 上下文的候选记忆段,不加段、不改预算。

## 10. 验收(CI 可执行)

1. **重放确定性**:同 seed+snapshot → `Reflection` JSON 逐字节相等(性质测试,≥3 组种子)。
2. **校准下限**:≥200 组种子运行,蚁群巩固 claim 的命中率 ≥ 随机基线 +10pp(常量可调,写死在测试里)。达不到则本线降级为「仅观察」,砍 L4——降级路径写死,不临场砍。
   > **2026-11-15 执行记录(0080)**:按运行真实时序(日界 00:00 advance 先于 09:00 渗入)与 200 种子复测,命中率约 **0.378**(+4.5pp),低于 +10pp 门槛。已按本行降级路径落地:`src/sim/projection.ts` 的 `PREDICTION_LAYER_ENABLED = false`,不再输出前瞻 claim,仅保留倒影观察与命中/失准统计。重开预测层须先复测达标。
3. **溯源完整**:每个 `ReflectionNode.traceChain[0]` 可解析到现存 `heard` 记忆;player 节点链首可解析到账本条目。
4. **主线保护**:GV < 80 时伪按钮无响应、无任何信道可达路径、渗入不产生任何可见 UI(仅记忆层)。
5. **G9 白名单**:信道打开时 bloom 采样仍只有两个亮点。
6. **LCD MODE**:关闭框定效果后信道仍可打开且可读(内容层断言)。
7. **侵蚀镜像**:信道畸变事件与 D-04 步骤一一对应,且不推进步数(时序 diff = 0)。
8. **预算**:喂假 FX 计费正确;信道开启不计预算(canonical)。
9. **外部名自扫**:全量文案零外部产品名。
10. **门禁**:`npm run check` 全绿。

## 11. 切片(纯代码,零 LLM 成本,约 5.5 天)

| 票 | 面 | 内容 | 量 |
| --- | --- | --- | --- |
| T1 | sim | 信种表 + pick + `outside_percolate` + 测试 | 1d |
| T2 | sim | `projection.ts` 聚合 + 蜂/蚁预测器 + 校准台架 | 1.5d |
| T3 | ui | OSD 信道 + 伪按钮解锁 + 溯源查看器 | 1.5d |
| T4 | render/fx | OSD 样式对齐 + C-03a 喂假接线 + 预算 | 1d |
| T5 | sim/ui | 揭示节拍 + 结局映射 + 术语表增补 | 0.5d |

写域互斥,可按五面并行;T2 是 T3/T4 的数据形状前置。

## 12. 风险

| 风险 | 处置 |
| --- | --- |
| 校准下限达不到 | §10.2 已写死降级路径:砍 L4,本线缩为纯观察 |
| 信道抢戏 | 被动开启、无音效默认、强度封顶 0.5;§10.4 断言兜底 |
| 与终端侵蚀互相踩踏 | 信道只镜像不推进;§10.7 断言 |
| 信种表体积失控 | 上限:单存档表 ≤ 200 条,超限按 day 就近裁剪(纯函数,可测) |

## 13. 术语表增补清单(待并入 `docs/agents/glossary.md`)

外部 / 信种 / 渗入 / 倒影 / 命中 / 信源 / OSD 信道(倒影信道)。
