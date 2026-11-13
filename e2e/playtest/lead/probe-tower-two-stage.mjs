/** 票 0015 §2 探针:两段跨阈 0→1→2,验证第二次跨阈后塔是否消失。 */
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
      return { tick: w.tick, gv: +w.gv.toFixed(2), stage: w.stage, structures: w.structures.map((s) => s.kind) };
    })
    .then((s) => console.log(label, JSON.stringify(s)));

const tapCreature = async () => {
  const c = await page.evaluate(() => {
    const w = window.__gazer();
    const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
    return alive ? { x: alive.position.x, y: alive.position.y } : null;
  });
  if (c === null) return;
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  await page.mouse.click(px, py, { delay: 40 });
};

// 第一段:0→1
await page.evaluate(() => { window.__gazer().gv = 21; });
await tapCreature();
await sleep(3000);
await snap("stage1:");
await page.screenshot({ path: `${OUT}two-stage-1.png` });
// 第二段:1→2
await page.evaluate(() => { window.__gazer().gv = 41; });
await tapCreature();
await sleep(3000);
await snap("stage2:");
await page.screenshot({ path: `${OUT}two-stage-2.png` });
// 再等 10s 轮询
await sleep(10000);
await snap("stage2-late:");
await page.screenshot({ path: `${OUT}two-stage-2-late.png` });
await browser.close();
