/**
 * P2 视觉氛围巡览：驱动真实游戏走完 5 幕(季节)、昼夜四相位、shell 演出时刻、
 * 全部面板与对话框，逐一截图 + 量化取色。
 *
 * 只读 src，不改任何源码。时钟/相位推进利用 ?debug=1 的 __gazer() 调试句柄
 * 对 world 做「运行时」补丁（下一拍 step() 以 {...state} 折叠补丁值），配合
 * 真实鼠标点击（喂食跨 GV 阈值触发真·黑塔登场演出，走 onStageChange 全流程）。
 *
 * 用法: node e2e/playtest/p2/p2-tour.mjs  (dev server :5199 已在跑)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const REPORT = join(HERE, "p2-tour-report.json");
const URL = process.env.GAZER_URL ?? "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";

const LW = 320, LH = 180;
const ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[p2]", ...a);

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const errors = [];
const llmCalls = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("/v1/game")) llmCalls.push({ t: Date.now(), status: r.status() }); });

const notes = [];
const note = (text) => { notes.push(text); console.log("[p2-note]", text); };

log("opening", URL);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
log("game up");

// ---- helpers ---------------------------------------------------------------

const shot = (name) => page.screenshot({ path: join(SHOTS, `${name}.png`) }).then(() => log("shot", name));

const state = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick, gv: Math.round(w.gv * 100) / 100, stage: w.stage,
      silent: w.silent, paletteDecay: w.paletteDecay,
      structures: w.structures.map((s) => s.kind),
      eggs: w.eggs.map((e) => ({ id: e.id, at: e.at })),
      creatures: Object.values(w.creatures).map((c) => ({
        id: c.id, tile: c.position, behavior: c.behavior, name: c.name,
        hunger: c.stats.hunger, happiness: c.stats.happiness,
      })),
      uiLabels: { ...w.uiLabels },
    };
  });

/** 运行时补丁：写入后等一个 tick 让 step() 以 {...state} 折叠，再校验。
 *  注意 Playwright evaluate 不捕获 Node 闭包，统一走 {kind, value} 参数。 */
async function patchWorld(desc, kind, value) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(({ kind, value }) => {
      const w = window.__gazer();
      if (kind === "tick") w.tick = value;
      if (kind === "gv") w.gv = value;
    }, { kind, value });
    await sleep(3400); // 至少跨过一次 3s 主循环
    const ok = await page.evaluate(({ kind, value }) => {
      const w = window.__gazer();
      if (kind === "tick") return Math.abs((w.tick % 1200) - (value % 1200)) <= 3;
      if (kind === "gv") return Math.abs(w.gv - value) < 1.5;
      return true;
    }, { kind, value });
    if (ok) { log("patch ok:", desc); return true; }
    log("patch retry:", desc);
  }
  note(`!! 运行时补丁未生效: ${desc}`);
  return false;
}

/** tick 相位 → 世界钟整点。hour 12 → pt 0, 18 → 300, 0 → 600, 6 → 900。 */
const ptForHour = (h) => (((h + 12) % 24) * 50);

async function setHour(hour) {
  const pt = ptForHour(hour);
  const current = await page.evaluate(() => window.__gazer().tick);
  const target = (Math.floor(current / 1200) + 1) * 1200 + pt; // 下一天的该相位
  await patchWorld(`tick→hour${hour}`, "tick", target);
  await sleep(400);
}

/** 逻辑坐标 → CSS 坐标 */
async function cssPoint(lp) {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
}

const livingCreatures = async () =>
  (await state()).creatures.filter((c) => c.behavior !== "dead");

const creaturePoint = async (c) => cssPoint(centerOf(c.tile));

async function tap(c) {
  const p = await creaturePoint(c);
  await page.mouse.click(p.x, p.y, { delay: 40 });
}

/** 打开一个 HUD 面板(按钮文本匹配)并截图;返回面板量测信息。 */
async function openPanelAndShot(buttonText, shotName) {
  const handle = page.locator(".gazer-bar button", { hasText: buttonText }).first();
  await handle.click();
  await sleep(350);
  await shot(shotName);
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector(".gazer-panel");
    if (!panel || panel.hidden) return { open: false };
    const inner = panel.scrollHeight > panel.clientHeight;
    const btn = [...document.querySelectorAll(".gazer-bar button")];
    return {
      open: true,
      client: { w: panel.clientWidth, h: panel.clientHeight },
      scroll: { w: panel.scrollWidth, h: panel.scrollHeight },
      overflowsY: inner,
      text: (panel.innerText ?? "").slice(0, 4000),
    };
  });
  if (metrics.overflowsY) note(`面板 ${shotName} 出现纵向溢出滚动 (scrollH=${metrics.scroll?.h} clientH=${metrics.client?.h})`);
  await page.locator(".gazer-panel > button").first().click(); // 关闭
  await sleep(250);
  return metrics;
}

const dialogueLines = () =>
  page.evaluate(() => document.querySelectorAll(".gazer-dialogue__line").length);

/** 等待对话框出现新行(LLM 圆桌/手动台词)。 */
async function waitForDialogue(before, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = await dialogueLines();
    if (n > before) return n;
    await sleep(500);
  }
  return await dialogueLines();
}

