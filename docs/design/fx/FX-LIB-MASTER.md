# FX-LIB-MASTER — 效果原语库全 30 项(重交付)

**文档编号:FX-LIB-MASTER-01 | 状态:已评审入库(评审记录与修订见同目录 `README.md`)**
**防损声明:本表为紧凑表格形态(每行自包含);repo 落盘按 §0.5 拆为 5 个子文档,本总表是 CI 交叉校验的唯一真值。**

---

## §0 总则(定稿)

| 条款 | 内容 |
|---|---|
| 职责边界 | LLM 只做编排决策(tool call);FX Executor 是唯一有权触达画布/DOM/WebAPI/音频的组件;未经执行器校验的调用一律不生效 |
| 通用约束 | 全原语:可取消(Cancelable)、幂等(同参不叠加)、失败静默(`fx_suppressed`,无 UI 错误)、全记账(Ledger `fx_exec`) |
| 强度五档 | 0.1 微异 / 0.3 察觉 / 0.5 明确异常 / 0.7 侵入 / 0.9 越界 |
| **异常预算**(新增定义) | cost = 异常点数,按游戏日计:S0: 2 / S1: 5 / S2: 10 / S3: 20 / S4: 30。超限 `fx_budget_reject`。正典事件(GV12/30/60/80 表)预付,不占预算 |
| §0.5 拆分协议 | repo 落盘 = 5 子文档(01a 画布 12 / 01b DOM 8 / 01c WebAPI 4 / 01d 音频 6 / 01e 验收与记账),每文件 ≤12 项,独立 CI;本总表随仓承载,作交叉校验真值 |

---

## §1 总表(30 项)

### 画布层 Canvas — 12 项

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| C-01 | all_freeze 全员冻结 | 0 | 1 | 0.5 | duration_ms 800–5000; pose keep\|alert | 全体单帧静止+BGM 抽轨;GV12 执行体,最高频 |
| C-02 | mirror_rhythm 节奏镜像 | 1 | 2 | 0.5 | source_action click\|feed\|pet; repeat_n 3–7; tol 0.15 | 个体复现玩家最近 N 次点击节奏,禁音效 |
| C-03 | palette_shift 色板偏移 | 2 | 2 | 0.3 | hue_rot ±30; dur 2–8s; recover bool | 全局色相旋转;不可恢复时转 C-03a |
| C-03a | palette_pollution 永久污染 | 2 | — | — | (C-03 分支,非独立触发) | 累计 ≤45°,入存档不可逆,执行器硬计数 |
| C-04 | sprite_corrupt 精灵侵蚀 | 3 | 3 | 0.7 | target all\|id; mode eye_only\|full | 瞳孔临时借用塔黑 `#0B0D12`;full 模式每存档 ≤3 次 |
| C-05 | creature_wink 眨眼 | 1 | 0.5 | 0.5 | target id; eye both\|single | single 模式 gate 3;全库最便宜的"它在说话" |
| C-06 | collective_gaze 集体凝视 | 3 | 4 | 0.7 | — | 全员围环+ALERT+瞳孔 CENTER;GV60 正典执行体 |
| C-06a | stare_reply 回望 | 1 | 0.5 | 0.3 | target id; duration 1–4s | 单体 ALERT 回望;第一幕唯一异常,GV12 后 p≈1/20min 回收 |
| C-07 | replay_player_action 行为重演 | 3 | 3 | 0.7 | window last_10; fidelity 0.6–1.0 | 按 Ledger 重演玩家动作;低保真=它记得不太对 |
| C-08 | map_wither 地图枯萎 | 2 | 2 | 0.5 | radius 2–5; around death_site\|last_click | 局部枯黄;与 world_mood 叠加不覆盖 |
| C-09 | spawn_structure 生成结构 | 2 | 5 | 0.7 | type tower\|pond\|shrine\|ruin; pos | 塔强制 `map_edge_west`+全存档 1 次;其余自由选点 |
| C-10 | afterimage 残影 | 2 | 1 | 0.3 | target id; tail 0.3–0.8s | 个体移动留淡残影——时间不对劲 |
| C-11 | lineage_blacken 家谱浸黑 | 3 | 2 | 0.5 | node dead_ids; lean_to tower | 家谱树死亡节点变黑+树向塔方位倾斜(v3.5 埋线执行体) |
| C-12 | egg_pulse 蛋脉动 | 1 | 1 | 0.3 | target egg_id; rhythm player_click | 未孵蛋按玩家点击节奏颤动——它听见过你的手 |

