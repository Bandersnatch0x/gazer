/** 票 0015 §2 探针:完整复刻 P2 probe-tower2 序列(timejump→gv patch→tap→poll)。 */
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
        decay: w.paletteDecay,
        hour: Math.floor((w.tick % 7200) / 300),
      };
    })
    .then((s) => console.log(label, JSON.stringify(s)));

// 1) timejump 到第 7 天(P2 原序列)
await page.evaluate(() => { window.__gazer().tick = 7000; });
await sleep(3400);
await snap("after timejump:");
// 2) gv patch
await page.evaluate(() => { window.__gazer().gv = 19.8; });
await sleep(3400);
await snap("after gv patch:");
// 3) tap 生物(喂食 → gv delta → stage 重推)
const c = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  return alive ? { x: alive.position.x, y: alive.position.y } : null;
});
console.log("target creature:", JSON.stringify(c));
if (c) {
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  await page.mouse.click(px, py, { delay: 40 });
}
await sleep(1500);
await snap("after tap:");
for (let i = 0; i < 5; i += 1) {
  await sleep(6000);
  await snap(`poll${i}:`);
  await page.screenshot({ path: `${OUT}tower2-poll${i}.png` });
}
await browser.close();
