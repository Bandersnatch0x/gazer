# P4-03 localStorage / seed 边界 2026-11-12T05:57:08.215Z

## A. 损坏的 gazer-locale
- 损坏值下启动：成功；UI 语言=英文（期望英文兜底）
- 点击语言键后：切到中文 OK
- 存储已覆写为：zh
- 未捕获错误：[{"t":1794463028849,"text":"The script has an unsupported MIME type ('text/html')."}]

## B. 超长 gazer-locale（1MB）
- 启动成功（locale 读取按 isLocale 白名单校验，超长值被忽略）
- 点击语言键后存储值：2 字符
- 未捕获错误：[{"t":1794463030162,"text":"The script has an unsupported MIME type ('text/html')."}]

## C. 配额打满 + 点击语言按钮
- 塞入垃圾键后 localStorage 键数：4
- 点击语言键：未抛出（或已处理）
- 未捕获错误：[
 {
  "t": 1794463031042,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]

## D. localStorage 抛错（隐私模式桩）
- 失败（可能启动即白屏/卡住）：TimeoutError: page.waitForFunction: Timeout 25000ms exceeded.
- 未捕获错误：[
 {
  "t": 1794463032257,
  "text": "Error: SecurityError: storage disabled"
 },
 {
  "t": 1794463032266,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]

## E. ?seed= 畸形值矩阵
- seed="" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="abc" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="-5" -> 启动 OK，归一化 seed=5，creatures=3
- seed="0" -> 启动 OK，归一化 seed=0，creatures=3
- seed="99999999999999999999" -> 启动 OK，归一化 seed=1661992960，creatures=3
- seed="1e21" -> 启动 OK，归一化 seed=3735027712，creatures=3
- seed="NaN" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="1997';--" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="null" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="0.5" -> 启动 OK，归一化 seed=0，creatures=3
- seed=" 1997 " -> 启动 OK，归一化 seed=1997，creatures=3
- 未捕获错误：[
 {
  "t": 1794463057618,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463057898,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463058164,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463058400,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463058637,
  "text": "The script has an unsupported MIME type ('text/html')."
 },
 {
  "t": 1794463058881,
  "text": "The script has an unsupported MIME type ('text/html')."
 }
]

## F. 刷新持久化观察
- 刷新前 tick=0 gv=1；刷新后 tick=0 gv=0
- localStorage 内与游戏相关的键：[]
- 结论：无世界持久化层（票 0008 已注明），刷新即重置世界
# P4-03 localStorage / seed 边界 2026-11-12T07:32:55.153Z

## A. 损坏的 gazer-locale
- 损坏值下启动：成功；UI 语言=英文（期望英文兜底）
- 点击语言键后：切到中文 OK
- 存储已覆写为：zh
- 未捕获错误：无

## B. 超长 gazer-locale（1MB）
- 启动成功（locale 读取按 isLocale 白名单校验，超长值被忽略）
- 点击语言键后存储值：2 字符
- 未捕获错误：无

## C. 配额打满 + 点击语言按钮
- 塞入垃圾键后 localStorage 键数：4
- 点击语言键：未抛出（或已处理）
- 未捕获错误：无

## D. localStorage 抛错（隐私模式桩）
- localStorage 禁用下启动：成功
- 点击语言键：未崩溃
- 未捕获错误：无

## E. ?seed= 畸形值矩阵
- seed="" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="abc" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="-5" -> 启动 OK，归一化 seed=5，creatures=3
- seed="0" -> 启动 OK，归一化 seed=0，creatures=3
- seed="99999999999999999999" -> 启动 OK，归一化 seed=1661992960，creatures=3
- seed="1e21" -> 启动 OK，归一化 seed=3735027712，creatures=3
- seed="NaN" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="1997';--" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="null" -> 启动 OK，归一化 seed=1997，creatures=3
- seed="0.5" -> 启动 OK，归一化 seed=0，creatures=3
- seed=" 1997 " -> 启动 OK，归一化 seed=1997，creatures=3
- 未捕获错误：无

## F. 刷新持久化观察
- 刷新前 tick=0 gv=1；刷新后 tick=0 gv=0
- localStorage 内与游戏相关的键：[]
- 结论：无世界持久化层（票 0008 已注明），刷新即重置世界
