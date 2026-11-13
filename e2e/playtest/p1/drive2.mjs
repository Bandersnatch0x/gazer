/**
 * P1 试玩·第二轮：细心饲养员 —— 验证设计节奏（30-60 分钟周目、GV 曲线、阶段推进）。
 *
 * 相比 drive.mjs 的修正（都来自第一轮踩到的坑）：
 *   - 任何画布动词前后都关闭残留面板（第一轮：未关的蛋面板卡死了下半区交互）；
 *   - 点击前重新读取世界并即时取坐标（生物每 tick 走一格，先读后点会落空）；
 *   - 喂食后校验目标 hunger 是否真的 +45，未命中记 feed-miss；
 *   - 生物脚下有蛋时 tap 会被蛋面板劫持 → 先孵蛋再喂；
 *   - 人口控制：活物 < 6 才孵蛋。
 *
 * 产物：shots2/ 与 report2.json。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots2");
const REPORT = join(HERE, "report2.json");
const PARTIAL = join(HERE, "report2-partial.json");
const URL = process.env.GAZER_URL ?? "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";

const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });
const DAY_MS = 1200 * 3000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[p1b]", ...a);

mkdirSync(SHOTS, { recursive: true });

const startedReal = Date.now();
const REAL_BUDGET_MS = 45 * 60 * 1000;
const outOfBudget = () => Date.now() - startedReal > REAL_BUDGET_MS;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
await context.addInitScript(() => {
  window.__realRAF = window.requestAnimationFrame.bind(window);
  window.__realCAF = window.cancelAnimationFrame.bind(window);
});
const page = await context.newPage();

const errors = [];
const llmCalls = [];
const timeline = [];
const events = [];
let shotSeq = 0;
const shot = async (name) => {
  shotSeq += 1;
  const file = join(SHOTS, `${String(shotSeq).padStart(2, "0")}-${name}.png`);
  try { await page.screenshot({ path: file }); } catch (e) { log("shot fail", name, String(e)); }
  return file;
};

page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("request", (r) => {
  if (r.url().includes("/v1/game")) {
    let body = "?";
    try { body = (r.postData() ?? "").slice(0, 60); } catch { /* ignore */ }
    llmCalls.push({ at: Date.now() - startedReal, body, status: null });
  }
});
page.on("response", (r) => {
  if (r.url().includes("/v1/game")) {
    const last = [...llmCalls].reverse().find((c) => c.status === null);
    if (last) last.status = r.status();
  }
});

log("opening", URL);
await page.clock.install({ time: new Date("2026-11-12T12:00:00") });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { polling: 200, timeout: 30000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { polling: 200, timeout: 30000 });
await page.evaluate(() => {
  if (typeof window.__realRAF === "function" && window.__realRAF !== window.requestAnimationFrame) {
    window.requestAnimationFrame = window.__realRAF;
    window.cancelAnimationFrame = window.__realCAF;
  }
});
await page.clock.pauseAt(await page.evaluate(() => Date.now()));
log("clock paused, driving");

// ---------------------------------------------------------------------------
const readWorld = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    const DAY = 1200;
    return {
      tick: w.tick,
      day: Math.floor(w.tick / DAY),
      hour: Math.floor(((w.tick % DAY) * 24 + 600 * 24) / DAY) % 24,
      gv: Math.round(w.gv * 100) / 100,
      stage: w.stage,
      eggs: w.eggs.map((e) => ({ id: e.id, at: { x: e.at.x, y: e.at.y } })),
      silent: w.silent,
      shellClock: w.uiLabels["shell_clock"] ?? null,
      news: w.uiLabels["news_ticker"] ?? null,
      creats: Object.values(w.creatures).map((c) => ({
        id: c.id,
        tile: { x: c.position.x, y: c.position.y },
        behavior: c.behavior,
        name: c.name,
        hunger: c.stats.hunger,
        hygiene: c.stats.hygiene,
        happiness: c.stats.happiness,
        energy: c.stats.energy,
      })),
    };
  });

const uiText = () =>
  page.evaluate(() => ({
    hud: document.getElementById("hud")?.textContent ?? "",
    dialogue: document.querySelector(".gazer-dialogue-mount")?.innerText ?? "",
    panelVisible: !document.querySelector(".gazer-panel")?.hidden,
  }));

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};

const runFor = (ms) => page.clock.runFor(ms);

/** 关闭任何打开的面板（玩家会去点 x；自动化也照做）。 */
async function closePanels() {
  const ui = await uiText();
  if (ui.panelVisible) {
    await page.locator(".gazer-panel > button").first().click();
    await runFor(150);
    return true;
  }
  return false;
}

