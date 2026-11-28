# Submission checklist

Kiroween 2026, Resurrection category. The organizer's correction notice sets the deadline at **December 4, 2026, 14:00 Pacific Time**, or **December 5, 2026, 06:00 Beijing time**.

English correction prepared on November 28, 2026. Historical verification dates remain explicit below. Local file preparation does not mean that YouTube or Devpost has been updated.

| Artifact | Requirement | Location | Status |
| --- | --- | --- | --- |
| Public GitHub repository | Public, with the MIT license visible | https://github.com/Bandersnatch0x/gazer | Recorded public and MIT on November 24, 2026 |
| Open-source license | License included in the repository | `LICENSE` | Present |
| New project | Created after October 30, 2026 | Git history | Recorded creation date: November 11, 2026 |
| `.kiro` directory | Specs, hooks, and steering tracked, not ignored | `.kiro/` | Four tracked files recorded on November 24, 2026 |
| Public playable URL | Accessible, with accurate mode instructions | https://bandersnatch0x.github.io/gazer/?lang=en | Static silent run. No live model backend. See the English judge instructions |
| English README | Full project, setup, and control instructions | `README.md` | Prepared locally. Chinese original retained |
| Local live model instructions | Explain the same-origin adapter and judge-supplied upstream | `README.md`, Local live LLM setup | Documented. No shared model service or credential supplied |
| Local run | Install dependencies and start the development server | `README.md` | Commands documented in English |
| Repository gate | `npm run check` | `package.json` | Passed on November 28, 2026: TypeScript checks and 1,231 tests in 89 files. Full log: `.agent/tmp/submission-english-gate.log` |
| Static build | `npm run build` | `dist/` | Last recorded success: November 24, 2026. Not rerun for the English correction |
| PWA | Manifest, service worker, offline shell, and install support | `public/`, `src/shell/` | Previously recorded complete. Not revalidated in this documentation correction |
| Project description | English primary text and optional Chinese original, below 500 words each | `docs/submission/project-description.md` | Existing English and Chinese sections retained |
| Devpost field pack | English copy-ready fields and judge instructions | `docs/submission/devpost-fields.md` | Prepared locally. Form update pending |
| Kiro write-up | English explanation, prompts, and evidence | `docs/submission/kiro-usage.md` | Existing English write-up retained. Session evidence dated November 24, 2026 |
| Demo video | Public, no longer than three minutes | https://youtu.be/zwhoxORu-Rc | Public page reported 2:57 on November 28, 2026. Local source MP4 is 176.5 seconds |
| English video transcript | Translate all eight Mandarin narration clips | `docs/submission/demo-video-english.md` | Saved to the YouTube description on November 29, 2026. Reloaded in Studio and compared with the complete English text |
| English subtitle track | Complete English narration translation | `docs/submission/demo-video-en.vtt` | Prepared locally. Timing follows source clip offsets and detected pauses. Final listening review and YouTube upload pending |
| English video metadata | English title, description, and chapter labels | `docs/submission/devpost-fields.md`, `docs/submission/demo-video-english.md` | English title and complete English description saved on November 29, 2026 and verified after reloading Studio. English subtitle upload remains pending |
| Tagline | No more than 140 characters | `docs/submission/tagline.txt` | Existing English tagline retained |
| Art, effects, fixed text, and endings | Four art anchors, 30 effects, 45 fixed entries, four endings | `docs/design/art/`, `docs/design/fx/`, `docs/design/narrative/`, `src/canon/` | Previously recorded in review batches 0041 to 0047 and runtime work 0053 and 0055. Not revalidated here |
| Devpost registration | Join the event with a Devpost account | https://kiroween.devpost.com/ | Owner confirmation required. The repository has no registration receipt |
| Team and eligibility | Up to three members, with eligible countries and ages | Devpost form | Owner information required |
| Bonus prizes | Select eligible prizes and supply their evidence | Devpost form | Owner decision required. Social and blog entries need public post URLs |
| Built with tags | Enter the technology tags | Devpost form | Suggested English tags are in the field pack. Form entry pending |
| Thumbnail and gallery | Upload three to five project screenshots | `.agent/tmp/browser/` | Candidates previously recorded. Upload pending |
| Final Devpost preview | Complete fields, working links, and embedded video | Devpost | Owner action pending after publication |

