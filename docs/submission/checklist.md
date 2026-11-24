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
| Gate | `npm run check` green | `package.json` | done (2026-11-24: 88 files / 1218 tests) |
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