/** 即时瞄准点击：读最新世界 → 立刻点，中间不推时间。 */
async function tapTileNow(tile, { button = "left" } = {}) {
  const p = await cssPoint(centerOf(tile));
  await page.mouse.click(p.x, p.y, { button, delay: 30 });
}

let lastState = null;
let lastDialogue = "";
let lastNews = null;
const feedStats = { attempted: 0, landed: 0, missed: 0 };
const cleanStats = { attempted: 0, landed: 0, missed: 0 };

function pushEvent(kind, data) {
  events.push({ day: lastState?.day, hour: lastState?.hour, tick: lastState?.tick, kind, ...data });
  try {
    writeFileSync(PARTIAL, JSON.stringify({ realElapsedMin: Math.round((Date.now() - startedReal) / 60000), events, llmCalls, errors, feedStats, cleanStats }, null, 2));
  } catch { /* ignore */ }
  log(`event ${kind}`, JSON.stringify(data).slice(0, 170));
}

async function observe(tag) {
  const w = await readWorld();
  const ui = await uiText();
  if (lastState !== null) {
    if (w.stage > lastState.stage) {
      const f = await shot(`stage${w.stage}-cross`);
      pushEvent("stage", { from: lastState.stage, to: w.stage, gv: w.gv, hud: ui.hud, shot: f });
    }
    const deadNow = new Set(w.creats.filter((c) => c.behavior === "dead").map((c) => c.id));
    const deadBefore = new Set(lastState.creats.filter((c) => c.behavior === "dead").map((c) => c.id));
    for (const d of deadNow) {
      if (!deadBefore.has(d)) pushEvent("death", { id: d, gv: w.gv });
    }
    for (const b of w.creats) {
      if (b.behavior !== "dead" && !lastState.creats.some((x) => x.id === b.id)) {
        pushEvent("birth", { id: b.id });
      }
    }
    if (w.hour === 0 && lastState.hour === 23) {
      const f = await shot(`midnight-day${w.day + 1}`);
      pushEvent("midnight", { day: w.day + 1, shot: f });
    }
    if (w.eggs.length > lastState.eggs.length) pushEvent("egg-laid", { eggs: w.eggs.length });
    if (w.shellClock && !lastState.shellClock) pushEvent("shell-clock", { value: w.shellClock });
    if (ui.dialogue && ui.dialogue !== lastDialogue) {
      pushEvent("dialogue", { text: ui.dialogue.slice(-240) });
      lastDialogue = ui.dialogue;
    }
    if (w.news && w.news !== lastNews) {
      pushEvent("news", { text: w.news });
      lastNews = w.news;
    }
  }
  lastState = w;
  if (tag) timeline.push({ tag, ...w, hud: ui.hud, dialogueTail: ui.dialogue.slice(-160) });
  return w;
}

/** 喂一只：点之前瞬时取坐标，点完校验 hunger 上升。 */
async function feedOne(id) {
  await closePanels();
  let w = await readWorld();
  let c = w.creats.find((x) => x.id === id);
  if (!c || c.behavior === "dead") return { id, landed: false, reason: "gone" };
  // 脚下有蛋：蛋面板会劫持这一tap → 先孵
  const eggHere = w.eggs.find((e) => e.at.x === c.tile.x && e.at.y === c.tile.y);
  if (eggHere) {
    await tapTileNow(eggHere.at);
    await runFor(500);
    const choices = page.locator(".gazer-form .gazer-choice");
    if ((await choices.count()) > 0) {
      const texts = await choices.allInnerTexts();
      const idx = texts.findIndex((t) => /warm|温水/i.test(t));
      await choices.nth(idx >= 0 ? idx : 0).click();
      await runFor(500);
      pushEvent("hatch-underfoot", { egg: eggHere.id });
    }
    await closePanels();
    w = await readWorld();
    c = w.creats.find((x) => x.id === id);
    if (!c) return { id, landed: false, reason: "gone-after-hatch" };
  }
  feedStats.attempted += 1;
  await tapTileNow(c.tile);
  await runFor(500);
  const w2 = await readWorld();
  const c2 = w2.creats.find((x) => x.id === id);
  const landed = !!c2 && c2.hunger > c.hunger + 20;
  if (landed) feedStats.landed += 1; else feedStats.missed += 1;
  if (!landed && feedStats.missed <= 3) await shot(`feed-miss-${id}`);
  return { id, landed, hungerBefore: Math.round(c.hunger), hungerAfter: c2 ? Math.round(c2.hunger) : null };
}

