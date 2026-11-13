/**
 * Lead 视觉验证（ticket 0017 剩余渲染面项）：
 * §10 季节漂移可辨、§11 死亡瞬间视觉、§12 LLM 台词气泡。
 * 仅通过 ?debug=1 的只读句柄做运行时输入，不改任何源码。
 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

await page.screenshot({ path: "e2e/playtest/lead/v1-spring.png" });

// 跨到阶段 2（autumn）：gv 拉到 39.5，再喂一次跨界（走 onStageChange 全流程）
await page.evaluate(() => { window.__gazer().gv = 39.4; });
await page.waitForTimeout(500);
let crossed = false;
for (let i = 0; i < 30 && !crossed; i += 1) {
  const p = await page.evaluate(() => {
    const alive = Object.values(window.__gazer().creatures).filter((c) => c.behavior !== "dead");
    const c = alive[0];
    return c ? { x: c.position.x, y: c.position.y } : null;
  });
  if (!p) break;
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + (p.x / 320) * box.width, box.y + (p.y / 180) * box.height, { delay: 40 });
  await sleep(700);
  const st = await page.evaluate(() => ({ stage: window.__gazer().stage, gv: window.__gazer().gv }));
  if (st.stage >= 2) crossed = true;
}
console.log("crossed to stage 2:", crossed);
await sleep(2500); // 等圆桌 LLM 往返 + 播放
await page.screenshot({ path: "e2e/playtest/lead/v2-autumn.png" });

// 气泡 burst：LLM 回合逐条揭示（1.5-4s 节拍），连续抓帧
for (let i = 0; i < 8; i += 1) {
  await page.screenshot({ path: `e2e/playtest/lead/v3-bubble-${i}.png` });
  await sleep(800);
}

// 尸体视觉：饿死一只
await page.evaluate(() => {
  const w = window.__gazer();
  const c = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  if (c) c.stats.hunger = 0.5;
});
await page.waitForTimeout(5000); // 等 tick 处理死亡
await page.screenshot({ path: "e2e/playtest/lead/v4-corpse.png" });

const state = await page.evaluate(() => {
  const w = window.__gazer();
  return {
    stage: w.stage,
    structures: w.structures.map((s) => s.kind),
    behaviors: Object.values(w.creatures).map((c) => ({ id: c.id, b: c.behavior })),
    stains: Object.keys(w.social?.stains ?? {}).length,
  };
});
console.log(JSON.stringify(state, null, 1));
await browser.close();