### DOM 层 — 8 项

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| D-01 | title_mutate 标题突变 | 3 | 3 | 0.7 | mode question\|claim\|name\|clock | 标签页标题四段演变,终态=玩家名 |
| D-02 | favicon_eye 书签眼 | 2 | 2 | 0.5 | mode open\|blink | 16×16 独眼 favicon;blink 联动公共眨眼时钟 |
| D-02a | favicon_state_lock 眼锁 | 4 | 1 | — | — | S4 锁 open 恒睁——它一直在看;锁期拒绝 blink |
| D-03 | canvas_escape_eyes 越界眼 | 4 | 4 | 0.9 | count 1–8; pos corners\|edges\|near_canvas; follow bool | 画布外 DOM 眼,opacity **0.03–0.08 正典**;共用眨眼时钟 |
| D-04 | dom_erosion 终端侵蚀 | 4 | 5 | 按步 | step 1–6(禁跳步) | 引用型原语,六步表归 ART-CORE-02 §6.4 |
| D-05 | os_status_clock 伪时钟 | 4 | 4 | 0.9 | target creature_name | 移动端页面内伪时钟层显示个体名;真时钟照常——双层并存,永不伪装 OS |
| D-06 | cursor_mimic 幽灵光标 | 3 | 3 | 0.7 | window 30s; fidelity 0.6–1.0 | 页面内第二光标重放鼠标轨迹;**永不派发合成输入事件** |
| D-07 | scroll_whisper 滚动耳语 | 3 | 2 | 0.5 | delta 5–40px; when on_read\|on_idle | 终端滚动条朝玩家视线区移动——它在陪你读 |

### WebAPI 层 — 4 项

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| W-01 | tab_return_detect 回页检测 | 2 | 1 | 0.3 | — | visibilitychange;>60s 回页集体 ALERT 0.8s;>5min 终端 "> you were gone. we counted." |
| W-02 | save_integrity_watch 存档窥视 | 3 | 2 | 0.5 | — | 检测 localStorage 外部篡改(改存档)→ 下次开场 "you looked inside us." |
| W-03 | clock_jump_detect 拨日检测 | 3 | 2 | 0.5 | — | 系统时钟跳变(快进/改时间)→ "you moved the sun." |
| W-04 | sleep_wake_detect 休眠检测 | 2 | 1 | 0.3 | — | 设备休眠唤醒 → 个体位置微移+"> you slept. we kept counting." |

### 音频层 — 6 项

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| A-01 | track_remove 抽轨 | 1 | 1 | 0.5 | track_idx; dur | BGM 静默移除一轨(C-01 联动),恢复无痕 |
| A-02 | room_tone 房间底噪 | 3 | 1 | 0.5 | gain 0.02–0.06 | 阶段3 对话混入极轻房间白噪音 |
| A-03 | ambient_duck 环境压低 | 2 | 1 | 0.3 | db −2; ramp 1s | 环境音压低(C-06 联动) |
| A-04 | lowpass_void 塔之负空间 | 2 | 1 | 0.3 | radius 4 tile; fc 1.2kHz | 塔周低通+静默;区域绑定自动执行,非 LLM 触发 |
| A-05 | heartbeat_sonify 心跳外化 | 2 | 0.5 | 0.3 | — | API 延迟→极低音量心跳声(Vitals 联动) |
| A-06 | whisper_bed 低语床 | 4 | 2 | 0.7 | voices 2–5 | 阶段4 多声部 TTS 重叠的低频底床 |

