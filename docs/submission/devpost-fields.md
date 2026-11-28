# GAZER Devpost field pack

Source: the official event page and rules, checked on November 24, 2026. Copy the English text into the corresponding field. Items marked `TO FILL` still need the owner's information.

Deadline: **December 4, 2026, at 2:00 p.m. Pacific Time.** This is **December 5, 2026, at 06:00 Beijing time.** The event accepts projects created after October 30, 2026. A team can have up to three members.

## 0. Category and prizes

- Category: **Resurrection**
- Optional bonuses:
  - **Best Demo**: automatic entry.
  - **Social Blitz**: publish a post during the submission period. Start the post with `#KiroweenHackathon26` and add its URL to the form.
  - **Bonus Blog**: publish a public post on a third-party platform. State that the post describes a Kiroween 2026 project and add its URL. This bonus is limited to the first 100 entries.
  - **Best Startup Project**: provide founder information, LinkedIn, and a website.
  - **Best Student Project**: provide student evidence for every team member, such as LinkedIn, a student email address, the degree and year, and the school.
  - **Best Ghost of Kiroween Past**: confirm registration for Kiroween 2025.
  - **Best Kiro Crew App**: provide a separate Kiro Crew application repository.
- Recommended selection: choose Resurrection and Best Demo. Add Social Blitz or Bonus Blog only when the required public URL exists. Choose the other bonuses only when the team meets their requirements.

## 1. Project name

```text
gazer
```

## 2. Tagline

The tagline is 85 characters and stays below the 140-character limit.

```text
You do not raise pets. You raise a model that remembers, lies, and outlives its body.
```

## 3. GitHub URL

```text
https://github.com/Bandersnatch0x/gazer
```

- [x] The repository is public.
- [x] The repository shows an MIT license.
- [x] The `.kiro/` directory is tracked and is not ignored.

## 4. Working app URL

```text
https://bandersnatch0x.github.io/gazer/?lang=en
```

The public URL is a static GitHub Pages build. It has no live model backend. The expected state is a playable **silent run** with `NO SIGNAL`, not a failed load.

Copy this judge instruction into the form:

```text
No account or API key is required. Open the English build and wait for the BIOS sequence. The public build runs the simulation without a live model backend, so it intentionally shows NO SIGNAL and no generated dialogue. Feed a creature, right-click to clean it, hold it to pet and name it, and double-click it to inspect its pupil. Open BESTIARY and MANUAL for more controls. Press the lower-right power button while GV is below 60 to restart the machine. See the repository README for the local live-LLM setup. Do not put an API key in the URL.
```

