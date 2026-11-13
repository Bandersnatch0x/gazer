/**
 * 投影隐藏线全剧本巡览(票 0056–0060 的可视化验收)。
 * 真实浏览器 + 真实泵;唯一脚本化的是时间:tick 补丁跳到每个节拍的
 * 整点前两 tick,让循环自然走过 percolationDue/newsDue 的判定——与
 * probe-tour-replica 的 setHour 同一手法。节拍序:
 *   p00 boot(说谎的 ticker)→ p01 阶段3 常驻 → p02 第一道裂缝
 *   → p03–05 [SYSTEM] 三日播报 → p06 伪按钮武装 → p07 倒影信道
 *   → p08 溯源链展开 → p09 次日命中/落空 → p10 说谎的 ticker(收束)
 */
import { chromium } from "playwright";

const GAME_URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const OUT = "e2e/playtest/lead/projection-tour/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(800);

const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` }).then(() => console.log("shot", name));
const world = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick, gv: Math.round(w.gv), stage: w.stage, day: Math.floor(w.tick / 1200),
      projection: w.projection ?? null,
      ticker: w.uiLabels?.news_ticker ?? "",
      terminal: document.querySelector(".gazer-terminal__body")?.textContent ?? "",
      dialogue: document.querySelector(".gazer-dialogue")?.textContent ?? "",
      channelOpen: !(document.querySelector(".gazer-osd")?.hidden ?? true),
    };
  });
const patch = (kind, value) =>
  page.evaluate(({ kind, value }) => {
    const w = window.__gazer();
    if (kind === "tick") w.tick = value;
    if (kind === "gv") w.gv = value;
  }, { kind, value });
/** 跳到「今天 + offset」那一天的 08:55,等循环自然走进 09:00:00。 */
async function jumpToPercolation(offset) {
  const w = await world();
  const target = (w.day + offset) * 1200 + 1046;
  await patch("tick", target);
  for (let i = 0; i < 24; i += 1) {
    await sleep(1000);
    const now = await world();
    if (now.tick % 1200 >= 1050 && now.tick % 1200 < 1054) return now;
  }
  return null;
}
const terminalHas = (needle) =>
  page.evaluate((needle) => (document.querySelector(".gazer-terminal__body")?.textContent ?? "").includes(needle), needle);

// ---- p00 boot:说谎的 ticker(阶段 0,ticker 只报屋内)----
{
  const w = await world();
  console.log("p00:", JSON.stringify({ day: w.day, ticker: w.ticker.slice(0, 60) }));
  await shot("p00-boot-lying-ticker");
}

// ---- p01 阶段 3:终端常驻(主线语境)----
await page.evaluate(() => window.__gazerDebug.setGv(60));
await sleep(1000);
await shot("p01-stage3-terminal-resident");

// ---- p02 第一道裂缝:阶段 ≥3 的渗入日,1/3 概率群体说出信种原型 ----
let crackDay = null;
for (let offset = 1; offset <= 4 && crackDay === null; offset += 1) {
  const before = await world();
  const linesBefore = before.dialogue.length;
  const w = await jumpToPercolation(offset);
  if (w === null) { console.log("!! percolation jump missed"); continue; }
  await sleep(1500);
  const after = await world();
  if (after.dialogue.length > linesBefore + 4) {
    crackDay = after.day;
    console.log("p02 crack at day", crackDay, ":", after.dialogue.slice(-160));
    await shot("p02-first-crack");
  }
}
if (crackDay === null) console.log("p02: crack gate missed on 4 days (1/3 per day; covered by reducer test)");

// ---- p03–05 [SYSTEM] 三日播报(GV ≥80,每日一条)----
await page.evaluate(() => window.__gazerDebug.setGv(85));
await sleep(1000);
for (const [i, offset] of [1, 1, 1].entries()) {
  const w = await jumpToPercolation(offset);
  if (w === null) { console.log(`!! system line ${i + 1} jump missed`); continue; }
  await sleep(1500);
  const armed = await terminalHas("auxiliary input detected");
  console.log(`p0${3 + i}: system line ${i + 1} at day`, w.day, "seen:", armed);
  await shot(`p0${3 + i}-system-line-${i + 1}`);
}

// ---- p06 伪按钮武装:点击 [ _ ] ----
await sleep(1500);
const fake = page.locator(".gazer-terminal__fake");
await fake.click();
await sleep(800);
{
  const w = await world();
  console.log("p06: channel open after fake-button click:", w.channelOpen);
  await shot("p06-channel-open");
}

// ---- p07 倒影信道:四行星图 + 预测读数 ----
{
  const w = await world();
  console.log("p07:", JSON.stringify({
    rows: await page.locator(".gazer-osd__row").count(),
    prediction: await page.locator(".gazer-osd__prediction").textContent(),
  }));
  await shot("p07-reflection-rows");
}

// ---- p08 溯源链展开:点天空行 ----
await page.locator(".gazer-osd__row").first().click();
await sleep(400);
{
  const trace = await page.locator(".gazer-osd__trace").textContent().catch(() => "");
  console.log("p08 trace:", trace);
  await shot("p08-trace-chain");
}

// ---- p09 次日命中/落空:再跳一天,预测结算,重开信道 ----
await page.locator(".gazer-osd__close").click();
await sleep(400);
await jumpToPercolation(1);
await sleep(1500);
await fake.click();
await sleep(800);
{
  const w = await world();
  const resolved = (w.projection?.predictions ?? []).filter((claim) => claim.resolvedTo !== null);
  console.log("p09: resolved predictions:", JSON.stringify(resolved));
  await shot("p09-prediction-resolved");
}

// ---- p10 收束:说谎的 ticker 依旧 ----
{
  const w = await world();
  console.log("p10 ticker:", w.ticker.slice(0, 80));
  await shot("p10-ticker-still-lying");
}

console.log("errors:", JSON.stringify(errors.slice(0, 5)));
console.log(errors.length === 0 ? "PROJECTION TOUR: CLEAN" : "PROJECTION TOUR: WITH ERRORS");
await browser.close();
