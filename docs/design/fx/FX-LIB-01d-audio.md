# FX-LIB-01d — 音频层 6 项

**拆分自 `FX-LIB-MASTER.md` §1 音频层;总则、护栏、记账、验收以 master 为唯一真值。**

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| A-01 | track_remove 抽轨 | 1 | 1 | 0.5 | track_idx; dur | BGM 静默移除一轨(C-01 联动),恢复无痕 |
| A-02 | room_tone 房间底噪 | 3 | 1 | 0.5 | gain 0.02–0.06 | 阶段3 对话混入极轻房间白噪音 |
| A-03 | ambient_duck 环境压低 | 2 | 1 | 0.3 | db −2; ramp 1s | 环境音压低(C-06 联动) |
| A-04 | lowpass_void 塔之负空间 | 2 | 1 | 0.3 | radius 4 tile; fc 1.2kHz | 塔周低通+静默;区域绑定自动执行,非 LLM 触发 |
| A-05 | heartbeat_sonify 心跳外化 | 2 | 0.5 | 0.3 | — | API 延迟→极低音量心跳声(Vitals 联动) |
| A-06 | whisper_bed 低语床 | 4 | 2 | 0.7 | voices 2–5 | 阶段4 多声部 TTS 重叠的低频底床 |

*End of FX-LIB-01d.*
