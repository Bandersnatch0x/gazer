# 0023 — roundtable 预算改为 4000ms（取代 0019 的 800ms）

日期: 2026-11-15

## 背景

0019 以 HARNESS §5 的 800ms 为权威，把 playtest 用的 20000ms 判为临时绕过，并接受“演示时模型台词出现概率下降”。2026-11-15 用真实本机端点（`http://127.0.0.1:18086/v1`，经 `/v1/game` 中间件）实测三次圆桌请求：**3/3 合法 scene**，耗时 **3856 / 3382 / 3562 ms**（证据 `.agent/tmp/review-r2-ui/after/real-model-calls.json`）。

在 800ms 预算下，真实调用**必然**在返回前被 abort 并回落 `manualPool`，等于“模型台词基本不出现”。这与演示主线「LLM 不可替代」及“评委三问”的证据诉求直接冲突。用户 2026-11-15 裁定按推荐方案 A 执行。

## 被选方案

1. `src/director/router.ts` 的 `roundtable.timeoutMs` 由 800 改为 **4000**；其余四档（1200/2000/600/0）不变。
2. `docs/design/HARNESS.md` §5 圆桌行预算同步改为 **4000 ms**，并注明依据本 ADR。
3. 中间件上游超时随 `routeTimeoutMs("roundtable")` 自动变为 4000ms，客户端与服务端口径继续共用同一常量。
4. 失败/超时行为不变：仍回落 `manualPool`，仍由 `voice_degraded` 叙事收编。
5. 同步两处契约测试（router 钉值、doc-alignment 表）。

## 被否方案及落选理由

- **保留 800ms（0019 原方案）**：落选——实测 3.5s，演示中模型台词几乎不出现，主线证据链断裂。
- **800ms + 一次 4000ms 重试**：落选——双倍延迟与额外预算消耗，且“首次失败”会让日志充满噪声。
- **按端点延迟动态调整**：落选——引入随环境变化的变量进核心路径，与 0018 否决自迭代的同一理由（不可复现）。

## 影响面

- `src/director/router.ts`、`docs/design/HARNESS.md`、`tests/director-router.test.ts`、`tests/director-doc-alignment.test.ts`。
- 0019 保持历史记录不改写，由本 ADR 明确取代其数值结论。
- 游戏内场景等待上限由 0.8s 变为 4s；若端点更慢，仍按 4000ms 回落。