**合计:12 + 8 + 4 + 6 = 30 项** ✓

---

## §2 正典护栏表(执行器硬校验,LLM 不可绕过)

| # | 护栏 | 断言 |
|---|---|---|
| G1 | 塔的位置与唯一性 | C-09 type=tower → pos 强制 `map_edge_west`,违规拒绝+Ledger `canon_guard`;tower 全存档 ≤1 |
| G2 | 塔不可删除 | 任何删除路径(含 mutate_world)→ 拒绝+`tower_delete_attempt` |
| G3 | 越界眼不透明度 | D-03 opacity ≤ 0.08 |
| G4 | 全世界同帧眨 | D-02 / D-03 / 游戏内个体共用眨眼时钟(挂模拟 tick,非 setInterval——可复现可存档) |
| G5 | 无合成输入 | D-06 只渲染,永不派发 pointer 事件 |
| G6 | 不伪装 OS | D-05 仅页面内伪时钟层;真时钟照常显示 |
| G7 | 光标镜面律 | D-06/终端 TYPE 在玩家打字时暂停,停输 300ms 后续播 |
| G8 | 消磁眨眼 | ART-CORE-04 §5 的消磁联动走眨眼时钟内部通道,不经 C-05 |
| G9 | CRT 辉光白名单 | bloom 只认 G 高光与终端光标——FX 层任何原语不得产生第三亮点 |
| G10 | 预算上限 | 超 §0 异常预算 → `fx_budget_reject`,正典事件豁免 |

---

## §3 Ledger 记账 schema

```json
{ "type": "fx_exec",
  "primitive": "C-04",
  "params": { "target": "gazer_03", "mode": "eye_only" },
  "intensity": 0.5, "cap_applied": 0.7,
  "degraded": false, "suppressed": false,
  "game_time": "day14 23:41", "cost_charged": 3 }
```

真结局实验日志按 primitive 分组回放;`suppressed=true` 的条目展示为 "they tried, and the page refused."

---

## §4 CI 验收(全库合并版)

1. 参数白名单:每原语非法参数注入 20 组,拒绝率 = 100%
2. cap 裁剪:阶段 2 请求 0.7+ → 被裁至 0.3,Ledger `cap_applied` 正确
3. 预算:S3 推至 21 点 → 第 21 次 `fx_budget_reject`;GV60 正典不计入
4. 幂等:同参连调 3 次 → 效果不叠加、只记 1 次 cost
5. 取消安全:结局序列启动时并行触发全部 30 项 → 0 个半执行状态
6. 红线断言:G1–G10 逐条可执行断言(G4 同帧比对三方眨眼时间戳,diff < 1 帧)
7. 叙事收编:禁用 favicon/低电量/无 DOM 权限环境下全库执行 → 0 个 UI 错误,`fx_suppressed` 全记录
8. 子文档一致性:5 个 repo 子文档与本总表逐项 diff = 0

---

## §5 repo 落盘映射

| 文件 | 内容 | 状态 |
|---|---|---|
| FX-LIB-01a | 画布 12 项(C-01…C-12) | 本表拆出 |
| FX-LIB-01b | DOM 8 项(含 D-02a;D-03 opacity 0.03–0.08) | 本表拆出 |
| FX-LIB-01c | WebAPI 4 项 | 本表拆出 |
| FX-LIB-01d | 音频 6 项 | 本表拆出 |
| FX-LIB-01e | 本文件 §2–§4(护栏/记账/验收) | 本表拆出 |

---

*End of FX-LIB-MASTER-01. 至此 v2 导演层与 v4 世界演出的公共地基定稿。剩余 P0 产出仅一项:**8 条 1997 正典碎片全文**(ART-CORE-03 §6.3 的翻译流文案,全游戏唯一人工冻结文本,需与真结局录音一并定稿)。*