// ---- 采集量化数据的小工具 --------------------------------------------------

async function measureChrome() {
  return page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { sel, color: cs.color, opacity: cs.opacity, font: cs.fontFamily.slice(0, 60), size: cs.fontSize };
    };
    return {
      bodyBg: bg,
      hud: pick("#hud"),
      key: pick(".gazer-key"),
      panelTitle: pick(".gazer-panel__title"),
      choiceNote: pick(".gazer-choice__note"),
      dialogueBar: pick(".gazer-dialogue__bar"),
      speaker: pick(".gazer-dialogue__speaker"),
      witness: pick(".gazer-witness"),
      albumMeta: pick(".gazer-album__meta"),
      crt: (() => {
        // ART-CORE-04 framing shell (legacy #crt overlay removed).
        const el = document.querySelector(".gazer-crt-frame");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { background: cs.backgroundImage.slice(0, 120), z: cs.zIndex, anim: cs.animationName };
      })(),
      canvasCss: (() => {
        const c = document.getElementById("canvas");
        const r = c.getBoundingClientRect();
        return { w: r.width, h: r.height, rendering: getComputedStyle(c).imageRendering };
      })(),
      fonts: ["12px \"MS Gothic\"", "12px Fixedsys", "12px DotGothic16"].map((f) => ({ f, ok: document.fonts.check(f) })),
    };
  });
}

// ---- 开场 ------------------------------------------------------------------

await shot("01-boot-noon");
let s0 = await state();
log("boot state:", JSON.stringify({ tick: s0.tick, gv: s0.gv, stage: s0.stage, silent: s0.silent }));
const chrome0 = await measureChrome();
await shot("02-boot-zoom-chrome");

// ---- 照料动词 + 气泡 -------------------------------------------------------

