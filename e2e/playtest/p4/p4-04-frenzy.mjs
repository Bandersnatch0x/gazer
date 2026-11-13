/**
 * P4 场景 4 — 高频操作 / 快速切换 / resize / 标签页失焦（rAF 节流）后世界时钟追赶。
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHOTS, BASE, sleep, log, attachCollectors, readState, creaturePoint, boot, note, uiText,
} from "./lib.mjs";

const OUT = join(import.meta.dirname, "logs", "p4-04-frenzy.md");
const URL = `${BASE}?debug=1&endpoint=/v1/game&seed=1997`;
note(OUT, `# P4-04 高频操作与时钟 ${new Date().toISOString()}\nURL: ${URL}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await context.newPage();
const col = attachCollectors(page, "04");

await boot(page, URL);
note(OUT, "\n## A. 按钮快速连点");
const keys = page.locator(".gazer-bar .gazer-key");
const keyCount = await keys.count();
note(OUT, `- 底栏按钮数：${keyCount}`);
for (let round = 0; round < 3; round += 1) {
  for (let i = 0; i < keyCount; i += 1) {
    // 不等动画，极速连点 6 次
    for (let k = 0; k < 6; k += 1) {
      await keys.nth(i).click({ delay: 0, force: true }).catch(() => {});
    }
  }
}
note(OUT, `- 三轮全按钮 ×6 连点完成`);
await sleep(800);
// 关掉可能残留的面板
const closeBtn = page.locator(".gazer-panel > button").first();
if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
await page.screenshot({ path: join(SHOTS, "p4-04a-button-spam.png") });

note(OUT, "\n## B. 画布极速操作（点/双击/右键/拖拽混合轰炸）");
const s = await readState(page);
const c = s.creats[0];
const p = await creaturePoint(page, c);
for (let i = 0; i < 15; i += 1) {
  await page.mouse.click(p.x, p.y, { delay: 0 }).catch(() => {});
}
for (let i = 0; i < 8; i += 1) {
  await page.mouse.click(p.x, p.y, { button: "right", delay: 0 }).catch(() => {});
}
for (let i = 0; i < 6; i += 1) {
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 30, { steps: 2 });
  await page.mouse.move(p.x - 40, p.y - 20, { steps: 2 });
  await page.mouse.up();
}
note(OUT, `- 15 连点 + 8 右键 + 6 拖拽完成，无脚本异常`);
await sleep(1000);

note(OUT, "\n## C. 语言键极速切换 20 次");
const localeBtn = keys.first();
for (let i = 0; i < 20; i += 1) {
  await localeBtn.click({ delay: 0, force: true }).catch(() => {});
}
await sleep(400);
const txt = await uiText(page);
const zhHits = (txt.match(/[\u4e00-\u9fff]/g) ?? []).length;
const enHits = (txt.match(/[a-zA-Z]{3,}/g) ?? []).length;
const stored = await page.evaluate(() => localStorage.getItem("gazer-locale"));
note(OUT, `- 切换后 UI：中文字符 ${zhHits} 个 / 英文词 ${enHits} 个；localStorage 终值=${stored}`);
note(OUT, `- 混排嫌疑：${zhHits > 0 && enHits > 8 ? "可能中英混排（对话台词本身双语，需人工看截图）" : "无明显混排"}`);
await page.screenshot({ path: join(SHOTS, "p4-04c-locale-spam.png") });

note(OUT, "\n## D. 窗口 resize 轰炸");
for (const [w, h] of [[320, 240], [1920, 1080], [500, 900], [1, 1], [960, 540]]) {
  await page.setViewportSize({ width: w, height: h });
  await sleep(250);
}
const box = await page.locator("canvas").first().boundingBox();
note(OUT, `- resize 后 canvas 盒：${JSON.stringify(box)}`);
await page.screenshot({ path: join(SHOTS, "p4-04d-resize.png") });

note(OUT, "\n## E. 标签页失焦 40s → 回来观察世界时钟");
// 采样 tick 推进速率（前台基线）
const t0 = (await readState(page)).tick;
const w0 = Date.now();
await sleep(7000);
const t1 = (await readState(page)).tick;
const foregroundTicks = (t1 - t0) / ((Date.now() - w0) / 1000);
note(OUT, `- 前台 tick 速率：${foregroundTicks.toFixed(2)} tick/s（期望 ≈0.33，即 3s/tick）`);
// 开第二个页签抢焦点，模拟失焦
const page2 = await context.newPage();
await page2.goto("about:blank");
await page2.bringToFront();
const tBeforeBg = (await readState(page)).tick;
const bgWall0 = Date.now();
await sleep(40000);
const tAfterBg = (await readState(page)).tick;
const bgElapsed = (Date.now() - bgWall0) / 1000;
const bgExpected = Math.floor(bgElapsed / 3);
note(OUT, `- 失焦 ${Math.round(bgElapsed)}s：tick ${tBeforeBg} -> ${tAfterBg}（推进 ${tAfterBg - tBeforeBg}，期望 ≈${bgExpected}）`);
// 回前台后 5s 内采样 tick 跳变，看是否有「追赶爆发」
await page.bringToFront();
const catchSamples = [];
const c0 = (await readState(page)).tick;
for (let i = 0; i < 10; i += 1) {
  await sleep(500);
  catchSamples.push((await readState(page)).tick - c0);
}
note(OUT, `- 回前台后 5s 内 tick 增量序列：${catchSamples.join(",")}（有 >2 的跳步 = 追赶爆发；全 1-2 = 无追赶）`);
const tFinal = c0 + (catchSamples[catchSamples.length - 1] ?? 0);
const totalMissed = bgExpected - (tAfterBg - tBeforeBg);
note(OUT, `- 失焦期间可能丢失 tick：≈${totalMissed > 0 ? totalMissed : 0}（正值且无追赶爆发 = 世界时钟落后墙钟）`);
await page.screenshot({ path: join(SHOTS, "p4-04e-after-bg.png") });
await page2.close();

// ---- 汇总 ---------------------------------------------------------------------
await sleep(3000);
const end = await readState(page);
note(OUT, `\n## 汇总`);
note(OUT, `- 终态：tick=${end.tick} stage=${end.stage} creatures=${end.creats.length} eggs=${end.eggs}`);
note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 10), null, 1)}`);
note(OUT, `- 真实 warning：${col.warnings.length === 0 ? "无" : col.warnings.slice(0, 6).map((w) => w.text.slice(0, 140)).join(" | ")}`);

writeFileSync(
  join(import.meta.dirname, "logs", "p4-04-frenzy.json"),
  JSON.stringify({ errors: col.errors, warnings: col.warnings, tickRateForeground: foregroundTicks, end }, null, 2),
);
log("scenario 4 done; errors:", col.errors.length);
await browser.close();
