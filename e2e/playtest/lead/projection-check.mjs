/**
 * Lead 探针(投影隐藏线,票 0058 验收):真实产物上验证 GV80 跨越与
 * 投影面的挂载纪律。日尺度节拍([SYSTEM] 三日播报、伪按钮武装、信道
 * 内容)由 1052 条 reducer/UI 测试覆盖——真实时间一天 3600s,探针只验
 * 快路径:boot 干净、GV 跳转落位、信道 DOM 存在但隐藏(被动面)。
 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

const boot = await page.evaluate(() => {
  const w = window.__gazer();
  return {
    gv: Math.round(w.gv),
    stage: w.stage,
    tick: w.tick,
    channel: document.querySelector(".gazer-osd") !== null,
    channelHidden: document.querySelector(".gazer-osd")?.hidden ?? null,
    ticker: document.querySelector("[data-news], .gazer-hud") !== null,
  };
});
console.log("boot:", JSON.stringify(boot));

// GV80 跨越:debug 写面走真实泵路径(觉醒/舞台/塔门全走既有通道)。
await page.evaluate(() => window.__gazerDebug.setGv(80));
await sleep(1200);
const at80 = await page.evaluate(() => {
  const w = window.__gazer();
  return {
    gv: Math.round(w.gv),
    stage: w.stage,
    channelHidden: document.querySelector(".gazer-osd")?.hidden ?? null,
  };
});
console.log("at80:", JSON.stringify(at80));

await page.screenshot({ path: "e2e/playtest/lead/projection-check.png" });

const checks = {
  bootClean: boot.gv >= 0 && boot.stage === 0 && boot.channel === true && boot.channelHidden === true,
  gvLands: at80.gv === 80 && at80.stage === 4,
  channelStillPassive: at80.channelHidden === true,
  noPageErrors: errors.length === 0,
};
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
console.log("checks:", JSON.stringify(checks));
const ok = Object.values(checks).every(Boolean);
console.log(ok ? "PROJECTION CHECK: PASS" : "PROJECTION CHECK: FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