let s = await state();
const alive = s.creatures.filter((c) => c.behavior !== "dead");
await tap(alive[0]); await sleep(1000);
s = await state();
if (s.creatures.filter((c) => c.behavior !== "dead")[1]) {
  await tap(s.creatures.filter((c) => c.behavior !== "dead")[1]); await sleep(1000);
}
// pet(750ms 按住)
{
  const p = await creaturePoint(alive[0]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await sleep(760); await page.mouse.up();
  await sleep(700);
}
// clean(右键)
await page.mouse.click((await creaturePoint(alive[0])).x, (await creaturePoint(alive[0])).y, { button: "right", delay: 40 });
await sleep(700);
await shot("03-care-verbs");

// ---- 面板(第 0 幕·春) -----------------------------------------------------

const mBestiary0 = await openPanelAndShot("BESTIARY", "04-panel-bestiary-spring");
const mLineage0 = await openPanelAndShot("LINEAGE", "05-panel-lineage-spring");
const mManual0 = await openPanelAndShot("MANUAL", "06-panel-manual");

// pupil panel(双击)
{
  const c = (await livingCreatures())[0];
  const p = await creaturePoint(c);
  await page.mouse.click(p.x, p.y, { delay: 30 }); await sleep(110);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  try {
    await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
    await sleep(250);
    await shot("07-panel-pupil");
    await page.locator(".gazer-panel > button").first().click();
    await sleep(200);
  } catch { note("!! pupil panel 未能打开(双击未识别)"); }
}

// naming panel(长按 950ms)
{
  const c = (await livingCreatures())[0];
  const p = await creaturePoint(c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await sleep(950); await page.mouse.up();
  try {
    await page.waitForSelector(".gazer-input", { timeout: 3000 });
    await shot("08-panel-naming");
    await page.locator(".gazer-input").fill("莫娜");
    await page.locator(".gazer-panel .gazer-choice").click();
    await sleep(400);
    log("named 莫娜");
  } catch { note("!! naming panel 未能打开(长按 950ms 未触发)"); }
}

// ---- 昼夜四相位 ------------------------------------------------------------

const skyPoints = [];
for (const hour of [12, 18, 0, 6]) {
  await setHour(hour);
  const st = await state();
  const expectedSky = await page.evaluate(async (h) => {
    const m = await import("/src/render/palette.ts");
    const w = window.__gazer();
    return m.skyAt(w.tick, w.paletteDecay, ["spring", "summer", "autumn", "winter", "bleak"][w.stage] ?? "spring");
  }, hour).catch(() => null);
  await shot(`09-sky-hour${String(hour).padStart(2, "0")}`);
  skyPoints.push({ hour, tick: st.tick, expectedSky });
  if (hour === 0) note("午夜相位: 注意 HUD 时钟、午夜静音(speech gate)与天空最暗点");
}
log("sky expected:", JSON.stringify(skyPoints));

// shell 演出: 漂移揭穿(driftReveal, tick≡300 mod 2400) + 午夜入场
{
  const current = await page.evaluate(() => window.__gazer().tick);
  const target = Math.ceil((current + 2) / 2400) * 2400 + 300 - 2; // 让主循环自然走到 ≡300 的那一拍
  await patchWorld("tick→drift-298", "tick", target);
  await sleep(4200); // 300 那拍触发 glyph_corrupt 0.2 + ui_shake + shell_clock label
  await shot("10-shell-drift-lurch");
  const st = await state();
  note(`shell_clock 标签出现与否: uiLabels=${JSON.stringify(st.uiLabels)}`);
}

// ---- 第一幕→第二幕: 真·黑塔登场(真实喂食跨 GV20) --------------------------

async function crossTo(threshold, stageTag) {
  const before = await dialogueLines();
  // 把 gv 补到阈值下 0.2,再真喂一口跨过去 → onStageChange 全套演出
  await patchWorld(`gv→${threshold - 0.2}`, "gv", threshold - 0.2);
  const c = (await livingCreatures())[0];
  if (!c) { note("!! 无活体可喂,跨幕中止"); return; }
  await tap(c);
  // 演出连拍: 冻结700ms → 塔长1.5s → glyph noise → palette_shift 1.8s
  for (const [i, wait] of [250, 350, 450, 700, 1200].entries()) {
    await sleep(wait);
    await shot(`1${stageTag}-tower-${i}`);
  }
  const after = await waitForDialogue(before, 45000); // LLM 圆桌(≤30s 超时) + 手动台词
  await shot(`1${stageTag}-dialogue`);
  log(`stage ${stageTag}: dialogue lines ${before} → ${after}; llm calls so far ${llmCalls.length}`);
  await sleep(2500); // palette_shift 落定
  await shot(`1${stageTag}-settled`);
}

await crossTo(20, "1");
await crossTo(40, "2");
await crossTo(60, "3");
await crossTo(80, "4");

// ---- 高幕面板( bleak / 冬 ) 复查 ------------------------------------------

await setHour(12);
await shot("20-bleak-world");
const mBestiary4 = await openPanelAndShot("BESTIARY", "21-panel-bestiary-bleak");
const mLineage4 = await openPanelAndShot("LINEAGE", "22-panel-lineage-bleak");

// ---- 繁殖: 幸福拉满 → 等蛋 → 蛋选择面板 -----------------------------------

await page.evaluate(() => {
  const w = window.__gazer();
  for (const c of Object.values(w.creatures)) {
    if (c.behavior !== "dead") { c.stats.happiness = 100; c.stats.hunger = 90; }
  }
});
let eggSeen = false;
for (let i = 0; i < 24; i += 1) {
  await sleep(2500);
  await page.evaluate(() => {
    const w = window.__gazer();
    for (const c of Object.values(w.creatures)) {
      if (c.behavior !== "dead" && c.behavior !== "mating") c.stats.happiness = 100;
    }
  });
  s = await state();
  if (s.eggs.length > 0) { eggSeen = true; break; }
}
if (eggSeen) {
  await shot("23-egg-on-tile");
  const st = await state();
  const p = await cssPoint(centerOf(st.eggs[0].at));
  await page.mouse.click(p.x, p.y, { delay: 40 });
  try {
    await page.waitForSelector(".gazer-form", { timeout: 3000 });
    await sleep(200);
    await shot("24-panel-hatch-choice");
    await page.locator(".gazer-form .gazer-choice").first().click();
    await sleep(500);
    note("繁殖链路走通: 蛋 → 孵化选择 → 出生(家谱应有 parentLinks)");
  } catch { note("!! 点蛋未弹出孵化选择面板"); }
} else {
  note("!! 60s 内没有蛋(性别/意愿门未通过), 孵化链路未覆盖");
}

// 出生后家谱/图鉴复查
const mLineage5 = await openPanelAndShot("LINEAGE", "25-panel-lineage-generations");
const mBestiary5 = await openPanelAndShot("BESTIARY", "26-panel-bestiary-memories");

// ---- idle 台词(第1幕+ 闲置30s 手动台词) -----------------------------------

{
  const before = await dialogueLines();
  await page.mouse.move(5, 5); // 离开画布避免 stare
  const after = await waitForDialogue(before, 40000);
  if (after > before) await shot("27-dialogue-idle-manual");
  else note("!! 闲置 30s 未触发 manual 台词");
}

// ---- 中文界面复查(本地化切换) ---------------------------------------------

{
  await page.locator(".gazer-bar button").first().click(); // locale toggle
  await sleep(300);
  await shot("28-locale-zh");
  const mManualZh = await openPanelAndShot("说明书", "29-panel-manual-zh");
  await page.locator(".gazer-bar button").first().click(); // 切回
  await sleep(200);
}

// ---- 收尾 ------------------------------------------------------------------

const finalChrome = await measureChrome();
const finalState = await state();
const report = {
  url: URL,
  boot: s0,
  chrome: { atBoot: chrome0, atEnd: finalChrome },
  skyExpected: skyPoints,
  panels: { bestiary0: mBestiary0, lineage0: mLineage0, manual0: mManual0, bestiary4: mBestiary4, lineage4: mLineage4, lineage5: mLineage5, bestiary5: mBestiary5 },
  notes,
  llmCalls,
  errors,
  finalState,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
log("=== done ===");
log("llm:", llmCalls.length, "errors:", errors.length, "notes:", notes.length);
log("report:", REPORT);

await browser.close();
