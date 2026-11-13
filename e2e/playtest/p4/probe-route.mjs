// 最小复现：page.route 谓词能否拦住页面发出的 POST /v1/game
import { chromium } from "playwright";
import { BASE, boot, sleep } from "./lib.mjs";

const browser = await chromium.launch();
const page = await browser.newPage();
const seen = [];
await page.route(
  (u) => {
    let p = "?";
    try { p = new URL(u.toString()).pathname; } catch {}
    seen.push(p);
    return p === "/v1/game";
  },
  (route) => route.fulfill({ status: 500, body: "injected" }),
);
page.on("response", (r) => console.log("[resp]", r.status(), r.url().slice(0, 90)));
await boot(page, `${BASE}?debug=1&endpoint=/v1/game&seed=1997`);
// 页面内直接 fetch 一次
const result = await page.evaluate(async () => {
  try {
    const r = await fetch("/v1/game", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "probe" }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 80) };
  } catch (e) { return { error: String(e) }; }
});
console.log("[probe fetch]", JSON.stringify(result));
console.log("[matcher saw]", seen.join(" | ") || "(nothing)");
await sleep(500);
await browser.close();
