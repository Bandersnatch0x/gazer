# P4-02 LLM 故障注入 2026-11-12T05:49:23.503Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 500
- 被拦截/注入的 /v1/game 请求数：0；观测状态码：400
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462564022,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462569383,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：[.WebGL-0x407c0060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c0060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c0060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c0060e200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## timeout
- 被拦截/注入的 /v1/game 请求数：0；观测状态码：400
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462574364,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462579694,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：[.WebGL-0x10a400609400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x10a400609400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x10a400609400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x10a400609400]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## malformed-json
- 被拦截/注入的 /v1/game 请求数：0；观测状态码：400
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462584934,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462590393,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：[.WebGL-0x5ca40060ee00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x5ca40060ee00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x5ca40060ee00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x5ca40060ee00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## shape-text
- 被拦截/注入的 /v1/game 请求数：0；观测状态码：400
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462595372,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462600734,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：[.WebGL-0x3c6400608e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c6400608e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c6400608e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c6400608e00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## ungrounded-scene
- 被拦截/注入的 /v1/game 请求数：0；观测状态码：400
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462605739,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462611046,
  "text": "Failed to load resource: the server responded with a status of 400 (Bad Request)"
 }
]
- 真实 warning：[.WebGL-0x407c00607600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c00607600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c00607600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x407c00607600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## F. 预算记账观测（推向 stage 2）
- 全程 /v1/game 调用：2 次；30 分钟滑窗内：2 次
- 说明：live 路径(game.ts→director/client) 无预算闸(src/bridge/budget.ts 未接线)，仅靠「每次阶段跨越一次调用」隐式限流
- 未捕获错误：[{"t":1794462615975,"text":"The script has an unsupported MIME type ('text/html')."},{"t":1794462621321,"text":"Failed to load resource: the server responded with a status of 400 (Bad Request)"},{"t":1794462628151,"text":"Failed to load resource: the server responded with a status of 400 (Bad Request)"}]
# P4-02 LLM 故障注入 2026-11-12T05:54:36.595Z
URL: http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997

## 500
- 被拦截/注入的 /v1/game 请求数：1；观测状态码：500
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462877427,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794462883006,
  "text": "Failed to load resource: the server responded with a status of 500 (Internal Server Error)"
 }
]
- 真实 warning：[.WebGL-0x3c9400622000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c9400622000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c9400622000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c9400622000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## timeout
- 被拦截/注入的 /v1/game 请求数：1；观测状态码：无
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462888895,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- 真实 warning：[.WebGL-0x306c00622c00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x306c00622c00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x306c00622c00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x306c00622c00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## malformed-json
- 被拦截/注入的 /v1/game 请求数：1；观测状态码：200
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462899940,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- 真实 warning：[.WebGL-0x2ffc0060d600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2ffc0060d600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2ffc0060d600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x2ffc0060d600]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## shape-text
- 被拦截/注入的 /v1/game 请求数：1；观测状态码：200
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462910872,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- 真实 warning：[.WebGL-0x555c00d41200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x555c00d41200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x555c00d41200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x555c00d41200]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## ungrounded-scene
- 被拦截/注入的 /v1/game 请求数：1；观测状态码：200
- 喂食后 stage=1（起始 0）gv=20.5 tick=1 creatures=3
- 4s 后 tick=3（世界仍运转）creatures=3
- 对话区摘录：C:\GAZER\1997\LIVE\roundtable.exe / LINK / collective> / CARE UNIT 07 ONLINE. Feed them. They are watching how you do it. / ˙told / collective> / do not leave the room yet / ·seen / collective> / i ate too fast. forgive me / ·seen / collective> / your hand is the whole sky / ·seen / collective> / th
- 未捕获错误：[
 {
  "t": 1794462921696,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]
- 真实 warning：[.WebGL-0x3c140060ca00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c140060ca00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c140060ca00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels | [.WebGL-0x3c140060ca00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels (thi

## F. 预算记账观测（推向 stage 2）
- 全程 /v1/game 调用：4 次；30 分钟滑窗内：4 次
- 说明：live 路径(game.ts→director/client) 无预算闸(src/bridge/budget.ts 未接线)，仅靠「每次阶段跨越一次调用」隐式限流
- 未捕获错误：[{"t":1794462932580,"text":"The script has an unsupported MIME type ('text/html')."},{"t":1794462938142,"text":"Failed to load resource: the server responded with a status of 500 (Internal Server Error)"},{"t":1794462945139,"text":"Failed to load resource: the server responded with a status of 500 (Internal Server Error)"}]