async function cleanOne(id) {
  await closePanels();
  const w = await readWorld();
  const c = w.creats.find((x) => x.id === id);
  if (!c) return { id, landed: false };
  cleanStats.attempted += 1;
  await tapTileNow(c.tile, { button: "right" });
  await runFor(500);
  const c2 = (await readWorld()).creats.find((x) => x.id === id);
  const landed = !!c2 && c2.hygiene > c.hygiene + 20;
  if (landed) cleanStats.landed += 1; else cleanStats.missed += 1;
  return { id, landed };
}

async function petOne(id) {
  await closePanels();
  const w = await readWorld();
  const c = w.creats.find((x) => x.id === id);
  if (!c) return;
  const p = await cssPoint(centerOf(c.tile));
  await page.mouse.down();
  await runFor(760);
  await page.mouse.up();
  await runFor(300);
  pushEvent("verb-pet", { id });
}

async function carryOne(id) {
  await closePanels();
  const w = await readWorld();
  const c = w.creats.find((x) => x.id === id);
  if (!c) return;
  const a = await cssPoint(centerOf(c.tile));
  const to = { x: Math.max(2, Math.min(11, c.tile.x + 3)), y: Math.max(2, Math.min(10, c.tile.y + 2)) };
  const b = await cssPoint(centerOf(to));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await runFor(300);
  pushEvent("verb-carry", { id, to });
}

async function pupilOne(id) {
  await closePanels();
  const w = await readWorld();
  const c = w.creats.find((x) => x.id === id);
  if (!c) return;
  if (w.eggs.some((e) => e.at.x === c.tile.x && e.at.y === c.tile.y)) return;
  const p = await cssPoint(centerOf(c.tile));
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await runFor(120);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await runFor(600);
  const opened = (await page.locator(".gazer-panel:not([hidden]) .gazer-pupil").count()) > 0;
  const text = opened ? await page.locator(".gazer-form").innerText() : "";
  if (opened) await shot(`pupil-stage${w.stage}`);
  await closePanels();
  pushEvent("verb-pupil", { id, opened, text: text.slice(0, 80) });
}

async function hatchIfAny(maxAlive) {
  const w = await readWorld();
  const alive = w.creats.filter((c) => c.behavior !== "dead").length;
  if (w.eggs.length === 0 || alive >= maxAlive) return;
  await closePanels();
  await tapTileNow(w.eggs[0].at);
  await runFor(500);
  const choices = page.locator(".gazer-form .gazer-choice");
  const n = await choices.count();
  if (n > 0) {
    const texts = await choices.allInnerTexts();
    const f = await shot("hatch-choice");
    const idx = texts.findIndex((t) => /warm|温水/i.test(t));
    await choices.nth(idx >= 0 ? idx : 0).click();
    await runFor(600);
    pushEvent("hatch", { egg: w.eggs[0].id, choice: (texts[idx >= 0 ? idx : 0] ?? "").split("\n")[0], shot: f });
  } else {
    pushEvent("hatch-panel-missing", { egg: w.eggs[0].id });
    await shot("hatch-panel-missing");
  }
  await closePanels();
}

// ---------------------------------------------------------------------------
const agenda = { feed: 0, clean: 0, stare: 6000, pet: 5 * 60000, carry: 22 * 60000, pupil: 9 * 60000, egg: 45000, sample: 0 };
const flags = { named: false, helped: false };

const FAKE_NOW = () => (lastState ? lastState.tick * 3000 : 0);

async function runBeats(quiet) {
  const now = FAKE_NOW();
  const w = lastState;
  const alive = w.creats.filter((c) => c.behavior !== "dead");

  if (now >= agenda.sample) {
    agenda.sample = now + 60000;
    await observe(`t+${Math.round(now / 60000)}min`);
  }

  // 喂食：所有 hunger<70 的都喂（细心饲养员），每拍最多 4 只
  if (now >= agenda.feed) {
    agenda.feed = now + 45000;
    const hungry = alive.filter((c) => c.hunger < 70).sort((a, b) => a.hunger - b.hunger).slice(0, 4);
    for (const c of hungry) {
      if (outOfBudget()) break;
      const r = await feedOne(c.id);
      if (r.landed === false && r.reason !== "gone") pushEvent("feed-miss", r);
    }
  }

  if (now >= agenda.clean) {
    agenda.clean = now + 60000;
    const dirty = alive.filter((c) => c.hygiene < 55).sort((a, b) => a.hygiene - b.hygiene).slice(0, 2);
    for (const c of dirty) {
      const r = await cleanOne(c.id);
      if (r.landed === false) pushEvent("clean-miss", r);
    }
  }

  if (now >= agenda.stare) {
    const gv = w.gv;
    const interval = gv >= 99.5 ? 240000 : gv > 70 ? 120000 : gv > 45 ? 45000 : gv > 20 ? 22000 : 12000;
    agenda.stare = now + interval;
    if (alive.length > 0) {
      const p = await cssPoint(centerOf(alive[0].tile));
      await page.mouse.move(p.x, p.y);
      await runFor(3200);
      await page.mouse.move(p.x - 3, p.y + 2);
    } else {
      await runFor(3200);
    }
  }

  if (now >= agenda.egg) {
    agenda.egg = now + 60000;
    await hatchIfAny(6);
  }

  if (flags.named && now >= agenda.pet) {
    agenda.pet = now + 6 * 60000;
    if (alive.length > 0) await petOne(alive[0].id);
  }

  if (now >= agenda.carry) {
    agenda.carry = now + 22 * 60000;
    if (alive.length > 0) await carryOne(alive[0].id);
  }

  if (flags.named && now >= agenda.pupil) {
    agenda.pupil = now + 9 * 60000;
    if (alive.length > 0) await pupilOne(alive[0].id);
  }
}

