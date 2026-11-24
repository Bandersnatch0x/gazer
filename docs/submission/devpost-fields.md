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
