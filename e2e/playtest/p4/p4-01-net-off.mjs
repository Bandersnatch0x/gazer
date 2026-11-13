/**
 * P4 场景 1 — 断网冷启动 + 断网中操作 + 恢复联网。
 * 军规 1：断网冷启动；军规 2：断网中操作是否依然可用；军规 3：恢复后是否正常。
 * 断网实现：只拦截游戏的 LLM 依赖（/v1/game 与上游 127.0.0.1:18086），
 * 不拦截 vite 静态资源（否则页面本身打不开）。恢复段另用 CDP 真离线仿真。
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHOTS, BASE, sleep, log, attachCollectors, readState, creaturePoint,
  uiText, PLACEHOLDER_RE, boot, note,
} from "./lib.mjs";

const OUT = join( import.meta.dirname, "logs", "p4-01-net-off.md");
const GAME_URL = `${BASE}?debug=1&endpoint=/v1/game&seed=1997`;
note(OUT, `# P4-01 断网冷启动 ${new Date().toISOString()}\nURL: ${GAME_URL}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const col = attachCollectors(page, "01");

// ---- 断网：中断一切 LLM 请求 -------------------------------------------------
// 注意：页面 URL 查询串里含 "endpoint=/v1/game"，glob 会误伤导航本身，
// 因此用谓词精确匹配「POST 的端点路径」。
const isLlmRequest = (url) => {
  try { return new URL(url).pathname === "/v1/game"; } catch { return false; }
};
let llmBlocked = 0;
await page.route(isLlmRequest, (route) => {
  llmBlocked += 1;
  return route.abort("failed");
});
await page.route((urlObj) => urlObj.toString().includes("127.0.0.1:18086"), (route) => route.abort("failed"));

note(OUT, "\n## 阶段 A：断网冷启动");
log("cold boot under network-blocked LLM");
await boot(page, GAME_URL);
const s0 = await readState(page);
note(OUT, `- 冷启动成功：creatures=${s0.creats.length} tick=${s0.tick} seed=${s0.seed} stage=${s0.stage}`);
await page.screenshot({ path: join(SHOTS, "p4-01-cold-boot.png") });

await sleep(4000);
const s1 = await readState(page);
note(OUT, `- 静置 4s 后 tick=${s1.tick}（时钟推进=${s1.tick > s0.tick ? "正常" : "停摆!"}）`);

// ---- 占位符扫描 --------------------------------------------------------------
const text0 = await uiText(page);
const placeholders0 = text0.match(new RegExp(PLACEHOLDER_RE.source, "gi")) ?? [];
note(OUT, `- 冷启动 UI 占位符扫描：${placeholders0.length === 0 ? "干净" : "命中 -> " + [...new Set(placeholders0)].join(", ")}`);

// ---- 军规 2：断网中完整操作 --------------------------------------------------
note(OUT, "\n## 阶段 B：断网中操作（喂/摸/搬/清/对视）");
const verb = async (name, fn) => {
  try { await fn(); note(OUT, `- ${name}: OK`); }
  catch (e) { note(OUT, `- ${name}: FAIL -> ${String(e).slice(0, 200)}`); }
};

const s2 = await readState(page);
const c0 = s2.creats[0];
const p0 = await creaturePoint(page, c0);
await verb("快速轻点(喂食)", async () => {
  await page.mouse.click(p0.x, p0.y, { delay: 40 });
  await sleep(900);
});
await verb("长按(抚摸 750ms)", async () => {
  await page.mouse.down(); await sleep(750); await page.mouse.up();
  await sleep(600);
});
await verb("右键(清洁)", async () => {
  await page.mouse.click(p0.x, p0.y, { button: "right", delay: 40 });
  await sleep(700);
});
await verb("双击(对视面板)", async () => {
  await page.mouse.click(p0.x, p0.y, { delay: 30 });
  await sleep(120);
  await page.mouse.click(p0.x, p0.y, { delay: 30 });
  try {
    await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
    await page.locator(".gazer-panel > button").first().click();
  } catch { note(OUT, "  (面板未开——记录，不阻塞)"); }
  await sleep(300);
});
if (s2.creats.length > 1) {
  const p1 = await creaturePoint(page, s2.creats[1]);
  await verb("拖拽(搬运)", async () => {
    await page.mouse.down();
    await page.mouse.move((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { steps: 4 });
    await page.mouse.move(p1.x, p1.y, { steps: 4 });
    await page.mouse.up();
    await sleep(700);
  });
}
const s3 = await readState(page);
note(OUT, `- 断网操作后状态：tick=${s3.tick} creatures=${s3.creats.length} eggs=${s3.eggs}`);
await page.screenshot({ path: join(SHOTS, "p4-01-offline-verbs.png") });
const text1 = await uiText(page);
const ph1 = text1.match(new RegExp(PLACEHOLDER_RE.source, "gi")) ?? [];
note(OUT, `- 操作后占位符扫描：${ph1.length === 0 ? "干净" : [...new Set(ph1)].join(", ")}`);

// ---- 阶段 C：CDP 真离线仿真 10s，再恢复 ---------------------------------------
note(OUT, "\n## 阶段 C：浏览器级离线仿真 10s → 恢复");
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const tBefore = (await readState(page)).tick;
const wall0 = Date.now();
await sleep(10000);
const tMid = (await readState(page)).tick;
note(OUT, `- 离线 10s：tick ${tBefore} -> ${tMid}（推进 ${tMid - tBefore}）`);
await page.screenshot({ path: join(SHOTS, "p4-01-cdp-offline.png") });
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await sleep(5000);
const tAfter = (await readState(page)).tick;
const wall = Date.now() - wall0 - 5000;
const expect = Math.floor(wall / 3000);
note(OUT, `- 恢复后 tick=${tAfter}；墙钟 ${Math.round(wall)}ms 期望 ≈${expect} tick；实际推进 ${tAfter - tMid}（窗口静默计时器被节流属正常波动）`);
await page.screenshot({ path: join(SHOTS, "p4-01-recovered.png") });
const text2 = await uiText(page);
const ph2 = text2.match(new RegExp(PLACEHOLDER_RE.source, "gi")) ?? [];
note(OUT, `- 恢复后占位符扫描：${ph2.length === 0 ? "干净" : [...new Set(ph2)].join(", ")}`);
note(OUT, `- 被拦截的 LLM 请求数：${llmBlocked}`);

// ---- 汇总 ---------------------------------------------------------------------
const realErrors = col.errors.length;
note(OUT, `\n## 汇总`);
note(OUT, `- pageerror/console error：${realErrors === 0 ? "无" : JSON.stringify(col.errors.slice(0, 8), null, 1)}`);
note(OUT, `- console warning：${col.warnings.length === 0 ? "无" : col.warnings.slice(0, 5).map((w) => w.text.slice(0, 120)).join(" | ")}`);
note(OUT, `- requestfailed（应为被拦截的 LLM 调用）：${col.netFail.length}`);

const report = {
  scenario: "net-off",
  llmBlocked,
  realErrors: col.errors,
  warnings: col.warnings,
  netFail: col.netFail,
  ticks: { t0: s0.tick, t1: s1.tick, tMid, tAfter },
  placeholders: [...new Set([...placeholders0, ...ph1, ...ph2])],
};
writeFileSync(join(import.meta.dirname, "logs", "p4-01-net-off.json"), JSON.stringify(report, null, 2));
log("done. blocked LLM calls:", llmBlocked, "| real errors:", realErrors);

await browser.close();
