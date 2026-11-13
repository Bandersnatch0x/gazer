# P4-04 高频操作与时钟 2026-11-12T05:58:15.874Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## A. 按钮快速连点
- 底栏按钮数：5
- 三轮全按钮 ×6 连点完成

## B. 画布极速操作（点/双击/右键/拖拽混合轰炸）
- 15 连点 + 8 右键 + 6 拖拽完成，无脚本异常

## C. 语言键极速切换 20 次
- 切换后 UI：中文字符 4 个 / 英文词 99 个；localStorage 终值=en
- 混排嫌疑：可能中英混排（对话台词本身双语，需人工看截图）

## D. 窗口 resize 轰炸
- resize 后 canvas 盒：{"x":0,"y":0,"width":960,"height":540}

## E. 标签页失焦 40s → 回来观察世界时钟
- 前台 tick 速率：0.43 tick/s（期望 ≈0.33，即 3s/tick）
- 失焦 40s：tick 4 -> 17（推进 13，期望 ≈13）
- 回前台后 5s 内 tick 增量序列：0,1,1,1,1,1,1,2,2,2（有 >2 的跳步 = 追赶爆发；全 1-2 = 无追赶）
- 失焦期间可能丢失 tick：≈0（正值且无追赶爆发 = 世界时钟落后墙钟）

## 汇总
- 终态：tick=20 stage=1 creatures=3 eggs=2
- 未捕获错误：[
 {
  "t": 1794463096590,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463099213,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/bl | The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/bl | The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/bl | [.WebGL-0x79c40060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x79c40060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x79c40060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
