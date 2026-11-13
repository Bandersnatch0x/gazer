/**
 * Lead 探针：磨到 stage 1 触发真实圆桌，监听 /v1/game 请求与响应原文，
 * 判断 LLM scene 是否 200、是否通过 parseRoundtable/validateTurns。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
mkdirSync(SHOTS, { recursive: true });
const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const traffic = [];
page.on("request", (r) => {
  if (r.url().includes("/v1/game")) traffic.push({ dir: "req", body: (r.postData() ?? "").slice(0, 3000) });
});
page.on("response", async (r) => {
  if (r.url().includes("/v1/game")) {
    let body = "";
    try { body = await r.text(); } catch {}
    traffic.push({ dir: "res", status: r.status(), body: body.slice(0, 3000) });
  }
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

// 磨 GAZE 到 stage 1
const start = Date.now();
while (Date.now() - start < 180000) {
  const s = await page.evaluate(() => {
    const w = window.__gazer();
    return { stage: w.stage, gv: w.gv };
  });
  if (s.stage >= 1) break;
  const box = await page.locator("canvas").first().boundingBox();
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.move(box.x + box.width * (0.25 + 0.06 * i), box.y + box.height * 0.5);
    await sleep(120);
  }
}
// 等场景触发 + LLM 往返 + 播放
await sleep(20000);

const dialogue = await page.evaluate(() =>
  [...document.querySelectorAll(".gazer-dialogue__line")].map((line) => ({
    text: line.querySelector(".gazer-dialogue__text")?.textContent ?? "",
    status: line.querySelector(".gazer-witness")?.getAttribute("data-status") ?? "",
  })),
);
writeFileSync(join(HERE, "roundtable-live.json"), JSON.stringify({ traffic, dialogue, errors }, null, 2), "utf8");
console.log("traffic entries:", traffic.length);
for (const t of traffic) {
  console.log("----", t.dir, t.status ?? "", (t.body ?? "").slice(0, 500));
}
console.log("dialogue:", JSON.stringify(dialogue, null, 1));
console.log("errors:", errors.length ? errors.join(" | ") : "none");
await page.screenshot({ path: join(SHOTS, "roundtable-live.png") });
await browser.close();
