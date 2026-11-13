/** 票 0015 §1/§3/§4 验证:凝视跨阈反馈、图鉴信任值、静默周目占位文案。 */
import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const SILENT = "http://localhost:5199/?debug=1&seed=1997";

const browser = await chromium.launch();

// ---- §1 凝视跨阈:指针静止在生物上,等 stare 窗口累积 GV,观察跨阈反馈 ----
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(LIVE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
  await sleep(800);
  await page.evaluate(() => { window.__gazer().gv = 19; });
  const c = await page.evaluate(() => {
    const w = window.__gazer();
    const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
    return alive ? { x: alive.position.x, y: alive.position.y } : null;
  });
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  // 连续小幅 pointermove(保持 stare 判定),每 250ms 一动,持续 40s
  const dialogueBefore = await page.evaluate(() => document.querySelectorAll(".gazer-dialogue__line").length);
  let crossed = null;
  for (let i = 0; i < 160; i += 1) {
    await page.mouse.move(px + (i % 2), py + ((i + 1) % 2));
    await sleep(250);
    const s = await page.evaluate(() => {
      const w = window.__gazer();
      return { gv: +w.gv.toFixed(1), stage: w.stage, structures: w.structures.map((x) => x.kind) };
    });
    if (s.stage >= 1 && s.structures.includes("black_tower")) { crossed = { i, ...s }; break; }
  }
  const dialogueAfter = await page.evaluate(() => document.querySelectorAll(".gazer-dialogue__line").length);
  console.log("[§1 gaze cross]", JSON.stringify({ crossed, dialogueBefore, dialogueAfter, errors: pageErrors.length }));
  if (!crossed) console.log("!! §1 凝视未在 40s 内跨阈(GV 累积过慢?)");
  await page.close();
}

// ---- §3 图鉴信任:喂 3 口后开图鉴,断言 trust ≠ 0.00 ----
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(LIVE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
  await sleep(800);
  for (let i = 0; i < 3; i += 1) {
    const c = await page.evaluate(() => {
      const w = window.__gazer();
      const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
      return alive ? { x: alive.position.x, y: alive.position.y } : null;
    });
    const box = await page.locator("canvas").first().boundingBox();
    const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
    const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
    await page.mouse.click(px, py, { delay: 40 });
    await sleep(600);
  }
  await page.locator(".gazer-bar .gazer-key").nth(1).click();
  await sleep(500);
  const trust = await page.evaluate(() => {
    const text = document.querySelector(".gazer-panel")?.innerText ?? "";
    const m = [...text.matchAll(/trust([+-]?\d+\.\d+)/g)].map((x) => x[1]);
    return m;
  });
  console.log("[§3 trust values]", JSON.stringify(trust));
  if (trust.length === 0 || trust.every((v) => v === "0.00")) {
    console.log("!! §3 信任仍全 0.00(或无值)");
  } else {
    console.log("PASS §3: trust 出现非零值");
  }
  await page.close();
}

// ---- §4 静默周目占位:无 endpoint 启动,对话框体应有 emptyScript 占位 ----
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(SILENT, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
  await sleep(800);
  const dlg = await page.evaluate(() => {
    const body = document.querySelector(".gazer-dialogue__body");
    return { len: (body?.innerText ?? "").length, text: (body?.innerText ?? "").slice(0, 80) };
  });
  console.log("[§4 silent dialogue]", JSON.stringify(dlg));
  if (dlg.len === 0) console.log("!! §4 静默周目对话框仍空白");
  else console.log("PASS §4: 占位文案已渲染");
  // 切中文再验一次
  await page.locator(".gazer-bar .gazer-key").nth(0).click();
  await sleep(300);
  const dlgZh = await page.evaluate(() => (document.querySelector(".gazer-dialogue__body")?.innerText ?? "").slice(0, 60));
  console.log("[§4 silent dialogue zh]", JSON.stringify(dlgZh));
  await page.close();
}

await browser.close();
