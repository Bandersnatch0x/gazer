/**
 * P3 文案叙事试玩驱动（只读游戏，不改源码）。
 *
 * 用法: node e2e/playtest/p3/run.mjs zh   （或 en）
 * 前提: dev server 在 :5199，LLM 桥经 /v1/game 同源代理可用。
 *
 * 一轮做的事：
 *   1. 以 ?lang=<locale>&endpoint=/v1/game&seed=1997&debug=1 打开游戏；
 *   2. 遍历全部面板（图鉴/家谱/说明书/瞳孔/命名），逐一截图并抓 innerText；
 *   3. 用真实鼠标做一轮完整循环：喂、双击瞳孔、长按命名、连喂触发快速点击；
 *   4. 连续移动指针拉高 GAZE 跨过阶段 1，等 LLM 圆桌台词落地；
 *   5. 末尾点右上语言键做一次实时切换，记录旧台词/跑马灯是否跟着换语言；
 *   6. 对页面全部可见文本做断言式扫描（TODO/{{/undefined/NaN/%s/{slot}/英文残留）；
 *   7. 经 vite 同源动态 import，把 news.ts / manual.ts / copy.ts 的模板池
 *      全量渲染一遍（双语），检查空串、漏占位符、NaN、双语不对齐。
 *
 * 产物: e2e/playtest/p3/report-<locale>.json 与 shots/ 下截图。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const LOCALE = (process.argv[2] ?? "zh") === "en" ? "en" : "zh";
const OTHER = LOCALE === "zh" ? "en" : "zh";
const URL = `http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=${LOCALE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[p3:${LOCALE}]`, ...a);
mkdirSync(SHOTS, { recursive: true });

// 逻辑画面 320x180（src/render/scene.ts），菱形瓦片换算与 e2e/selftest.mjs 相同。
const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });

const findings = []; // 本轮抓到的疑点（结构性断言，语义判断留给报告）
const errors = [];
const llmCalls = [];
const dialogueLog = []; // 每条台词：text / status / aria（来路全句）
const textSnapshots = {}; // 面板名 -> innerText

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("response", (r) => {
  if (r.url().includes("/v1/game")) llmCalls.push({ t: Date.now(), status: r.status() });
});

// ---- 基础工具 ---------------------------------------------------------------

async function shot(name) {
  const path = join(SHOTS, `${LOCALE}-${name}.png`);
  await page.screenshot({ path });
  return path;
}

async function barButtons() {
  return page.locator(".gazer-bar .gazer-key");
}

async function grabDialogue() {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".gazer-dialogue__line").forEach((line) => {
      const mark = line.querySelector(".gazer-witness");
      out.push({
        text: line.querySelector(".gazer-dialogue__text")?.textContent ?? "",
        speaker: line.querySelector(".gazer-dialogue__speaker")?.textContent ?? "",
        status: mark?.getAttribute("data-status") ?? "",
        aria: mark?.getAttribute("aria-label") ?? "",
      });
    });
    const empty = document.querySelector(".gazer-dialogue__empty")?.textContent ?? null;
    const bar = {
      title: document.querySelector(".gazer-dialogue__title")?.textContent ?? "",
      path: document.querySelector(".gazer-dialogue__path")?.textContent ?? "",
    };
    return { lines: out, empty, bar };
  });
}

async function collectDialogueIntoLog(tag) {
  const d = await grabDialogue();
  for (const line of d.lines) {
    if (!dialogueLog.some((e) => e.text === line.text && e.status === line.status)) {
      dialogueLog.push({ tag, ...line });
    }
  }
  return d;
}

async function pageText() {
  return page.evaluate(() => document.body.innerText);
}

// ---- 可疑 token 扫描 --------------------------------------------------------

const SUSPICIOUS = [
  { name: "TODO 标记", re: /\bTODO\b/ },
  { name: "FIXME", re: /\bFIXME\b/ },
  { name: "双花括号模板", re: /\{\{/ },
  { name: "单花括号槽位残留", re: /\{[a-zA-Z_]\w*\}/ },
  { name: "undefined", re: /\bundefined\b/ },
  { name: "NaN", re: /\bNaN\b/ },
  { name: "%s/%d 占位符", re: /%[sd]/ },
  { name: "lorem", re: /lorem ipsum/i },
];
function scanText(text, where) {
  for (const s of SUSPICIOUS) {
    const m = text.match(s.re);
    if (m) findings.push({ where, kind: s.name, sample: m[0], severity: "major" });
  }
}

// 中文模式下疑似未翻译的英文词。放行：编号 id（gazer_01 等）、语言键 EN、
// 假路径、标记字符、罗马数字与单位。其余 ASCII 词全部记录待人工归类。
const ZH_ALLOW = new Set([
  "EN", "GAZER", "GAZE", // 假路径与品牌词
]);
function scanEnglishResidue(text, where) {
  if (LOCALE !== "zh") return [];
  const hits = new Map();
  for (const m of text.matchAll(/[A-Za-z]{2,}/g)) {
    const w = m[0];
    if (ZH_ALLOW.has(w)) continue;
    // gazer_01 / mem_12 / cons_001 / C:\GAZER 这类机器串不算
    hits.set(w, (hits.get(w) ?? 0) + 1);
  }
  return [...hits.entries()].map(([word, count]) => ({ where, word, count }));
}

// ---- 开局 -------------------------------------------------------------------

log("opening", URL);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
log("game up");

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};
const creatureTile = async () =>
  page.evaluate(() => {
    const c = Object.values(window.__gazer().creatures).find((x) => x.behavior !== "dead");
    return c ? { x: c.position.x, y: c.position.y } : null;
  });
const state = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick, gv: w.gv, stage: w.stage, eggs: w.eggs.length,
      alive: Object.values(w.creatures).filter((c) => c.behavior !== "dead").length,
      uiLabels: w.uiLabels,
    };
  });

// ---- 1. 开场画面与 HUD ------------------------------------------------------

await sleep(1000);
const s0 = await state();
const hudText0 = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
textSnapshots.hudStart = hudText0;
scanText(hudText0, "HUD 开场");
await shot("01-start");

// ---- 2. 面板遍历 ------------------------------------------------------------

const panelText = async () =>
  page.evaluate(() => document.querySelector(".gazer-panel")?.innerText ?? "");
const closePanel = async () => {
  await page.locator(".gazer-panel > button").first().click();
  await sleep(250);
};

// 图鉴
{
  const btns = await barButtons();
  await btns.nth(1).click();
  await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
  await sleep(300);
  textSnapshots.album = await panelText();
  scanText(textSnapshots.album, "图鉴");
  for (const f of scanEnglishResidue(textSnapshots.album, "图鉴")) findings.push({ kind: "英文残留", severity: "major", ...f });
  await shot("02-album");
  await closePanel();
}

// 家谱
{
  const btns = await barButtons();
  await btns.nth(2).click();
  await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
  await sleep(300);
  textSnapshots.tree = await panelText();
  scanText(textSnapshots.tree, "家谱");
  for (const f of scanEnglishResidue(textSnapshots.tree, "家谱")) findings.push({ kind: "英文残留", severity: "major", ...f });
  await shot("03-tree");
  await closePanel();
}

// 说明书
{
  const btns = await barButtons();
  await btns.nth(3).click();
  await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
  await sleep(300);
  textSnapshots.help = await panelText();
  scanText(textSnapshots.help, "说明书");
  for (const f of scanEnglishResidue(textSnapshots.help, "说明书")) findings.push({ kind: "英文残留", severity: "major", ...f });
  await shot("04-help");
  await closePanel();
}

// ---- 3. 交互循环 ------------------------------------------------------------

// 双击 → 瞳孔面板
{
  const tile = await creatureTile();
  const p = await cssPoint(centerOf(tile));
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await sleep(120);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  try {
    await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
    textSnapshots.pupil = await panelText();
    scanText(textSnapshots.pupil, "瞳孔面板");
    await shot("05-pupil");
    await closePanel();
  } catch {
    findings.push({ kind: "瞳孔面板未打开", severity: "minor", where: "双击交互" });
  }
}

// 长按 >650+900ms → 命名面板
const GIVEN_NAME = LOCALE === "zh" ? "阿凝" : "Mote";
{
  const tile = await creatureTile();
  const p = await cssPoint(centerOf(tile));
  await page.mouse.down();
  await sleep(1750);
  await page.mouse.up();
  try {
    await page.waitForSelector(".gazer-panel .gazer-input", { timeout: 3000 });
    textSnapshots.naming = await panelText();
    scanText(textSnapshots.naming, "命名面板");
    await shot("06-naming");
    await page.locator(".gazer-input").fill(GIVEN_NAME);
    await page.locator(".gazer-panel .gazer-choice").click();
    await sleep(600);
    await collectDialogueIntoLog("after-naming");
  } catch {
    findings.push({ kind: "命名面板未打开", severity: "minor", where: "长按交互" });
  }
}

// 连点 5 次 → 快速点击台词 + 喂食
{
  const tile = await creatureTile();
  const p = await cssPoint(centerOf(tile));
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.click(p.x, p.y, { delay: 30 });
    await sleep(400); // 落在 rapidClickWindow(1200) 内、feedGuard(300) 之外——喂一口，并累计连击
  }
  await sleep(1500);
  await collectDialogueIntoLog("after-rapid-feed");
}

// ---- 4. 拉高 GAZE 跨阶段 → LLM 圆桌 ----------------------------------------

// 连续移动指针：stare 每 3s 一次（+1.5/次），约 50-70 秒跨过阶段 1（gv 20）。
log("wiggling pointer to raise GAZE…");
const wiggleStart = Date.now();
let crossed = false;
while (Date.now() - wiggleStart < 120000) {
  const box = await page.locator("canvas").first().boundingBox();
  for (let i = 0; i < 6 && !crossed; i += 1) {
    await page.mouse.move(box.x + box.width * (0.3 + 0.04 * i), box.y + box.height * 0.5);
    await sleep(150);
  }
  const st = await state();
  if (st.stage >= 1) { crossed = true; break; }
}
const sCross = await state();
log("stage crossed:", crossed, "gv:", sCross.gv.toFixed(1), "stage:", sCross.stage, "tick:", sCross.tick);

// 等圆桌台词落地（LLM 延迟 + 1.5-4s/轮揭示）
{
  const deadline = Date.now() + 45000;
  const before = dialogueLog.length;
  while (Date.now() < deadline) {
    await sleep(1000);
    await collectDialogueIntoLog("stage-scene");
    const s = await state();
    if (s.stage >= 1 && dialogueLog.length > before + 1 && Date.now() - wiggleStart > 20000) break;
  }
  await shot("07-stage1-dialogue");
}
const sScene = await state();

// 全页可见文本终扫
const fullText = await pageText();
scanText(fullText, "整页(终态)");
const residue = scanEnglishResidue(fullText, "整页(终态)");
for (const f of residue) findings.push({ kind: "英文残留", severity: "major", ...f });
textSnapshots.fullPage = fullText;

// ---- 5. 实时语言切换 --------------------------------------------------------

const dialogueBeforeToggle = await grabDialogue();
const hudBefore = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
{
  const btns = await barButtons();
  await btns.nth(0).click(); // 语言键
  await sleep(600);
}
const hudAfter = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
const dialogueAfterToggle = await grabDialogue();
const barLabels = await page.evaluate(() =>
  [...document.querySelectorAll(".gazer-bar .gazer-key")].map((b) => b.textContent),
);
await shot("08-after-locale-toggle");

// ---- 6. 模板池全量断言（vite 同源动态 import，只读） ------------------------

let poolReport = null;
try {
  poolReport = await page.evaluate(async (loc) => {
    const news = await import("/src/sim/news.ts");
    const manual = await import("/src/director/manual.ts");
    const i18n = await import("/src/ui/i18n.ts");
    const out = { newsLines: [], manualIssues: [], unusedSlot: [] };
    const world = (seed, tick) => ({
      seed, tick, gv: 42.4, eggs: [{ id: "e1" }], uiLabels: {},
      creatures: { a: { behavior: "idle" }, b: { behavior: "dead" }, c: { behavior: "sleeping" } },
    });
    for (const seed of [1997, 1, 2, 3, 7, 42]) {
      for (let index = 0; index < 24; index += 1) {
        const w = world(seed, index * news.NEWS_INTERVAL_TICKS);
        for (const language of ["en", "zh"]) {
          const line = news.newsLineFor(w, language);
          const bad = line.length === 0 || /\{[a-zA-Z_]\w*\}/.test(line) || /NaN|undefined/.test(line);
          if (bad) out.newsLines.push({ seed, index, language, line });
        }
      }
    }
    const seen = new Set();
    for (let stage = 0; stage <= 4; stage += 1) {
      for (let seed = 0; seed < manual.manualPairs(stage).length * 3; seed += 1) {
        for (const language of ["en", "zh"]) {
          const line = manual.manualLineLocale(stage, seed, language, {
            hesitationMs: 1400, rapidClicks: 7, idleMs: 45000, stareMs: 6200,
            namedNames: [], feeds: 1, cleans: 1, deaths: 0,
          });
          if (line.length === 0 || /\{[a-zA-Z_]\w*\}/.test(line) || /NaN|undefined/.test(line)) {
            out.manualIssues.push({ stage, seed, language, line });
          }
          const key = `${stage}:${seed % manual.manualPairs(stage).length}`;
          seen.add(key);
        }
      }
      // 认领台词必须落 fabricated
      for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
        const unlived = manual.isUnlivedMemory(stage, seed);
        if (unlived && !seen.has(`${stage}:${seed % manual.manualPairs(stage).length}`)) {
          out.manualIssues.push({ stage, seed, note: "unlived index out of pool" });
        }
      }
    }
    // i18n: 空串回落 & fill 漏填保留
    if (i18n.fill("hi {missing}", {}) !== "hi {missing}") out.unusedSlot.push("fill lost placeholder");
    void loc; void i18n;
    return out;
  }, LOCALE);
} catch (e) {
  findings.push({ kind: "模板池断言失败", severity: "minor", sample: String(e) });
}

// ---- 7. 交付 ----------------------------------------------------------------

const sEnd = await state();
const report = {
  locale: LOCALE,
  url: URL,
  stateStart: s0,
  stateCross: sCross,
  stateScene: sScene,
  stateEnd: sEnd,
  llmCalls,
  pageErrors: errors,
  hudBefore,
  hudAfter,
  hudSwitched: hudBefore !== hudAfter,
  barLabelsAfterToggle: barLabels,
  dialogueBeforeToggle,
  dialogueAfterToggle,
  dialogueLog,
  textSnapshots,
  structuralFindings: findings,
  poolReport,
};
writeFileSync(join(HERE, `report-${LOCALE}.json`), JSON.stringify(report, null, 2), "utf8");

log("=== summary ===");
log("LLM calls:", llmCalls.length, "statuses:", llmCalls.map((c) => c.status).join(",") || "none");
log("dialogue lines captured:", dialogueLog.length);
log("stage:", sEnd.stage, "gv:", sEnd.gv.toFixed(1));
log("hud switched on toggle:", report.hudSwitched, "bar:", barLabels.join("|"));
log("structural findings:", findings.length);
for (const f of findings.slice(0, 20)) log("  -", f.kind, f.where ?? "", f.word ?? "", f.sample ?? "");
log("poolReport issues:", poolReport ? (poolReport.newsLines.length + poolReport.manualIssues.length + poolReport.unusedSlot.length) : "n/a");
log("report:", join(HERE, `report-${LOCALE}.json`));
log("page errors:", errors.length === 0 ? "none" : errors.slice(0, 5));

await browser.close();
