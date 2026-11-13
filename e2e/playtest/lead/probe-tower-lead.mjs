/** 票 0015 §2 探针:跨阈(补丁 gv→41)后截图,统计 tile(12,2) 塔区像素。 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const GAME_URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const OUT = new URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(OUT, { recursive: true });
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

await snap("before:");
await page.evaluate(() => { window.__gazer().gv = 41; });
// stage 只在 gv delta 时重推:补一次真实喂食点击让 step 重算 stage → onStageChange
const c = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  return alive ? { x: alive.position.x, y: alive.position.y } : null;
});
if (c) {
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  await page.mouse.click(px, py, { delay: 40 });
}
await sleep(4000); // 跨阈 + 前摇 + 生长 1.5s
await snap("after:");
await page.screenshot({ path: OUT + "tower-stage2.png" });
console.log("shot:", OUT + "tower-stage2.png");

// 再等几拍,排除生长动画未完成
await sleep(5000);
await page.screenshot({ path: OUT + "tower-stage2-late.png" });

// 渲染层诊断:读 objectLayer 里塔 sprite/mask 的几何(通过 Pixi 全局不可达,改用像素)
await browser.close();
