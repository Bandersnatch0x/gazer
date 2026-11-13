# FX-LIB-MASTER 入库评审记录

FX-LIB-MASTER-01(效果原语库全 30 项,定稿候选)经评审后入库本目录:master 为 CI 交叉校验唯一真值,repo 落盘按 §0.5 拆为 5 子文档(01a–01e)。

## 评审结论

**通过,带修订入库。** 30 项参数表自洽(gate/cost/cap 三轴齐全),正典护栏 G1–G10 与 ART-CORE 四锚点逐条对得上(A-04=塔音频负空间、D-04=终端侵蚀六步、G9=bloom 白名单、G7=光标镜面律)。与既有实现的映射与缺口如下。

## 修订记录

| # | 级别 | 内容 |
|---|---|---|
| F1 | 映射裁定 | 本仓已有效应原语体系(`src/sim/effects.ts` 16 种 + `src/render/effects.ts` plan/apply 执行器)。FX 30 项中 **11 项同源**:C-01↔freeze_all、C-02↔mirror_click_rhythm、C-03↔palette_shift、C-05↔creature_wink、C-06a↔gaze_at_player、C-09↔spawn_structure、D-01↔title_mutate、D-02↔favicon_eye、D-03↔outside_eyes、A-01↔audio_drop_track、C-06↔collective_speech/gaze 组合。裁定:**FX 并入既有 Effect union 与 plan/apply 执行器扩展**,不另起第二执行体系;C-xx/D-xx/W-xx/A-xx 编号为规范面 ID,代码面沿用 snake_case kind。 |
| F2 | 现状缺口 | 现行 `outside_eyes` opacity 经 clamp01 无 0.08 上限——G3 护栏落地时补 cap(记票 0024)。 |
| F3 | 范围分期 | C-09 的 pond/shrine/ruin 为扩展位;现行结构白名单仅 black_tower,本仓首批只落塔(G1 正典位),其余结构延后。 |
| F4 | 实现口径 | 异常预算按游戏日计:预算计数挂模拟 tick(与 G4 眨眼时钟同纪律,确定性、可入存档);`fx_budget_reject`/`fx_exec` 均入 Ledger。 |
| F5 | 外部名扫描 | 全文无外部产品名,通过;LLM/TTS/OS 为技术词豁免。 |
| F6 | 口径统一 | D-05 与 ART-CORE-04 §8 的移动端时钟演出统一为:**页面内伪时钟层 + 真时钟照常,双层并存**,永不伪装 OS(= G6);ART-CORE-04 §8 的「OS 状态栏时钟替换」按此理解。 |
| F7 | 规范联动 | master 尾注确认剩余 P0 仅一项:8 条 1997 正典碎片全文(ART-CORE-03 §6.3)——须人工定稿后冻结,列为待裁项,不阻塞执行器骨架。 |

## 待裁默认项(按推荐执行,用户可一句推翻)

1. **F1** FX 并入既有 Effect union(替代方向:独立 FX 执行器子系统——双执行体系,不推荐)。
2. **F7** 8 条正典碎片由用户定稿(替代方向:智能体起草候选交用户裁——可作后备)。

## 落地批次

```
① 执行器核心骨架:校验/预算/护栏 G1–G10/幂等/取消/记账(纯逻辑,票 0024)
② 画布层 12 项并入(与 0019 sprite 合并后)
③ DOM/WebAPI/音频层(依赖 0020 终端与 0022 CRT 合并后)
```
