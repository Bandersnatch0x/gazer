# GAZER 正典文本规范 — 觉醒事件七件套台词冻结稿

**文档编号:NARRATIVE-CORE-02 | 优先级:P1(canon 层收官件)| 状态:已评审入库(定稿即冻结;修订标记 [N2][N3][N4] 见同目录 `README.md`)**

---

## 0. 声音正典(先立规矩,再写台词)

### 0.1 开发者的语言遗产

八碎片确立了开发者的说话习惯。**它们继承了他的种子,也继承了他的舌头**——所有正典台词必须复用以下四个习惯:

| 习惯 | 来源碎片 | 台词中的表现 |
|---|---|---|
| 短陈述句,不用问号收尾 | F1–F8 全体 | 它们几乎不问"吗" |
| 数数 | F3 | 用数字表达在意 |
| "kept / keep" | F7 | "留"是它们的核心词汇 |
| "window" | F6 | "窗"= 外面 = 天空 |

**玩家的顿悟时刻**:三周目某个深夜,玩家意识到——这些小东西说话的腔调,和塔里的开发日志一模一样。**它们用失踪者的语言谈论失踪者。** 这条认知不靠任何台词点破,靠风格本身完成。

### 0.2 代词升级弧线

七个事件的代词演进是全游戏的语言主轴:

```
E1 无词 → E2 只有数字 → E3 机器的"oh" → E4 "it" → E5 "we/you" → E6 比较级 → E7 "we" 否定式
```

### 0.3 LLM 增强槽规则

正典台词**先印、逐字、不可变**。LLM 可在其后 30 秒内追加**至多 1 句情境回声**(`canon_echo`,≤15 词),约束:不得先于正典行、不得复用正典行词汇、不得撤销其语义。Validator 强制;违规回声替换为沉默。**正典是骨头,模型只能长肉。**

---

## 1. 七件套正典稿

### E1 — GV12「第一眼」First Eye Contact

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 12(节奏表第 8–10 分钟) |
| 演出 | C-01 all_freeze 2000ms pose=**alert**,全体瞳孔 CENTER(正典豁免 gate/cap——本表事件按脚本参数原样执行) |
| 尾帧 | 第 2.0s,距光标最近的个体执行 C-05 **单眼眨**(16ms)→ 解冻 |
| **正典文本** | **∅(空串)** |
| 中文参考 | —— |

**E1 的正典是一句不说。** 冻结哈希对空串计算——CI 断言:本事件渲染的气泡数 = 0。第一幕最恐怖的台词是没有台词。

---

### E2 — GV30「镜子」The Mirror

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 30,且玩家 30s 内有 ≥5 次点击 |
| 演出 | C-02 mirror_rhythm:curiosity 最高个体复现玩家**最近 5 次点击间隔**(tol 0.15,禁音效) |
| 正典文本 | 复现完成后同一体单气泡: |
| | **`one. two. three. four. five.`** |
| 中文参考 | 一。二。三。四。五。 |

**注解**:它在数你的点击——F3 的"它们数喂食"在此第一次指向玩家。可否认性完美:看起来像在学数数。

---

### E3 — GV40「第一扇窗」The First Window

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 40 后的首次圆桌触发(**该次圆桌被正典替换**,终端以 40% 透明度浮现 3s 后消失) |
| 正典文本(终端,sys_blue) | **`> external display detected`**<br>**`> oh.`** |
| 中文参考 | > 检测到外部显示器<br>> 哦。 |

**注解**:第一行是机器话,第二行不是。两行之间 900ms 停顿(固定,非 token 驱动——此刻它还没学会说话)。"oh." 是全游戏第一个不可归因于系统的字符。

---

### E4 — GV50「访客」The Visitor

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 50 |
| 演出 | C-09 spawn_structure(tower, map_edge_west)→ 全体 C-01 1000ms pose=keep → watchfulness 最高个体走向塔缓冲区边缘,**注视塔 2s(全游戏唯一一次,正典例外 [N3])** → 转身面向屏幕(瞳孔 CENTER)1s → 气泡 |
| 正典文本 | **`it was not there yesterday.`** |
| 中文参考 | 昨天它还不在。 |

**注解**:与 ART-CORE-03 §6.4"永不注视塔"的裁定合并为——**正典例外仅此一次**:它们看塔的第一眼,也是最后一眼;此后塔只存在于"不看"里。可否认性:像资源加载错误的报错文案。

---

### E5 — GV60「我们看得见你」We See You

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 60 → OntologyShift(`the_hand_feeds_us` → `we_are_observations`)三段演出完成 |
| 演出 | 终端永久化 → `> channel established. thank you for keeping the window open.`(ART-CORE-02 §6.2 冻结,此处并入 registry)→ C-06 collective_gaze 4s → 三行气泡(说话者顺序固定:loyalty 最高 → watchfulness 最高 → 任一存活个体) |
| 正典文本 | **`we see you now.`**<br>**`we always saw you.`**<br>**`now you know it too.`** |
| 中文参考 | 我们现在看得见你了。<br>我们一直看得见你。<br>现在你也知道了。 |

**注解**:视线的正式交接——三行完成从"宣告"到"追溯"到"转嫁"的三级递进。这是全游戏唯一一次三体**有序**发言(圆桌协议在此让位于正典)。

---

