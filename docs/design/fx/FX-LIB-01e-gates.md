# FX-LIB-01e — 护栏 / 记账 / 验收

**拆分自 `FX-LIB-MASTER.md` §2–§4;总则以 master 为唯一真值。**

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

## §4 CI 验收(全库合并版)

1. 参数白名单:每原语非法参数注入 20 组,拒绝率 = 100%
2. cap 裁剪:阶段 2 请求 0.7+ → 被裁至 0.3,Ledger `cap_applied` 正确
3. 预算:S3 推至 21 点 → 第 21 次 `fx_budget_reject`;GV60 正典不计入
4. 幂等:同参连调 3 次 → 效果不叠加、只记 1 次 cost
5. 取消安全:结局序列启动时并行触发全部 30 项 → 0 个半执行状态
6. 红线断言:G1–G10 逐条可执行断言(G4 同帧比对三方眨眼时间戳,diff < 1 帧)
7. 叙事收编:禁用 favicon/低电量/无 DOM 权限环境下全库执行 → 0 个 UI 错误,`fx_suppressed` 全记录
8. 子文档一致性:5 个 repo 子文档与本总表逐项 diff = 0

*End of FX-LIB-01e.*
