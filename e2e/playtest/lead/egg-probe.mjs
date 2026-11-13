/** Lead 探针：等待世界自然产蛋，截取蛋的像素特写。 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

// 催产：把两只活体 happiness 拉满、拉到一起，等 courtshipStep 产蛋
await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).filter((c) => c.behavior !== "dead");
  for (const c of alive.slice(0, 2)) {
    c.stats.happiness = 100;
    c.stats.hunger = 90;
    c.stats.hygiene = 90;
    c.stats.energy = 90;
  }
  if (alive.length >= 2) {
    const a = alive[0].position;
    const b = alive[1].position;
    b.x = a.x + 1;
    b.y = a.y;
  }
});

let eggs = 0;
const start = Date.now();
while (Date.now() - start < 60000) {
  eggs = await page.evaluate(() => window.__gazer().eggs.length);
  if (eggs > 0) break;
  // 保持 happiness 满（衰减会掉）
  await page.evaluate(() => {
    const w = window.__gazer();
    for (const c of Object.values(w.creatures).slice(0, 2)) {
      if (c.behavior !== "dead") c.stats.happiness = Math.max(c.stats.happiness, 95);
    }
  });
  await sleep(1500);
}
console.log("eggs:", eggs);
if (eggs > 0) {
  const at = await page.evaluate(() => {
    const e = window.__gazer().eggs[0];
    return { x: e.at.x, y: e.at.y };
  });
  const LW = 320, LH = 180, OX = 160, OY = 30;
  const lp = { x: OX + (at.x - at.y) * 8, y: OY + (at.x + at.y) * 4 + 4 };
  const box = await page.locator("canvas").first().boundingBox();
  const cx = box.x + (lp.x / LW) * box.width;
  const cy = box.y + (lp.y / LH) * box.height;
  await page.screenshot({
    path: "e2e/playtest/lead/egg-closeup.png",
    clip: { x: Math.max(0, cx - 120), y: Math.max(0, cy - 100), width: 240, height: 200 },
  });
  await page.screenshot({ path: "e2e/playtest/lead/egg-full.png" });
}
await browser.close();
