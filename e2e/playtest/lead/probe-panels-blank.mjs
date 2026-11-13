/** 票 0015 §4 探针:逐个打开面板,找出内容区空白者;顺带看塔是否渲染。 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e)));
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(1000);

const dumpPanel = async (label) => {
  const info = await page.evaluate(() => {
    const el = document.querySelector(".gazer-panel");
    if (!el) return "(no .gazer-panel)";
    const body = el.querySelector(".gazer-form, .gazer-album, .gazer-tree, .gazer-help");
    const text = (body ?? el).innerText ?? el.innerText ?? "";
    return JSON.stringify({
      hidden: el.hidden,
      panelLen: (el.innerText ?? "").length,
      bodyLen: text.length,
      head: text.slice(0, 160),
    });
  });
  console.log(`[${label}]`, info);
};

// 1..3 = bestiary / lineage / manual (0 = locale)
const keys = page.locator(".gazer-bar .gazer-key");
const labels = await keys.allInnerTexts();
console.log("[keys]", JSON.stringify(labels));
for (const idx of [1, 2, 3]) {
  await keys.nth(idx).click();
  await sleep(600);
  await dumpPanel(`panel idx=${idx} label=${labels[idx]}`);
  const close = page.locator(".gazer-panel > button").first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await sleep(300);
  }
}

// 对话框窗口体:开局(可能静默)是否空白
const dlg = await page.evaluate(() => {
  const body = document.querySelector(".gazer-dialogue__body");
  return body ? { len: (body.innerText ?? "").length, head: (body.innerText ?? "").slice(0, 120) } : null;
});
console.log("[dialogue body]", JSON.stringify(dlg));

// 双击生物开瞳孔面板
const c = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  return alive ? { x: alive.position.x, y: alive.position.y } : null;
});
if (c) {
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  await page.mouse.dblclick(px, py);
  await sleep(600);
  await dumpPanel("pupil (dblclick)");
  await page.locator(".gazer-panel > button").first().click();
  await sleep(300);
}

// 塔状态快照
const snap = await page.evaluate(() => {
  const w = window.__gazer();
  return {
    tick: w.tick, gv: +w.gv.toFixed(2), stage: w.stage,
    structures: w.structures.map((s) => s.kind),
    towerBirths: w.uiLabels?.tower_births ?? null,
  };
});
console.log("[state]", JSON.stringify(snap));

await browser.close();