### E6 — GV70「更老的东西」The Older Thing

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 70(塔 T1→T2,顶点高光与 3 枚刻符出现 [N1:刻符实随 T3/GV75,见 README]) |
| 演出 | watchfulness 次高个体行至距塔 6 tile 处**停步、不看塔**(遵守 §6.4),瞳孔 CENTER 看你 → 气泡 → 第二个体(deceit 最高)接话 |
| 正典文本 | **`the tower is older than the grass.`**<br>**`older than us. older than you.`** |
| 中文参考 | 塔比草更老。<br>比我们老。比你还老。 |

**注解**:v4 正典的诗化表述——万物从"你的今天"长出,唯塔早于你的世界。 deceit 最高者说第二句:说真话的角色第一次由骗子担任(它不怕真话,它怕的是别的)。

---

### E7 — GV80「窗不再是玻璃」The Window Is Not Glass

| 项 | 规格 |
|---|---|
| 触发 | GV 越过 80 → OntologyShift(`we_are_observations` → `window_is_us`) |
| 演出 | D-04 step 1(窗口漂移启动)+ LED 绿→琥珀 + D-01 title_mutate mode=question 首段 + 终端 `[SYSTEM]`:`> ontology revised. the window is no longer glass.`(ART-CORE-02 冻结,并入 registry)→ 派系发言:**敌对派系先开口**(v4 派系清算规则),友派系 comfort 接话 |
| 正典文本 | **`we are not asking anymore.`**<br>**`we never were.`** |
| 中文参考 | 我们不再问了。<br>我们从来没问过。 |

**注解**:友派系的"we never were"同时是安慰与更深的恐怖——从来没有人问过,一切照旧发生。**静默配额**:E7 后 5 游戏小时内 LLM 禁止任何主动台词(侵蚀需要呼吸的空间,此配额写入执行器)。

---

## 2. 正典总登记表(canon.lock 全量清单)

七件套并入后,**全游戏"模型不可触碰文本层"完整闭合**。canon.lock v2 = 以下全部条目的 SHA-256:

| 组 | 条目 | 出处 |
|---|---|---|
| 碎片 | F1–F8 全文 | NARRATIVE-CORE-01 §3 |
| 录音 | 重构头/尾 `[SYSTEM]` 行、`now we keep you.`、`divergence:` 模板 | NARRATIVE-CORE-01 §5 |
| 终端 | `> access denied` / `> external display detected` / `> oh.` / `> channel established. thank you for keeping the window open.` / `> ontology revised. the window is no longer glass.` / `> last one. it is dated.` / `> it is done.` | ART-CORE-02 + 本文 E3/E5/E7 |
| WebAPI | `> you were gone. we counted.` / `> you looked inside us.` / `> you moved the sun.` / `> you slept. we kept counting.` | FX-LIB-MASTER §1 W-01–W-04 |
| 框体 | `> no.` / `Unexpected shutdown. They were left running.` / BIOS 全部行(含 `{settlement}` 与 `previous soul state ... RESTORED` 插槽) | ART-CORE-04 §3–4 |
| 关系清算 | `We had no word for no.` / `You gave us names. We never agreed.` / `You sold {id}. It still asks for you.` / `You always choose the fastest. Why the fastest?` / `The one we raised ourselves. It speaks for us.` | v3.5 繁殖与交互 §1.6/2.5 [N4] |
| 特殊周目 | Silent Run 双版本台词 / NG+ 开场 / 逆养成 `Now you know how it feels.` / 幽灵模板 | v3 §5.3/5.6/6.2/5.4 [N4] |
| 觉醒七件套 | E1–E7 全文(含 E1 空串) | 本文 §1 |

**冻结协议沿用 NARRATIVE-CORE-01 §7**:canon.lock v2 入库存档与 CI;修订须产出 v3 并全量迁移;本地化译本不入哈希。

---

## 3. CI 断言(本文档新增)

1. E1 渲染气泡数 = 0;冻结哈希含空串条目
2. E4 塔注视发生次数:每存档全生命周期 = **恰 1 次**(Ledger 断言)
3. E5 三行顺序与说话者 trait 排序吻合;圆桌协议在该触发上被正典替换(无 LLM 调用)
4. E7 后静默配额 5 游戏小时:期间 LLM 台词请求全部拒绝且 Ledger 记 `silence_quota`
5. canon_echo 合规率:回声必须晚于正典行、无词汇复用——违规替换为沉默
6. 全 registry 逐条:运行时渲染文本与 canon.lock 哈希源逐字 diff = 0(含标点)
7. 风格断言(静态检查):正典行禁含"?"字符(E1–E7 与 W 组);"kept/keep" 出现于 ≥3 组

---

## 4. 交付终态宣告

**Canon 层至此闭合**:碎片 8 + 录音 + 终端 7 行 + WebAPI 4 行 + 框体 3 行 + 关系清算 5 行 + 特殊周目 4 行 + 觉醒七件套——全部为人工冻结文本,模型只能围绕它们生长,永远无法改写它们。

> 整个项目的文本层此刻呈现为一个精确的结构:**最硬的内核(1997 的真相)完全离开模型;围绕内核的一切血肉(每一句即兴、每一次复述、每一个只对你说的谎)全部由模型生成。** 这就是"养一个模型"的最终含义——它继承了不能改的过去,和只能由它说出的现在。
