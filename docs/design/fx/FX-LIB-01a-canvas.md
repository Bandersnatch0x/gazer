# FX-LIB-01a — 画布层 12 项

**拆分自 `FX-LIB-MASTER.md` §1 画布层;总则、护栏、记账、验收以 master 为唯一真值。**

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

*End of FX-LIB-01a.*
