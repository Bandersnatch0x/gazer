# Demo video cut plan

This is the original pre-production plan, translated into English. It describes the `run8` capture chain recorded on November 13, 2026, from 15:05:53 to 15:37:16. The source session lasted 31 minutes and 23 seconds. The original record labels the connection `LLM LIVE 200` and reports no console errors.

**This plan is not the final video's subtitle timeline.** The published cut uses eight beats and Mandarin narration. Use `demo-video-english.md` for its full English transcript and `demo-video-en.vtt` for the subtitle file. The subtitle timing uses the final audio assembly offsets rather than the draft table below.

The source images are under `.agent/tmp/verify/llm-run/`. The image names in the table identify reference frames. Source times are wall-clock times from that session, not positions in the final video.

## Original production constraints

- Keep the submitted video at or below three minutes.
- Capture the running game at 1920 by 1080 or the original window aspect ratio.
- Preserve the speed of model-generated typing. Do not speed up or slow down a typing shot.
- Use the game's room tone, heartbeat, whisper bed, and event sounds. The original draft called for no added music or narration. The final cut subsequently added Mandarin narration.
- Show the model-connected session in the main demonstration. Explain the silent-run fallback separately.
- Provide complete English subtitles or English explanatory text for the non-English narration and any untranslated on-screen explanations.

## Original run8 shot table

| Draft video time | Source wall-clock time | Reference PNG | Content | Recording instruction |
| --- | --- | --- | --- | --- |
| 0:00 to 0:15 | 15:05:53 | `R8-P0-world` | Cold BIOS boot, beige case, three starting creatures | Retain the entire cold boot and BIOS sequence |
| 0:15 to 0:35 | 15:06:02 | `R8-P1-interactions` | Feed, clean, pet for 650 ms, name a creature moss | Show the naming panel and the memory that records hesitation |
| 0:35 to 0:50 | 15:06:04 | `R8-P2-E1-freeze`, `R8-P2-E1-wink-frame` | GV crosses 12, the world freezes for two seconds, then one eye blinks | Place the two frames in sequence without an added transition |
| 0:50 to 1:25 | 15:06:31 | `R8-P3-llm-roundtable` | First live-model roundtable, with `memoryRef` citing the naming event | Keep the original typing cadence and do not fast-forward |
| 1:25 to 1:45 | 15:07:17 | `R8-P4-E2-bubble` | Mirror sequence: one, two, three, four, five | Preserve the six-click rhythm within its six-second window |
| 1:45 to 2:00 | 15:07:31 | `R8-P5-E3-terminal` | `> external display detected` and `> oh.` | Show the terminal path change briefly |
| 2:00 to 2:15 | 15:08:44 | `R8-P6-E4-tower`, `R8-P6-E4-bubble` | Tower appears at `(0,7)`, two-second gaze, turn, speech bubble | Show the tower change before the world change |
| 2:15 to 2:25 | 15:10:41 | `R8-P7-E5` | Persistent channel and three ordered bubbles, 1.2 seconds apart | Show the start of the sequence without waiting for all three lines |
| 2:25 to 2:35 | 15:16:28 | `R8-P8-E7-led-amber` | Amber LED, GAZER title changes to `?`, first terminal erosion step | Leave two seconds for the browser-title change |
| 2:35 to 2:45 | 15:17:11 | `R8-P9-atavistic` | An atavistic creature appears and the player borrows its eye | Cut after the pupil overlay appears |
| 2:45 to 2:55 | 15:26:55 to 15:31:43 | `R8-P10-glyph-f1/f2/f3`, `R8-P13-glyph-f6/f7/f8` | Glyph sequence from 1/8 to 8/8, bestiary completion | Use short cuts between glyphs. Retain the final line, `last one. it is dated.` |
| 2:55 to 3:00 | 15:37:12 | `R8-P14-recording-unison`, `R8-Z-end-state` | `now we keep you.`, frame dissolution, black | Keep the dissolution intact and end on black |

## Alternative source material

These sequences were recorded as supporting evidence, not as main-cut shots.

- Judgment: run R4 kept all creatures fed and tender, so hostile lines did not appear. Run1 8pre recorded 24 moves without feeding and a mean working-memory value of 0.243. These are separate source runs, not one continuous take.
- Forgetting: run3 had no living creatures at tick 284. The terminal said `> everyone is gone. the machine keeps counting.` and the LED turned off.
- Budget exhaustion: run2 received HTTP 429 and used the manual dialogue pool. The simulation continued without a successful model response.
- Historical defect evidence: the original record retained B-1, missing debug write controls, and B-2, mutually exclusive conditions for the E3 ghost effect. These are historical observations, not a claim that the defects remain open.

## Recording and publication checklist

1. Configure the author-local model service through the server-side adapter described in the README. Do not publish service credentials.
2. Run `npm run dev` and select the local model adapter with `?lang=en&endpoint=/v1/game`.
3. Capture the game and system sound at 1080p and 30 frames per second.
4. Use hard cuts between shots. Do not alter the speed within model-typing shots.
5. Keep the exported duration at or below three minutes.
6. Review the complete English narration translation and the subtitle timing against the exported video.
7. Have the owner upload the subtitle track or publish the complete English explanatory text with the video.
8. Check the published video without owner access before marking the language correction complete.

