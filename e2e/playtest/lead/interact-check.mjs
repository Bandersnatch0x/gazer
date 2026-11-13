/**
 * Lead 探针：验证真实人手交互（feed/pet）在当前构建上有效。
 * 与 p4 lib 同款坐标换算，但判定看世界状态反应而非 console。
 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / 320) * box.width, y: box.y + (lp.y / 180) * box.height };
};
const state = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      gv: Math.round(w.gv * 10) / 10,
      stage: w.stage,
      hungriest: Math.min(...Object.values(w.creatures).map((c) => c.stats.hunger)),
      lines: document.querySelectorAll(".gazer-dialogue__line").length,
    };
  });

const before = await state();
console.log("before:", JSON.stringify(before));

// 喂食：点最饿的生物两次（feedGuard 300ms 间隔外）
const target = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).filter((c) => c.behavior !== "dead");
  const c = [...alive].sort((a, b) => a.stats.hunger - b.stats.hunger)[0];
  return { x: c.position.x, y: c.position.y };
});
const LW = 320, LH = 180, OX = 160, OY = 30;
const lp = { x: OX + (target.x - target.y) * 8, y: OY + (target.x + target.y) * 4 + 4 };
const p = await cssPoint(lp);
await page.mouse.click(p.x, p.y, { delay: 40 });
await sleep(900);
await page.mouse.click(p.x, p.y, { delay: 40 });
await sleep(1500);

const after = await state();
console.log("after feed:", JSON.stringify(after));

// 抚摸：按住 750ms
await page.mouse.down();
await sleep(750);
await page.mouse.up();
await sleep(500);
const afterPet = await state();
console.log("after pet:", JSON.stringify(afterPet));

const feedWorked = after.hungriest > before.hungriest || after.gv > before.gv;
const petWorked = afterPet.gv > after.gv || afterPet.lines > after.lines;
console.log("feed worked:", feedWorked, "| pet worked (gv/lines grew):", petWorked);
await page.screenshot({ path: "e2e/playtest/lead/interact-check.png" });
await browser.close();
