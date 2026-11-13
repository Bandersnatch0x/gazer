/** 复现探针:跨过 GV20 后 world.structures 是否真的长出黑塔。只读+运行时补丁,不改源码。 */
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
      return { tick: w.tick, gv: +w.gv.toFixed(2), stage: w.stage, structures: w.structures.map((s) => s.kind) };
    })
    .then((s) => console.log(label, JSON.stringify(s)));

await snap("boot:");

// 补 gv 到 19.8,再真实点击喂食跨阈值
await page.evaluate(() => { window.__gazer().gv = 19.8; });
await sleep(3400); // 等 tick 折叠补丁
await snap("after patch:");
const c = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  return { x: alive.position.x, y: alive.position.y };
});
const box = await page.locator("canvas").first().boundingBox();
const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
await page.mouse.click(px, py, { delay: 40 });
await snap("right after tap:");
await sleep(500);
await snap("+500ms:");
await sleep(3500);
await snap("+4s (should have tower):");
await sleep(5000);
await snap("+9s:");
await browser.close();
