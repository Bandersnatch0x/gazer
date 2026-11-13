# P4-01 断网冷启动 2026-11-12T05:47:20.716Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 阶段 A：断网冷启动
# P4-01 断网冷启动 2026-11-12T05:47:44.219Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 阶段 A：断网冷启动
# P4-01 断网冷启动 2026-11-12T05:47:58.180Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 阶段 A：断网冷启动
- 冷启动成功：creatures=3 tick=0 seed=1997 stage=0
- 静置 4s 后 tick=1（时钟推进=正常）
- 冷启动 UI 占位符扫描：干净

## 阶段 B：断网中操作（喂/摸/搬/清/对视）
- 快速轻点(喂食): OK
- 长按(抚摸 750ms): OK
- 右键(清洁): OK
- 双击(对视面板): OK
- 拖拽(搬运): OK
- 断网操作后状态：tick=2 creatures=3 eggs=0
- 操作后占位符扫描：干净

## 阶段 C：浏览器级离线仿真 10s → 恢复
- 离线 10s：tick 2 -> 6（推进 4）
- 恢复后 tick=8；墙钟 10075ms 期望 ≈3 tick；实际推进 2（窗口静默计时器被节流属正常波动）
- 恢复后占位符扫描：干净
- 被拦截的 LLM 请求数：0

## 汇总
- pageerror/console error：[
 {
  "t": 1794462478753,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- console warning：[.WebGL-0x123400627400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x123400627400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x123400627400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x123400627400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi
- requestfailed（应为被拦截的 LLM 调用）：0
# P4-01 断网冷启动 2026-11-12T05:53:43.910Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 阶段 A：断网冷启动
- 冷启动成功：creatures=3 tick=0 seed=1997 stage=0
- 静置 4s 后 tick=1（时钟推进=正常）
- 冷启动 UI 占位符扫描：干净

## 阶段 B：断网中操作（喂/摸/搬/清/对视）
- 快速轻点(喂食): OK
- 长按(抚摸 750ms): OK
- 右键(清洁): OK
- 双击(对视面板): OK
- 拖拽(搬运): OK
- 断网操作后状态：tick=3 creatures=3 eggs=0
- 操作后占位符扫描：干净

## 阶段 C：浏览器级离线仿真 10s → 恢复
- 离线 10s：tick 3 -> 6（推进 3）
- 恢复后 tick=8；墙钟 10066ms 期望 ≈3 tick；实际推进 2（窗口静默计时器被节流属正常波动）
- 恢复后占位符扫描：干净
- 被拦截的 LLM 请求数：0

## 汇总
- pageerror/console error：[
 {
  "t": 1794462824625,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- console warning：[.WebGL-0x2c6c00d15e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2c6c00d15e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2c6c00d15e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2c6c00d15e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi
- requestfailed（应为被拦截的 LLM 调用）：0