async function advance(msFake, { stepMs = 3000, realSleep = 250, quiet = false } = {}) {
  let remaining = msFake;
  while (remaining > 0 && !outOfBudget()) {
    await runBeats(quiet);
    if (outOfBudget()) break;
    const chunk = Math.min(stepMs, remaining);
    await runFor(chunk);
    remaining -= chunk;
    await observe(null);
    if (realSleep > 0) await sleep(realSleep);
  }
}

// 新手段：近实时观察前 10 个游戏分钟
log("=== boot ===");
await observe("boot");
await shot("boot-view");
pushEvent("boot", await uiText());
await runFor(2500);
await observe("boot+2.5s");

log("=== onboarding 10 min (near real-time) ===");
// 前几拍喂最饿的 + 帮 MANUAL 打开一次
await advance(2 * 60000, { stepMs: 3000, realSleep: 650 });
{
  const w = await readWorld();
  const c = w.creats.filter((x) => x.behavior !== "dead").sort((a, b) => a.hunger - b.hunger)[0];
  if (c) {
    // 起名（按住 1650ms 假时间）
    await closePanels();
    const p = await cssPoint(centerOf(c.tile));
    await page.mouse.move(p.x, p.y);
    await runFor(400);
    await page.mouse.down();
    await runFor(1650);
    await page.mouse.up();
    await runFor(300);
    const input = page.locator(".gazer-input");
    if ((await input.count()) > 0) {
      const f = await shot("name-panel");
      await input.fill("MIRROR");
      await page.locator(".gazer-form .gazer-choice").first().click();
      await runFor(400);
      flags.named = true;
      pushEvent("verb-name", { id: c.id, shot: f });
    } else {
      pushEvent("verb-name", { id: c.id, opened: false });
      await closePanels();
    }
  }
}
await advance(8 * 60000, { stepMs: 3000, realSleep: 650 });

log("=== day 1 rest ===");
let w = await readWorld();
await advance((w.day + 1) * DAY_MS - w.tick * 3000, { stepMs: 3000, realSleep: 200 });
log("=== day 2 ===");
await advance(DAY_MS, { stepMs: 3600, realSleep: 170 });
log("=== day 3 ===");
await advance(DAY_MS, { stepMs: 3600, realSleep: 150 });

w = await observe("end");
await shot("final-view");

const gvCurve = timeline.filter((t) => t.tag).map((t) => ({ tag: t.tag, day: t.day, hour: t.hour, gv: t.gv, stage: t.stage, alive: t.creats.filter((c) => c.behavior !== "dead").length }));
const report = {
  url: URL,
  realElapsedMin: Math.round((Date.now() - startedReal) / 60000),
  final: { tick: w.tick, day: w.day, hour: w.hour, gv: w.gv, stage: w.stage, eggs: w.eggs.length, alive: w.creats.filter((c) => c.behavior !== "dead").length },
  feedStats, cleanStats,
  llmCalls,
  errors,
  stageEvents: events.filter((e) => e.kind === "stage"),
  gvCurve,
  events,
  timelineSample: timeline.filter((t) => t.tag),
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
log("=== summary ===");
log("final:", JSON.stringify(report.final));
log("feed:", JSON.stringify(feedStats), "clean:", JSON.stringify(cleanStats));
log("stages:", JSON.stringify(report.stageEvents.map((s) => ({ to: s.to, gv: s.gv, day: s.day, hour: s.hour }))));
log("llm:", llmCalls.length, "errors:", errors.length);
await browser.close();
