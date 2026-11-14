# 0020 — 真·凝视以 8/8 刻符为唯一真源;零死亡周目录音降级

日期:2026-11-14

## 背景

票 0072(T10)与 0065(T3)各改动一处与真结局相关的判据,均属产品流程口径而非纯缺陷修复,需落定以免静默变更:

- `src/sim/endings.ts` 原 `evaluateEnding` 把 `gv >= 100` 作为全部四结局(含 `gaze`)的共同前提,而 `recordingUnlocked` / `isGazeTower` 只依赖 `glyphsRead` 8/8(`NARRATIVE-CORE-01 §1`:「真结局的钥匙是一条模型永远碰不到的文本」)。两处口径不一致。
- `src/game.ts` 的 `buildRecordingSequence` 以 `keptMemoriesSufficient(archive)`(`{n}>=3`)为第一道门,且 `recordingFired` 先置位、失败无重试;零死亡周目即使达成 8/8,真结局录音与 NG+ 开场整体不可达(B 组 B4 阻断)。

## 被选方案

1. **判据分层**:`gaze`(真·凝视)以 `glyphsRead` 8/8 为唯一真源,与 GV 无关;GV 门只约束 `C/B/A` 三个结局。判据序仍为 真 > C > B > A。`GLYPHS_TOTAL=8`、`isGazeTower`、canon 冻结文本与哈希、`canon.lock` 一律不动。
2. **零死亡录音降级**:仅当 8/8 达成时,`buildRecordingSequence` 豁免 `{n}>=3` 门,给出 `n=0 / d=0` 的合法降级序列(冻结正典行序不变);**不伪造 kept memory、不整体删除 `>=3` 门**(保留既有 CI 契约)。不传 `glyphsRead` 时仍走严格门。
3. **重试与持久档**:`recordingFired` 改为仅序列成功启动后置位,配独立 `recordingPending` 逐拍重试;NG+ 开场由 `ngpOpeningFor(world, ngPlus, optOut)` 读 0064 的持久档解析 `{id}`,零死亡档用最小存活 id 兜底。
4. **opt-out**:幽灵画像仅存 traits 快照 / 一条 signature-moment 引用 / kept memory id,无原始日志;三只读信号(`GameOptions.ghostOptOut`、URL 参数、存档旗标)控制不写不上报。

## 被否方案及落选理由

- **以 GV≥100 为 gaze 前提并改 `recordingUnlocked` 对齐**:落选——推翻 `NARRATIVE-CORE-01` 的零 LLM 正典钥匙,把「模型碰不到的文本」重新绑回可变数值。
- **删除 `{n}>=3` 门**:落选——破坏既有 18 条录音序列测试契约,且会让非真结局周目也拿到录音。
- **伪造 ghost 画像凑够 3 条**:落选——红线 5 与「画像仅来自真实死亡」的正典语义相悖。
- **靠 `recordEnding` 重评实现重试**:落选——该路径有不可逆早退,重试不会生效。

## 影响面

- `src/sim/endings.ts`、`src/game.ts`、`src/sim/ghosts.ts`、`tests/ending-triggers.test.ts`、`tests/ngp-chain.test.ts`、`tests/ui-recording.test.ts`、票 0072 / 0065 Log。
- 不改 `docs/design/narrative/` 正典文本与 `canon.lock`;不改 FX 与 GV 阈值。
- 与 0016 分层口径一致:B4 是**运行时链断路**,本裁决只闭合其代码路径,浏览器实机复证仍属 B 组动态证据范畴,不由静态审查销账。