## Correction completion boundary

The organizer asks for English translations of submitted material. The English project description and Kiro write-up already exist. This correction adds the full README translation, judge instructions, video narration transcript, subtitle file, and English preparation notes.

The internal design and review archive is not translated by this correction. If any internal document, screenshot caption, or additional field is submitted to judges as explanatory material, provide an English translation for that item too.

The previously recorded Part IX work, including the lifecycle callbacks, two-layer memory, and Level B checks, is not reopened by this documentation task. Online publication and final subtitle listening review remain separate steps.

<details>
<summary>中文原文归档，最新状态以上文英文清单为准</summary>

# Submission checklist

Kiroween 2026, Resurrection category. Deadline 2026-12-04 14:00 Pacific (2026-12-05 06:00 Beijing). 截至 2026-11-24 还剩 10 天。

| Artifact | Requirement | Location | Status |
| --- | --- | --- | --- |
| Public GitHub repo | public, MIT in About | https://github.com/Bandersnatch0x/gazer | done (API: `private=false`, license `MIT`) |
| Open-source license | visible in About | `LICENSE` | done |
| Created after 2026-10-30 | first commit date | git log | done (repo created 2026-11-11) |
| `.kiro` directory | specs, hooks, steering, not ignored | `.kiro/` | done (4 files tracked; `.gitignore` explicitly keeps it) |
| Working demo URL | reachable | https://bandersnatch0x.github.io/gazer/ | done (HTTP 200; deployed bundle matches local build) |
| Local run | `npm install && npm run dev` | `README.md` | done |
| Gate | `npm run check` green | `package.json` | done (2026-11-24: 89 files / 1231 tests) |
| Build | `npm run build` | `dist/` | done (2026-11-24 exit 0) |
| PWA | manifest, service worker, offline shell, installable | `public/`, `src/shell/` | done |
| Project description | Devpost text, EN and ZH, ≤500 words each | `docs/submission/project-description.md` | done (EN 496 words / ZH 423 汉字) |
| Devpost form fields | paste-ready pack | `docs/submission/devpost-fields.md` | done (字段包就绪;表单提交待人工登录) |
| Kiro usage write-up | eight prompts, one section each | `docs/submission/kiro-usage.md` | done (MCP and powers marked as unused; Kiro CLI session evidence 2026-11-24) |
| Demo video | public YouTube, ≤3 minutes | https://youtu.be/zwhoxORu-Rc | done (2:56; 无旁白备份在本地产出目录) |
| Tagline | ≤140 characters | `docs/submission/tagline.txt` | done (86 chars) |
| Art anchors + canon + endings | 四锚点美术/FX 30 项/canon 45 条/四结局实机可达 | `docs/design/art/`, `docs/design/fx/`, `docs/design/narrative/`, `src/canon/` | done (评审+处置批 0041–0047+实机联调 0053/0055) |
| Devpost registration | Join hackathon with a Devpost account | https://kiroween.devpost.com/ | **待确认**（仓库无记录，需人工登录核验） |
| Team & eligibility | team ≤3, country/age符合规则 | Devpost form | **待填**（仓库无团队信息） |
| Bonus prizes | 选择并补对应材料 | Devpost form | **待定**（Social Blitz / Blog 需发帖 URL；Startup / Student / Ghost 需额外证明） |
| Built with tags | tech stack tags | Devpost form | **待填**（建议清单见字段包 §8） |
| Thumbnail / gallery | 项目截图 3–5 张 | `.agent/tmp/browser/` | 候选已备，待上传 |
| Final Devpost preview | 链接可点、视频嵌入、字段完整 | Devpost | 提交前执行 |

历史注记：Part IX 扩容（hook harness、两层记忆、Level B 核验）已由 0053/0055 与 R2/R3 修复批次交付，不再是排期风险。

</details>
