/**
 * P3 探针 3：确认运行中的 dev server 对 director client 的实际请求
 * ({input}) 返回什么，以及圆桌是否曾经成功过。
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const log = (...a) => console.log("[p3:probe3]", ...a);

const browser = await chromium.launch();
const page = await browser.newPage();
const calls = [];
page.on("request", (r) => {
  if (r.url().includes("/v1/game")) calls.push({ url: r.url(), body: r.postData() });
});
page.on("response", async (r) => {
  if (r.url().includes("/v1/game")) {
    let body = "";
    try { body = (await r.text()).slice(0, 600); } catch {}
    calls.push({ status: r.status(), body });
  }
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });

// 复刻 director/client.ts 的请求形状
const direct = await page.evaluate(async () => {
  const res = await fetch("/v1/game", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ input: "SCENE TRIGGER\nstage 1 | trigger: probe" }),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 600) };
});
log("director-shape request:", JSON.stringify(direct, null, 2));

// 复刻 vite.config.ts 期待的请求形状
const bridge = await page.evaluate(async () => {
  const res = await fetch("/v1/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "reflect", prompt: "say hi in one short sentence" }),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 600) };
});
log("bridge-shape request:", JSON.stringify(bridge, null, 2));

log("observed page traffic:", JSON.stringify(calls, null, 2));
await browser.close();
void join;