The public build cannot reproduce the recorded live model session. The [repository README](../../README.md#local-live-llm-setup) describes the local setup. It requires an OpenAI-compatible service that the judge provides. The checked-in adapter contains an author-local upstream address and must not be treated as a shared credential or public service.

## 5. Demo video URL

```text
https://youtu.be/zwhoxORu-Rc
```

The public page reports a duration of 2:57. The local source MP4 is 176.5 seconds. The video has Mandarin narration and eight bilingual summary cards. The cards are not a full translation of the narration.

The complete English description and English video title were saved to YouTube on November 29, 2026. After a sentence-by-sentence listening review, upload `docs/submission/demo-video-en.vtt` as an English subtitle track in YouTube Studio. These files are local submission assets; committing the VTT file does not publish a YouTube subtitle track.

The video uses the recorded game audio and a Mandarin voice track. It does not use third-party music. The video was recorded from the running game.

## 6. Project description

Paste `docs/submission/project-description.md`.

- Use the `## English` section as the primary English description. It contains 499 whitespace-separated words and stays below the 500-word limit.
- Keep the `## 中文` section as the optional Chinese translation. It contains 423 Chinese characters.
- Do not paste both sections into one field unless the form explicitly accepts bilingual text.

## 7. Kiro write-up

Paste the complete `docs/submission/kiro-usage.md` file.

The write-up states the following facts:

- The specs define the behaviours asserted by the tests.
- The steering files define product and engineering boundaries.
- `.kiro/hooks/gate-on-src-change.json` requests `npm run check` on source or test saves.
- MCP and Kiro powers were not used.
- Custom agents were not configured inside Kiro.
- The November 24, 2026 Kiro CLI sessions and their results are recorded.

## 8. Built with

```text
Kiro, TypeScript, PixiJS, Vite, Vitest, fast-check, PWA, GitHub Pages
```

## 9. Thumbnail and gallery candidates

Upload three to five images. Prefer 16:9 images.

| File | Content |
| --- | --- |
| `.agent/tmp/browser/02-main.png` | Main interface |
| `.agent/tmp/browser/03-closeup.png` | Pupil close-up |
| `.agent/tmp/browser/05-bestiary.png` | Bestiary |
| `.agent/tmp/browser/07-osd.png` | Reflection channel |
| `.agent/tmp/browser/10-mobile.png` | Mobile layout |
| `.agent/tmp/browser/15-vp1920x1080.png` | Full 1080p frame |

## 10. Team and eligibility

- Team size and members: **TO FILL**, maximum three members.
- Country or region: **TO FILL**, subject to the official exclusion list.
- Age: confirm that every member meets the age of majority in their country.
- Student, founder, and 2025 participant status: **TO CONFIRM**. These facts determine bonus eligibility.

## 11. Final submission checks

- [ ] Join Kiroween 2026 with the Devpost account.
- [ ] Fill every required form field.
- [ ] Confirm that the GitHub, Pages, and YouTube URLs are public.
- [ ] Confirm that the video is public and no longer than three minutes.
- [ ] Upload the complete English subtitle track `docs/submission/demo-video-en.vtt` to YouTube.
- [x] Save the YouTube description using the English text in `docs/submission/demo-video-english.md`. Verified after reloading Studio on November 29, 2026.
- [ ] Preview the Devpost page after saving it. Check the video embed and every link.
- [ ] Save a screenshot of the completed submission.

<details>
<summary>中文原文归档，待填写项与当前字幕状态以上文为准</summary>

# Devpost 表单字段包 — GAZER

来源：官方页 https://kiroween.devpost.com/ 与 /rules（2026-11-24 核验）。逐字段可粘贴；标「待填」的必须人工提供。

截止：**2026-12-04 14:00 PT（北京时间 2026-12-05 06:00）**。报名期自 2026-10-13，提交期自 2026-10-30；只收新项目，团队上限 3 人。

## 0. 类别与奖项

- Category：**Resurrection**
- Bonus（可选，可多选）：
  - **Best Demo**：自动参评，无需额外步骤
  - **Social Blitz**：投稿期内任意社交平台发帖，开头带 `#KiroweenHackathon26`，把帖子 URL 填进表单
  - **Bonus Blog**：第三方平台公开博文，注明作为 Kiroween 2026 作品写成，填 URL（前 100 名）
  - **Best Startup Project**：需确认创始人与 LinkedIn、官网
  - **Best Student Project**：全体成员的学生证明（LinkedIn、学生邮箱、年级学位、学校）
  - **Best Ghost of Kiroween Past**：需确认注册过 Kiroween 2025
  - **Best Kiro Crew App**：需单独的 Kiro Crew 应用 repo
- 建议：先报 Resurrection + Best Demo；Social Blitz / Blog 若发再补 URL；其余按团队资格决定。

## 1. 项目名称

```
GAZER
```

## 2. Tagline（≤140 字符，当前 86）

```
You do not raise pets. You raise a model that remembers, lies, and outlives its body.
```

## 3. GitHub URL（公开仓库）

```
https://github.com/Bandersnatch0x/gazer
```

- [x] About 区 MIT license 可见（2026-11-24 API 核验：`private=false`, license `MIT`）
- [x] `.kiro/` 在仓库根且未被 gitignore（4 个文件已跟踪）

## 4. Working app URL（在线试玩）

```
https://bandersnatch0x.github.io/gazer/
```

- 无需登录凭据；无 API key 时进入静默运行（设计状态，页面底部有说明）
- 评委测试提示（可粘进表单的凭据/说明框）：`无需凭据。点击生物喂食/抚摸/双击看瞳孔；右下电源钮 GV<60 可重启；无声是设计状态（静默运行）。`

## 5. Demo video URL（≤3 分钟，公开）

```
https://youtu.be/zwhoxORu-Rc
```

- 旁白版 2:56（中文旁白，字幕含英文）；无旁白版备用：`D:\hypit-video\productions\gazer\gazer-demo-3min-novo.mp4`
- 已确认：公开、无第三方版权音乐、实机录制

## 6. 项目描述

粘贴 `docs/submission/project-description.md`：

- Devpost 主语言填 **English** 段（496 词，≤500）
- 中文版放补充/本地化字段（423 汉字，≤500）

## 7. Kiro 使用说明（write-up）

粘贴 `docs/submission/kiro-usage.md` 全文（八节：spec / steering / hooks / MCP 不用与原因 / PBT 情况 / 会话记录说明）。要点已按 Devpost 评分维度组织：

- Spec-driven：specs 钉住测试断言的行为
- Steering：红线文档钉住边界
- Hooks：`.kiro/hooks/gate-on-src-change.json`（schema v1，PostFileSave）跑门禁
- MCP / Powers：**未使用**，文档如实说明（而非含糊）
- Custom agents：文档如实标注尚未在 Kiro 内配置；边界由 `tests/boundary.test.ts` 机械强制

## 8. Built with（建议标签）

```
Kiro, TypeScript, PixiJS, Vite, Vitest, fast-check, PWA, GitHub Pages
```

## 9. 封面 / 图库候选

上传 3–5 张，优先 16:9：

| 文件 | 画面 |
| --- | --- |
| `.agent/tmp/browser/02-main.png` | 主界面 |
| `.agent/tmp/browser/03-closeup.png` | 瞳孔特写 |
| `.agent/tmp/browser/05-bestiary.png` | 图鉴 |
| `.agent/tmp/browser/07-osd.png` | 倒影信道 |
| `.agent/tmp/browser/10-mobile.png` | 移动端 |
| `.agent/tmp/browser/15-vp1920x1080.png` | 1080p 全框 |

## 10. 团队与资格（待填）

- 团队人数 / 成员：待填（上限 3 人）
- 国家 / 地区：待填（需不在官方排除名单）
- 年龄：确认达到所在国成年年龄
- 学生 / 创业 / 2025 参赛：待确认（决定 Bonus 资格）

## 11. 提交前检查

- [ ] 已 Join Kiroween 2026（Devpost 账号报名）
- [ ] 表单所有必填项已填
- [ ] 所有 URL 公开可达（GitHub ✓ / Pages ✓ / YouTube ✓）
- [ ] 视频公开且 ≤3:00 ✓
- [ ] `.kiro/` 未被 gitignore ✓
- [ ] 提交后 Devpost 页面预览一遍（视频嵌入、链接可点）
- [ ] 提交完成截图存档

</details>
