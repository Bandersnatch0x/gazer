/** 探针2:时间跳跃后跨阈,轮询 structures 是否被某个周期性通路清掉。 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e)));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

const snap = (label) =>
  page
    .evaluate(() => {
      const w = window.__gazer();
      return { tick: w.tick, gv: +w.gv.toFixed(2), stage: w.stage, structures: w.structures.map((s) => s.kind), eggs: w.eggs.length };
    })
    .then((s) => console.log(label, JSON.stringify(s)));

// 模拟巡览:先把世界时间推到第 7 天(会饿死生物,与巡览一致)
await page.evaluate(() => { window.__gazer().tick = 7000; });
await sleep(3400);
await snap("after timejump:");
await page.evaluate(() => { window.__gazer().gv = 19.8; });
await sleep(3400);
await snap("after gv patch:");
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
for (let i = 0; i < 12; i += 1) {
  await sleep(6000);
  await snap(`poll${i}:`);
}
await browser.close();
