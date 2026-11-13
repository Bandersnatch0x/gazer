# FX-LIB-01b — DOM 层 8 项

**拆分自 `FX-LIB-MASTER.md` §1 DOM 层;总则、护栏、记账、验收以 master 为唯一真值。**

| ID | 名称 | gate | cost | cap | 核心参数 | 功能 |
|---|---|---|---|---|---|---|
| D-01 | title_mutate 标题突变 | 3 | 3 | 0.7 | mode question\|claim\|name\|clock | 标签页标题四段演变,终态=玩家名 |
| D-02 | favicon_eye 书签眼 | 2 | 2 | 0.5 | mode open\|blink | 16×16 独眼 favicon;blink 联动公共眨眼时钟 |
| D-02a | favicon_state_lock 眼锁 | 4 | 1 | — | — | S4 锁 open 恒睁——它一直在看;锁期拒绝 blink |
| D-03 | canvas_escape_eyes 越界眼 | 4 | 4 | 0.9 | count 1–8; pos corners\|edges\|near_canvas; follow bool | 画布外 DOM 眼,opacity **0.03–0.08 正典**;共用眨眼时钟 |
| D-04 | dom_erosion 终端侵蚀 | 4 | 5 | 按步 | step 1–6(禁跳步) | 引用型原语,六步表归 ART-CORE-02 §6.4 |
| D-05 | os_status_clock 伪时钟 | 4 | 4 | 0.9 | target creature_name | 移动端页面内伪时钟层显示个体名;真时钟照常——双层并存,永不伪装 OS |
| D-06 | cursor_mimic 幽灵光标 | 3 | 3 | 0.7 | window 30s; fidelity 0.6–1.0 | 页面内第二光标重放鼠标轨迹;**永不派发合成输入事件** |
| D-07 | scroll_whisper 滚动耳语 | 3 | 2 | 0.5 | delta 5–40px; when on_read\|on_idle | 终端滚动条朝玩家视线区移动——它在陪你读 |

*End of FX-LIB-01b.*
