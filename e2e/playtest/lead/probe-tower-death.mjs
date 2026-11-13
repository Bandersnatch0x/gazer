/** 票 0015 §2 探针:死亡事件跨阈(GAZE→41, PHASE 2, DAY 7)复刻 P2 失效态。 */
import { chromium } from "playwright";

const GAME_URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const OUT = "e2e/playtest/lead/shots/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e)));
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(800);

const snap = (label) =>
  page
    .evaluate(() => {
      const w = window.__gazer();
      return {
        tick: w.tick, gv: +w.gv.toFixed(2), stage: w.stage,
        structures: w.structures.map((s) => s.kind),
        alive: Object.values(w.creatures).filter((c) => c.behavior !== "dead").length,
      };
    })
    .then((s) => console.log(label, JSON.stringify(s)));

// timejump 到第 7 天(与 P2 相同),再补满饥饿压向死亡
await page.evaluate(() => {
  const w = window.__gazer();
  w.tick = 7000;
  for (const c of Object.values(w.creatures)) {
    if (c.behavior !== "dead") c.stats.hunger = 99.9;
  }
});
await sleep(3000);
await snap("after timejump+hunger:");
// 第一只死亡 → stage 0→1(death 15×1.5 夜间?) tower 应出现
await page.screenshot({ path: `${OUT}death-1.png` });
// 继续等更多死亡跨到 stage 2
for (let i = 0; i < 8; i += 1) {
  await sleep(6000);
  await snap(`poll${i}:`);
  await page.screenshot({ path: `${OUT}death-poll${i}.png` });
}
await browser.close();
