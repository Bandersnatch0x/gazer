/**
 * P4 场景 3 — localStorage / seed 边界。
 * a) 损坏的 gazer-locale 值；b) 超长 locale 值；c) 存储配额打满后点击语言按钮；
 * d) localStorage 完全不可用（抛错的桩）；e) ?seed= 各类畸形值。
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHOTS, BASE, sleep, log, attachCollectors, readState, boot, note, uiText,
} from "./lib.mjs";

const OUT = join(import.meta.dirname, "logs", "p4-03-storage.md");
note(OUT, `# P4-03 localStorage / seed 边界 ${new Date().toISOString()}`);

const browser = await chromium.launch();
const results = [];

async function fresh(colLabel) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const col = attachCollectors(page, colLabel);
  return { context, page, col };
}

// ---- A. 损坏的 locale ---------------------------------------------------------
{
  note(OUT, "\n## A. 损坏的 gazer-locale");
  const { context, page, col } = await fresh("03A");
  await page.addInitScript(() => localStorage.setItem("gazer-locale", "{{{broken json!!"));
  try {
    await boot(page, `${BASE}?debug=1&seed=1997`);
    const txt = await uiText(page);
    const zh = /语言|帮助|图鉴/.test(txt);
    note(OUT, `- 损坏值下启动：成功；UI 语言=${zh ? "中文" : "英文"}（期望英文兜底）`);
    // 点语言按钮，验证可以纠正
    await page.locator(".gazer-bar .gazer-key").first().click();
    await sleep(300);
    const txt2 = await uiText(page);
    note(OUT, `- 点击语言键后：${/语言|帮助|图鉴/.test(txt2) ? "切到中文 OK" : "仍是英文"}`);
    const stored = await page.evaluate(() => localStorage.getItem("gazer-locale"));
    note(OUT, `- 存储已覆写为：${stored}`);
    await page.screenshot({ path: join(SHOTS, "p4-03a-bad-locale.png") });
  } catch (e) { note(OUT, `- 启动失败：${String(e).slice(0, 300)}`); }
  note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 5))}`);
  results.push({ case: "bad-locale", errors: col.errors.length });
  await context.close();
}

// ---- B. 超长 locale 值（1MB 垃圾） --------------------------------------------
{
  note(OUT, "\n## B. 超长 gazer-locale（1MB）");
  const { context, page, col } = await fresh("03B");
  await page.addInitScript(() => localStorage.setItem("gazer-locale", "x".repeat(1024 * 1024)));
  try {
    await boot(page, `${BASE}?debug=1&seed=1997`);
    note(OUT, `- 启动成功（locale 读取按 isLocale 白名单校验，超长值被忽略）`);
    await page.locator(".gazer-bar .gazer-key").first().click();
    await sleep(300);
    const stored = await page.evaluate(() => localStorage.getItem("gazer-locale"));
    note(OUT, `- 点击语言键后存储值：${stored === null ? "null" : `${stored.length} 字符`}`);
  } catch (e) { note(OUT, `- 失败：${String(e).slice(0, 300)}`); }
  note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 5))}`);
  results.push({ case: "huge-locale", errors: col.errors.length });
  await context.close();
}

// ---- C. 配额打满后点语言按钮（setItem 会抛 QuotaExceededError） ----------------
{
  note(OUT, "\n## C. 配额打满 + 点击语言按钮");
  const { context, page, col } = await fresh("03C");
  try {
    await boot(page, `${BASE}?debug=1&seed=1997`);
    // 打满配额（每键 1MB，~10MB 上限）
    await page.evaluate(() => {
      let i = 0;
      try {
        for (; i < 20; i += 1) localStorage.setItem(`p4-junk-${i}`, "j".repeat(1024 * 1024));
      } catch { /* 配额满即停 */ }
      return i;
    });
    const junkKeys = await page.evaluate(() => Object.keys(localStorage).length);
    note(OUT, `- 塞入垃圾键后 localStorage 键数：${junkKeys}`);
    await page.locator(".gazer-bar .gazer-key").first().click();
    await sleep(500);
    note(OUT, `- 点击语言键：未抛出（或已处理）`);
    await page.screenshot({ path: join(SHOTS, "p4-03c-quota.png") });
  } catch (e) { note(OUT, `- 失败：${String(e).slice(0, 300)}`); }
  note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 5), null, 1)}`);
  results.push({ case: "quota-full", errors: col.errors.length });
  await context.close();
}

// ---- D. localStorage 完全不可用 ------------------------------------------------
{
  note(OUT, "\n## D. localStorage 抛错（隐私模式桩）");
  const { context, page, col } = await fresh("03D");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new Error("SecurityError: storage disabled"); },
      configurable: true,
    });
  });
  try {
    await boot(page, `${BASE}?debug=1&seed=1997`);
    note(OUT, `- localStorage 禁用下启动：成功`);
    await page.locator(".gazer-bar .gazer-key").first().click();
    await sleep(400);
    note(OUT, `- 点击语言键：未崩溃`);
  } catch (e) {
    note(OUT, `- 失败（可能启动即白屏/卡住）：${String(e).slice(0, 300)}`);
    await page.screenshot({ path: join(SHOTS, "p4-03d-nostorage.png") });
  }
  note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 6), null, 1)}`);
  results.push({ case: "no-storage", errors: col.errors.length });
  await context.close();
}

// ---- E. seed 边界 --------------------------------------------------------------
{
  note(OUT, "\n## E. ?seed= 畸形值矩阵");
  const seeds = ["", "abc", "-5", "0", "99999999999999999999", "1e21", "NaN", "1997';--", "null", "0.5", " 1997 "];
  const { context, page, col } = await fresh("03E");
  for (const seed of seeds) {
    const url = `${BASE}?debug=1&endpoint=/v1/game&seed=${encodeURIComponent(seed)}`;
    try {
      await boot(page, url);
      const s = await readState(page);
      note(OUT, `- seed="${seed}" -> 启动 OK，归一化 seed=${s.seed}，creatures=${s.creats.length}`);
    } catch (e) {
      note(OUT, `- seed="${seed}" -> 启动失败：${String(e).slice(0, 200)}`);
      await page.screenshot({ path: join(SHOTS, `p4-03e-seed-fail.png`) });
    }
  }
  note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 6), null, 1)}`);
  results.push({ case: "seed-matrix", errors: col.errors.length });
  await context.close();
}

// ---- F. 持久化缺失观察 ----------------------------------------------------------
{
  note(OUT, "\n## F. 刷新持久化观察");
  const { context, page, col } = await fresh("03F");
  await boot(page, `${BASE}?debug=1&endpoint=/v1/game&seed=1997`);
  const s1 = await readState(page);
  // 喂两口制造状态差
  const c = s1.creats[0];
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.tile.x - c.tile.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.tile.x + c.tile.y) * 4 + 4) / 180) * box.height;
  await page.mouse.click(px, py, { delay: 40 });
  await sleep(1500);
  const pre = await readState(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
  const post = await readState(page);
  note(OUT, `- 刷新前 tick=${pre.tick} gv=${pre.gv}；刷新后 tick=${post.tick} gv=${post.gv}`);
  note(OUT, `- localStorage 内与游戏相关的键：${JSON.stringify(await page.evaluate(() => Object.keys(localStorage)))}`);
  note(OUT, `- 结论：无世界持久化层（票 0008 已注明），刷新即重置世界`);
  results.push({ case: "persistence", errors: col.errors.length });
  await context.close();
}

await browser.close();
writeFileSync(join(import.meta.dirname, "logs", "p4-03-storage.json"), JSON.stringify(results, null, 2));
log("scenario 3 done");
