/**
 * 投影线预测闭环真机验证(票 0057 验收的最后一块)。
 * 巡览(2a2b94b)的 tick 跳跃从不跨午夜,advanceProjections 的日界钩
 * 未被真实触发。本探针:跳到 23:58,等 4 tick(12s)自然跨过午夜——
 * 日界结算、预测产生、次日命中入账,全程真实泵,零直写。
 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(800);

const world = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick, gv: Math.round(w.gv), stage: w.stage,
      day: Math.floor(w.tick / 1200),
      projection: w.projection ?? null,
    };
  });
const patchTick = (value) => page.evaluate((value) => { window.__gazer().tick = value; }, value);
/** 跳到目标日界的 23:55,等循环自然走过午夜。日历以正午为锚
 * (boot = hour 12),午夜在 phaseTicks 600——不是 0,从 1198 跨 1200
 * 会从 23:58 直接跳到次日 12:00,把午夜整个跳过去(首次运行的教训)。 */
async function crossMidnight(dayOffset) {
  const w = await world();
  const target = (w.day + dayOffset) * 1200 + 594;
  console.log("crossMidnight: day", w.day, "offset", dayOffset, "target", target);
  await patchTick(target);
  for (let i = 0; i < 30; i += 1) {
    await sleep(1000);
    const now = await world();
    const phase = now.tick % 1200;
    if (i % 4 === 0) console.log("  poll", i, "tick", now.tick, "phase", phase);
    if (phase >= 600 && phase < 612) return now;
  }
  return null;
}

// GV 85:投影线全脸(播报/武装/信道)在线;静默窗口避开午夜后半。
await page.evaluate(() => window.__gazerDebug.setGv(85));
await sleep(1000);

// ---- 夜界 1:预测产生 ----
const mid1 = await crossMidnight(1);
if (mid1 === null) { console.log("!! midnight 1 not crossed"); process.exit(1); }
await sleep(1500);
const after1 = await world();
const open = (after1.projection?.predictions ?? []).filter((claim) => claim.resolvedTo === null);
console.log("midnight 1:", JSON.stringify({
  day: Math.floor(after1.tick / 1200),
  hasProjection: after1.projection !== null,
  openClaims: open.map((claim) => ({ topic: claim.topic, resolvesOnDay: claim.resolvesOnDay, confidence: claim.confidence })),
}));
await page.screenshot({ path: "e2e/playtest/lead/projection-tour/m1-prediction-formed.png" });

// ---- 夜界 2:昨日结算 + 明日新claim ----
const mid2 = await crossMidnight(1);
if (mid2 === null) { console.log("!! midnight 2 not crossed"); process.exit(1); }
await sleep(1500);
const after2 = await world();
const resolved = (after2.projection?.predictions ?? []).filter((claim) => claim.resolvedTo !== null);
const open2 = (after2.projection?.predictions ?? []).filter((claim) => claim.resolvedTo === null);
const hits = after2.projection?.hits ?? null;
console.log("midnight 2:", JSON.stringify({
  resolved: resolved.map((claim) => ({ topic: claim.topic, resolvedTo: claim.resolvedTo })),
  open: open2.map((claim) => ({ topic: claim.topic, resolvesOnDay: claim.resolvesOnDay })),
  hits,
}));
await page.screenshot({ path: "e2e/playtest/lead/projection-tour/m2-prediction-resolved.png" });

// ---- 信道展示归巡览(2a2b94b 的 p06/p07)验证:本探针不走 hour 9 播报,
// 伪按钮不武装,信道不开——此处只断言状态层闭环。----

const checks = {
  predictionFormed: open.length > 0,
  predictionResolved: resolved.length > 0 && resolved[0].resolvedTo !== null,
  hitsCounted: hits !== null && Object.values(hits).some((bucket) => bucket.hit + bucket.miss > 0),
  noPageErrors: errors.length === 0,
};
console.log("errors:", JSON.stringify(errors.slice(0, 5)));
console.log("checks:", JSON.stringify(checks));
const ok = Object.values(checks).every(Boolean);
console.log(ok ? "PREDICTION LOOP: PASS" : "PREDICTION LOOP: FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
