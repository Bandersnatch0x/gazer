/** 票 0015 §4 探针2:静默周目对话框体 + 命名/孵化/家谱点选面板;zh 两态。 */
import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_SILENT = "http://localhost:5199/?debug=1&seed=1997"; // 无 endpoint = 静默周目
const URL_ZH = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";

const dumpDlg = (page, label) =>
  page
    .evaluate(() => {
      const body = document.querySelector(".gazer-dialogue__body");
      const root = document.querySelector(".gazer-dialogue");
      return body
        ? { len: (body.innerText ?? "").length, head: (body.innerText ?? "").slice(0, 100), rootH: root?.getBoundingClientRect().height ?? 0 }
        : null;
    })
    .then((s) => console.log(`[dlg ${label}]`, JSON.stringify(s)));

const browser = await chromium.launch();

// 静默周目:对话框体是否空白
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(URL_SILENT, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
  await sleep(1500);
  await dumpDlg(page, "silent boot");
  await page.close();
}

// 命名面板 + 孵化选择 + 家谱节点点选
{
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => console.log("pageerror:", String(e)));
  await page.goto(URL_ZH, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
  await sleep(800);

  const dumpPanel = async (label) => {
    const info = await page.evaluate(() => {
      const el = document.querySelector(".gazer-panel");
      if (!el) return "(no .gazer-panel)";
      const text = el.innerText ?? "";
      return JSON.stringify({ hidden: el.hidden, len: text.length, head: text.slice(0, 140) });
    });
    console.log(`[${label}]`, info);
  };

  // 家谱节点点选 → 复用图鉴详情
  await page.locator(".gazer-bar .gazer-key").nth(2).click();
  await sleep(500);
  const pick = page.locator(".gazer-tree__pick").first();
  if (await pick.isVisible().catch(() => false)) {
    await pick.click();
    await sleep(500);
    await dumpPanel("lineage-node-detail");
    await page.locator(".gazer-panel > button").first().click();
    await sleep(250);
  } else {
    console.log("[lineage-node-detail] no pick nodes");
  }

  // 命名面板(长按 1100ms)
  const c = await page.evaluate(() => {
    const w = window.__gazer();
    const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
    return alive ? { x: alive.position.x, y: alive.position.y } : null;
  });
  if (c) {
    const box = await page.locator("canvas").first().boundingBox();
    const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
    const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await sleep(1150);
    await page.mouse.up();
    await sleep(600);
    await dumpPanel("naming (hold 1.1s)");
    const close = page.locator(".gazer-panel > button").first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await sleep(250);
    }
  }

  // zh 切换后各面板
  await page.locator(".gazer-bar .gazer-key").nth(0).click();
  await sleep(300);
  await page.locator(".gazer-bar .gazer-key").nth(1).click();
  await sleep(500);
  await dumpPanel("bestiary-zh");
  await page.close();
}

await browser.close();
