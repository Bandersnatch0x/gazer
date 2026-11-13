/** Lead 探针：顶栏动词按钮（喂/抚摸）是否渲染且生效。 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

// 按钮存在性
const buttons = await page.evaluate(() =>
  [...document.querySelectorAll(".gazer-bar .gazer-key")].map((b) => b.textContent),
);
console.log("bar buttons:", JSON.stringify(buttons));

// 点「喂」两次 → hunger/GV 反应
const state = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    const creats = Object.values(w.creatures);
    return {
      gv: Math.round(w.gv * 10) / 10,
      hungriest: Math.min(...creats.map((c) => c.stats.hunger)),
      lines: document.querySelectorAll(".gazer-dialogue__line").length,
    };
  });

const before = await state();
console.log("before:", JSON.stringify(before));
const feedBtn = page.locator(".gazer-bar .gazer-key", { hasText: "喂" });
await feedBtn.click();
await sleep(700);
await feedBtn.click();
await sleep(700);
const afterFeed = await state();
console.log("after feed:", JSON.stringify(afterFeed));

// 点「抚摸」
const petBtn = page.locator(".gazer-bar .gazer-key", { hasText: "抚摸" });
await petBtn.click();
await sleep(500);
const afterPet = await state();
console.log("after pet:", JSON.stringify(afterPet));

const feedOk = afterFeed.gv > before.gv || afterFeed.hungriest > before.hungriest;
const petOk = afterPet.hungriest > afterFeed.hungriest || afterPet.lines > afterFeed.lines;
console.log("feed button works:", feedOk, "| pet button works:", petOk);
await page.screenshot({ path: "e2e/playtest/lead/verb-buttons.png" });
await browser.close();