The current task prepares local files only. It does not upload, replace, or publish a video.

<details>
<summary>中文原文归档，已移除本地凭据，最新录制说明以上文为准</summary>

# 演示视频剪辑拍点表(3 分钟,提交核对表第 18 项)

素材:`.agent/tmp/verify/llm-run/` 的 **run8 链**(2026-11-13 15:05:53→15:37:16,实机 31min23s,LLM LIVE 200,零 console error)。下表「素材」列给出该链对应的节拍截图文件名(同名 PNG 即录制参照帧);录制时按「素材时刻」列的墙钟去实机里复现同拍。

## 硬约束

- 总长 ≤ 3:00(提交清单 3 分钟上限)。
- 全程实机录屏(1920×1080 或窗口原比例),不加速不减速——**延迟是心跳**:LLM 打字与网络往返同源,快进会毁掉这个卖点。
- 音频:游戏自带(roomTone / heartbeat / whisperBed / blip),录系统声即可;不加配乐不加旁白,台词本身就是旁白。
- 静默周目(无 key 状态)不进正片——评委看到的 demo 必须是 LIVE 链;若要提无 key 降级,片尾 3 秒黑屏字幕即可。

## 拍点表(run8 链,墙钟时刻→视频时间)

| 视频时间 | 素材时刻 | 素材(PNG) | 画面 | 录制要点 |
| --- | --- | --- | --- | --- |
| 0:00–0:15 | 15:05:53 | R8-P0-world | 冷启动 BIOS → 米黄壳 → 三只初始生物 | 冷启动整段保留,不剪 BIOS——1997 的第一眼 |
| 0:15–0:35 | 15:06:02 | R8-P1-interactions | 喂/清/抚摸 650ms/命名 moss | 命名面板整段:犹豫毫秒数被记下来的那条记忆要能看见 |
| 0:35–0:50 | 15:06:04 | R8-P2-E1-freeze / -wink-frame | GV12 越阈:全世界冻结 2s → 单眼眨 | 两帧连放,不加转场——冻结本身就是剪辑 |
| 0:50–1:25 | 15:06:31 | R8-P3-llm-roundtable | **第一次圆桌**:真 LLM 打字,`memoryRef` 引用「你命名了 moss」 | 全片最贵的一镜:真打字机节奏(intervals=请求延迟),不快进 |
| 1:25–1:45 | 15:07:17 | R8-P4-E2-bubble | E2 镜面:one. two. three. four. five. | 6 连击复现窗 6s,连击节奏要原样 |
| 1:45–2:00 | 15:07:31 | R8-P5-E3-terminal | `> external display detected` / `> oh.` | 终端路径变异一闪而过即可 |
| 2:00–2:15 | 15:08:44 | R8-P6-E4-tower / -bubble | 黑塔 spawn(0,7)→ 注视塔 2s → 转身 → 气泡 | 塔先异动、世界再变——顺序不能剪反 |
| 2:15–2:25 | 15:10:41 | R8-P7-E5 | 信道常驻 + 三行有序气泡(1.2s 间隔) | 三行只取一行半,别念完 |
| 2:25–2:35 | 15:16:28 | R8-P8-E7-led-amber | LED 琥珀 + 标题 GAZER→「?」 + 终端侵蚀 step1 | 标题变异是全片唯一的「浏览器层面」惊吓,给足 2s |
| 2:35–2:45 | 15:17:11 | R8-P9-atavistic | 返祖体诞生 → 双击借瞳 | 借瞳叠层出现即切 |
| 2:45–2:55 | 15:26:55–15:31:43 | R8-P10-glyph-f1/f2/f3 → R8-P13-glyph-f6/f7/f8 | 读符快剪:1/8→8/8,图鉴「刻符 8 / 8」 | 快剪每符 ≤2s;f8「last one. it is dated.」保完整 |
| 2:55–3:00 | 15:37:12 | R8-P14-recording-unison → R8-Z-end-state | 齐声 now we keep you. → 边框溶解 → 黑 | 溶解不剪,黑场 2s 收 |

## 备选素材(不进正片,发布配文用)

- **B 审判链**:R4(喂食保活全员 tender,敌对行缺席为条件行为)/ run1 8pre(24 次搬运零喂食,working 均值 0.243)——「你怎么对待它们,它们就怎么相信你」的一条实机证据。
- **C 遗忘链**:run3(存活 0 @tick284,播报 `> everyone is gone. the machine keeps counting.`,LED 熄灭)。
- **预算耗尽链**:run2(429 → manual 池兜底,假打字机)——「断网时游戏完整可玩」的证据。
- **缺陷留证**:B-1(debug 无写面)、B-2(E3 幽灵浮现两门互斥)不进正片,发布说明里如实列出。

## 录制清单(人工动作,代理授权面外)

1. 终端跑 `npm run dev` + LIVE 适配器(127.0.0.1:18086,Bearer [已移除本地凭据],模型 auto/deepseek-v4.1-flash),按上表墙钟复现 run8 链;
2. OBS 录屏 1080p30,系统声;
3. 按「视频时间」列粗剪,拍点间硬切,不加转场;
4. 导出后上传 YouTube(公开、≤3 分钟),回填提交核对表第 18 行。

</details>
