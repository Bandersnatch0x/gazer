/**
 * P3 补充探针：① HUD 语言切换是否在下一个 tick 追上；② 阶段 2 的
 * 「未做之事的记忆」(fabricated 标记) 是否真实可达、可辨；③ 交互后的图鉴
 * （信任值/记忆条目的中文声线）；④ 来路标记悬停态截图。
 * 用法: node e2e/playtest/p3/probe2.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[p3:probe2]", ...a);
mkdirSync(SHOTS, { recursive: true });

const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};
const creaturePoint = async () => {
  const tile = await page.evaluate(() => {
    const c = Object.values(window.__gazer().creatures).find((x) => x.behavior !== "dead");
    return { x: c.position.x, y: c.position.y };
  });
  return cssPoint(centerOf(tile));
};
const st = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return { tick: w.tick, gv: w.gv, stage: w.stage };
  });

// ① HUD 语言切换延迟：切到 EN，等 5 秒（>1 个 tick 3s），看 HUD 是否追上。
{
  await page.locator(".gazer-bar .gazer-key").first().click();
  await sleep(300);
  const hudAt0 = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
  await sleep(5000);
  const hudAt5 = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
  // 切回 zh，继续主流程
  await page.locator(".gazer-bar .gazer-key").first().click();
  await sleep(5000);
  const hudBack = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
  log("HUD@0s:", hudAt0);
  log("HUD@5s:", hudAt5);
  log("HUD@back-zh:", hudBack);
  await page.screenshot({ path: join(SHOTS, "probe2-hud-locale.png") });
}

// 命名一只（制造记忆），随后交互
{
  const p = await creaturePoint();
  await page.mouse.down();
  await sleep(1750);
  await page.mouse.up();
  await page.waitForSelector(".gazer-panel .gazer-input", { timeout: 3000 });
  await page.locator(".gazer-input").fill("阿凝");
  await page.locator(".gazer-panel .gazer-choice").click();
  await sleep(400);
  // 喂两口
  for (let i = 0; i < 2; i += 1) {
    const q = await creaturePoint();
    await page.mouse.click(q.x, q.y, { delay: 30 });
    await sleep(600);
  }
}

// ② 磨 GAZE 到阶段 2（gv 40），等「编造」标记台词
log("grinding GAZE to stage 2…");
const start = Date.now();
while (Date.now() - start < 240000) {
  const box = await page.locator("canvas").first().boundingBox();
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.move(box.x + box.width * (0.25 + 0.06 * i), box.y + box.height * 0.5);
    await sleep(120);
  }
  const s = await st();
  if (s.stage >= 2) { log("stage 2 reached at", JSON.stringify(s)); break; }
  if (s.stage >= 1 && s.stage < 2 && Math.floor(s.gv) % 5 === 0) log("  gv:", s.gv.toFixed(1));
}
await sleep(12000); // 等阶段台词 + 圆桌揭示完

// 抓全部台词与标记
const dialogue = await page.evaluate(() =>
  [...document.querySelectorAll(".gazer-dialogue__line")].map((line) => ({
    text: line.querySelector(".gazer-dialogue__text")?.textContent ?? "",
    status: line.querySelector(".gazer-witness")?.getAttribute("data-status") ?? "",
  })),
);
log("dialogue:", JSON.stringify(dialogue, null, 2));
await page.screenshot({ path: join(SHOTS, "probe2-stage2-dialogue.png") });

// ④ 悬停「编造」标记（若有）截图；否则悬停任意标记
const mark = page.locator('.gazer-witness[data-status="fabricated"]').first();
const anyMark = page.locator(".gazer-witness").first();
try {
  if (await mark.count()) {
    await mark.hover();
  } else {
    await anyMark.hover();
  }
  await sleep(400);
  await page.screenshot({ path: join(SHOTS, "probe2-witness-hover.png") });
} catch (e) {
  log("hover shot failed:", String(e));
}

// ③ 交互后的图鉴：信任值、近期记忆条目的中文声线
{
  await page.locator(".gazer-bar .gazer-key").nth(1).click();
  await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
  await sleep(300);
  const albumText = await page.evaluate(() => document.querySelector(".gazer-panel")?.innerText ?? "");
  const memories = await page.evaluate(() =>
    [...document.querySelectorAll(".gazer-album__memory")].map((li) => ({
      status: li.getAttribute("data-status"),
      text: li.textContent,
    })),
  );
  log("album after play:", albumText.slice(0, 1200));
  log("memory lines:", JSON.stringify(memories, null, 2));
  await page.screenshot({ path: join(SHOTS, "probe2-album-after-play.png") });
}

writeFileSync(join(HERE, "probe2-result.json"), JSON.stringify({ dialogue, errors }, null, 2), "utf8");
log("errors:", errors.length === 0 ? "none" : errors.join(" | "));
await browser.close();
