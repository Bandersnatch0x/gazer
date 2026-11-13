/**
 * P1 策划数值试玩驱动 —— 节奏与反馈视角。
 *
 * 一个游戏日 = 1200 tick × 3s = 60 真实分钟。要跑满 3 个游戏日又不能改源码，
 * 用 Playwright 的 fake clock（page.clock）：安装后暂停，游戏内一切时间
 * （setInterval / setTimeout / Date.now）都由 runFor 驱动；渲染 rAF 恢复为
 * 真实帧，画面照常。交互动词用真实鼠标（照抄 e2e/selftest.mjs 的坐标换算）。
 *
 * 节奏模型（模仿 rhythm.ts 注释里的「normal play」）：
 *   - 注视（stare）：光标停 3s 以上再动 → 动态间隔，GV 越高间隔越长；
 *   - 空闲（idle）：32s 一档的被动推进；
 *   - 喂食 / 清洁：按状态触发（hunger<75 / hygiene<55）；
 *   - 抚摸、携带、起名、瞳孔对视、孵蛋：低频节拍。
 *
 * 产物：e2e/playtest/p1/shots/*.png 与 report.json。
 * 用法：node e2e/playtest/p1/drive.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const REPORT = join(HERE, "report.json");
const URL = process.env.GAZER_URL ?? "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";

// 逻辑场景常数（src/render/scene.ts）：320x180，菱形地块。
const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });

const DAY_TICKS = 1200;           // src/sim/clock.ts
const TICK_MS = 3000;             // src/sim/rhythm.ts
const DAY_MS = DAY_TICKS * TICK_MS; // 3_600_000ms fake = 一个游戏日

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[p1]", ...a);

mkdirSync(SHOTS, { recursive: true });

const startedReal = Date.now();
const REAL_BUDGET_MS = 45 * 60 * 1000; // 真实时间预算，超了就收尾
const outOfBudget = () => Date.now() - startedReal > REAL_BUDGET_MS;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
// 必须在 clock.install 之前注册：把真实 rAF 存起来，加载后换回去，渲染才能走真实帧。
await context.addInitScript(() => {
  window.__realRAF = window.requestAnimationFrame.bind(window);
  window.__realCAF = window.cancelAnimationFrame.bind(window);
});
const page = await context.newPage();

const errors = [];
const llmCalls = [];
const timeline = [];
const events = []; // 结构化事件：stage / verb / night / death / egg / panel ...
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
    let kind = "?";
    try { kind = JSON.parse(r.postData() ?? "{}").kind ?? "?"; } catch { /* ignore */ }
    llmCalls.push({ at: Date.now() - startedReal, kind, status: null });
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
log("game is up; pausing fake clock, restoring real rAF");

// 恢复真实 rAF：Pixi 按真实帧渲染，模拟时间只由 runFor 推进。
const rafRestored = await page.evaluate(() => {
  const real = window.__realRAF;
  if (typeof real === "function" && real !== window.requestAnimationFrame) {
    window.requestAnimationFrame = real;
    window.cancelAnimationFrame = window.__realCAF;
    return "init-script";
  }
  try {
    const f = document.createElement("iframe");
    f.style.display = "none";
    document.documentElement.appendChild(f);
    const raf = f.contentWindow.requestAnimationFrame.bind(f.contentWindow);
    f.remove();
    window.requestAnimationFrame = raf;
    return "iframe";
  } catch {
    return "none";
  }
});
log("rAF restore:", rafRestored);
await page.clock.pauseAt(await page.evaluate(() => Date.now()));

// ---------------------------------------------------------------------------
// 状态读取与基础操作
// ---------------------------------------------------------------------------

const readWorld = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    const DAY = 1200;
    const day = Math.floor(w.tick / DAY);
    const phaseTicks = w.tick % DAY;
    const hour = Math.floor((phaseTicks * 24 + 600 * 24) / DAY) % 24;
    return {
      tick: w.tick,
      day, // 0 起
      hour,
      gv: Math.round(w.gv * 100) / 100,
      stage: w.stage,
      eggs: w.eggs.map((e) => ({ id: e.id, at: { x: e.at.x, y: e.at.y } })),
      structures: w.structures.map((s) => s.kind),
      silent: w.silent,
      shellClock: w.uiLabels["shell_clock"] ?? null,
      news: w.uiLabels["news_ticker"] ?? null,
      creats: Object.values(w.creats ?? w.creatures ?? {}).map((c) => ({
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
    panel: document.querySelector(".gazer-panel:not([hidden]) .gazer-form")?.innerText ?? "",
  }));

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};

const pointOf = async (c) => cssPoint(centerOf(c.tile));

const runFor = async (ms) => { await page.clock.runFor(ms); };

/** 时间防护：两次点按之间拉开 >1.2s 假时间，避免被记成 rapid_click。 */
async function tapCreature(c, { hesitationMs = 600 } = {}) {
  const p = await pointOf(c);
  await page.mouse.move(p.x + 6, p.y + 6);
  if (hesitationMs > 0) await runFor(hesitationMs);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await runFor(500); // feedGuard 300ms 内落地
  return c.id;
}

async function petCreature(c) {
  const p = await pointOf(c);
  await page.mouse.move(p.x + 4, p.y);
  await runFor(300);
  await page.mouse.down();
  await runFor(760); // petHoldMs 650 < t < nameHoldMs 900
  await page.mouse.up();
  await runFor(300);
  return c.id;
}

async function carryCreature(a, b) {
  const pa = await pointOf(a);
  const pb = await pointOf(b);
  await page.mouse.move(pa.x + 2, pa.y);
  await runFor(200);
  await page.mouse.down();
  await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 4 });
  await page.mouse.move(pb.x, pb.y, { steps: 4 });
  await page.mouse.up();
  await runFor(300);
  return `${a.id}->${b.id}`;
}

async function cleanCreature(c) {
  const p = await pointOf(c);
  await page.mouse.move(p.x + 5, p.y);
  await runFor(400);
  await page.mouse.click(p.x, p.y, { button: "right", delay: 40 });
  await runFor(500);
  return c.id;
}

/** 注视：停 3s 以上再动，pointermove 里结算 stare。 */
async function stareBeat() {
  const w = await readWorld();
  const alive = w.creats.filter((c) => c.behavior !== "dead");
  if (alive.length === 0) { await runFor(3200); return null; }
  const p = await pointOf(alive[0]);
  await page.mouse.move(p.x, p.y);
  await runFor(3200); // stareMs 3000
  await page.mouse.move(p.x - 3, p.y + 2);
  return alive[0].id;
}

async function doubleTapPupil(c) {
  const p = await pointOf(c);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await runFor(120);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await runFor(600);
  const panel = await page.locator(".gazer-panel:not([hidden]) .gazer-pupil").count();
  const text = await uiText();
  if (panel > 0) {
    const f = await shot("pupil-panel");
    await page.locator(".gazer-panel > button").first().click();
    await runFor(200);
    return { opened: true, text: text.panel, shot: f };
  }
  return { opened: false, text: text.panel, shot: null };
}

async function nameCreature(c, name) {
  const p = await pointOf(c);
  await page.mouse.move(p.x, p.y);
  await runFor(300);
  await page.mouse.down();
  await runFor(1650); // pet 650 + name 900
  await page.mouse.up();
  await runFor(300);
  const input = page.locator(".gazer-input");
  if ((await input.count()) === 0) return { named: false };
  const f1 = await shot("name-panel");
  await input.fill(name);
  await page.locator(".gazer-form .gazer-choice").first().click();
  await runFor(400);
  return { named: true, shot: f1 };
}

async function hatchEggIfAny() {
  const w = await readWorld();
  if (w.eggs.length === 0) return null;
  const egg = w.eggs[0];
  const p = await cssPoint(centerOf(egg.at));
  await page.mouse.click(p.x, p.y, { delay: 40 });
  await runFor(500);
  const choices = page.locator(".gazer-form .gazer-choice");
  const n = await choices.count();
  if (n === 0) return { egg: egg.id, hatched: false };
  const texts = await choices.allInnerTexts();
  const f = await shot("hatch-choice");
  // 温水孵化（第二个），fallback 第一个
  const idx = texts.findIndex((t) => /warm|温水/i.test(t));
  await choices.nth(idx >= 0 ? idx : 0).click();
  await runFor(600);
  return { egg: egg.id, hatched: true, choice: texts[idx >= 0 ? idx : 0], shot: f };
}

async function openHelpOnce() {
  await page.locator(".gazer-key").nth(3).click(); // MANUAL
  await runFor(300);
  const f = await shot("help-manual");
  const text = await uiText();
  await page.locator(".gazer-panel > button").first().click();
  await runFor(200);
  return { shot: f, text: text.panel };
}

// ---------------------------------------------------------------------------
// 事件观测
// ---------------------------------------------------------------------------

let lastState = null;
let lastDialogue = "";
let lastNews = null;

const PARTIAL = join(HERE, "report-partial.json");
function pushEvent(kind, data) {
  const entry = { atFakeMs: lastState ? lastState.tick * TICK_MS : 0, day: lastState?.day, hour: lastState?.hour, kind, ...data };
  events.push(entry);
  // 低频落盘：中途崩溃也不丢过程
  try {
    writeFileSync(PARTIAL, JSON.stringify({ realElapsedMin: Math.round((Date.now() - startedReal) / 60000), events, llmCalls, errors }, null, 2));
  } catch { /* ignore */ }
  log(`event ${kind}`, JSON.stringify(data).slice(0, 180));
}

async function observe(tag) {
  const w = await readWorld();
  const ui = await uiText();
  if (lastState !== null) {
    if (w.stage > lastState.stage) {
      const f = await shot(`stage${w.stage}-cross`);
      pushEvent("stage", { from: lastState.stage, to: w.stage, gv: w.gv, shot: f });
    }
    const deadNow = w.creats.filter((c) => c.behavior === "dead");
    const deadBefore = lastState.creats.filter((c) => c.behavior === "dead");
    for (const d of deadNow) {
      if (!deadBefore.some((x) => x.id === d.id)) {
        const f = await shot(`death-${d.id}`);
        pushEvent("death", { id: d.id, gv: w.gv, shot: f });
      }
    }
    if (w.hour === 0 && lastState.hour === 23) {
      const f = await shot(`midnight-day${w.day + 1}`);
      pushEvent("midnight", { day: w.day + 1, shot: f });
    }
    if (w.eggs.length > lastState.eggs.length) {
      pushEvent("egg-laid", { eggs: w.eggs.length });
    }
    if (w.structures.length > 0 && lastState.structures.length === 0) {
      pushEvent("tower-spawn", {});
    }
    if (w.shellClock && !lastState.shellClock) {
      const f = await shot("shell-clock-confess");
      pushEvent("shell-clock", { value: w.shellClock, shot: f });
    }
    if (ui.dialogue && ui.dialogue !== lastDialogue) {
      pushEvent("dialogue", { text: ui.dialogue.slice(-260) });
      lastDialogue = ui.dialogue;
    }
    if (ui.hud && w.news !== lastNews && w.news) {
      pushEvent("news", { text: w.news });
      lastNews = w.news;
    }
  }
  lastState = w;
  if (tag) {
    timeline.push({ tag, ...w, hud: ui.hud, dialogueTail: ui.dialogue.slice(-200) });
  }
  return w;
}

// ---------------------------------------------------------------------------
// 时间推进引擎：agenda 驱动的假时间推进
// ---------------------------------------------------------------------------

const agenda = {
  nextFeedAt: 0, nextCleanAt: 0, nextStareAt: 5000, nextPetAt: 4 * 60000,
  nextCarryAt: 20 * 60000, nextPupilAt: 8 * 60000, nextEggAt: 30000,
  nextSampleAt: 0, nextNameAt: -1, nextIdleChunk: 0,
};
const flags = { named: false, helped: false, pupilCount: 0 };

const FAKE_NOW = () => lastState ? lastState.tick * TICK_MS : 0;

async function runBeats(quiet) {
  const now = FAKE_NOW();
  let w = lastState;
  const alive = w.creats.filter((c) => c.behavior !== "dead");

  // 状态采样（每假 60s）
  if (now >= agenda.nextSampleAt) {
    agenda.nextSampleAt = now + 60000;
    await observe(`t+${Math.round(now / 60000)}min`);
  }

  if (!quiet && now >= agenda.nextEggAt) {
    agenda.nextEggAt = now + 60000;
    const h = await hatchEggIfAny();
    if (h) pushEvent("hatch", h);
  }

  if (!quiet && now >= agenda.nextFeedAt) {
    agenda.nextFeedAt = now + 45000; // 每 45s 假时间检查一次
    const hungry = alive.slice().sort((a, b) => a.hunger - b.hunger)[0];
    if (hungry && hungry.hunger < 75) {
      await tapCreature(hungry);
      pushEvent("verb-feed", { id: hungry.id, hungerBefore: hungry.hunger });
    }
  }

  if (!quiet && now >= agenda.nextCleanAt) {
    agenda.nextCleanAt = now + 60000;
    const dirty = alive.slice().sort((a, b) => a.hygiene - b.hygiene)[0];
    if (dirty && dirty.hygiene < 55) {
      await cleanCreature(dirty);
      pushEvent("verb-clean", { id: dirty.id, hygieneBefore: dirty.hygiene });
    }
  }

  // 注视：GV 越高越懒（模拟后期长尾），也留出 idle 空窗
  if (now >= agenda.nextStareAt) {
    const gv = w.gv;
    const interval = gv >= 99.5 ? 180000 : gv > 70 ? 90000 : gv > 45 ? 40000 : gv > 20 ? 20000 : 12000;
    agenda.nextStareAt = now + interval;
    await stareBeat();
  }

  if (!quiet && flags.named && now >= agenda.nextPetAt) {
    agenda.nextPetAt = now + 6 * 60000;
    if (alive.length > 0) {
      await petCreature(alive[0]);
      pushEvent("verb-pet", { id: alive[0].id });
    }
  }

  if (!quiet && now >= agenda.nextCarryAt) {
    agenda.nextCarryAt = now + 20 * 60000;
    if (alive.length >= 1) {
      const a = alive[0];
      const to = { x: Math.max(2, Math.min(11, a.tile.x + 2)), y: Math.max(2, Math.min(10, a.tile.y + 2)) };
      const b = { ...a, tile: to };
      await carryCreature(a, b);
      pushEvent("verb-carry", { id: a.id, to });
    }
  }

  if (!quiet && flags.named && now >= agenda.nextPupilAt && alive.length > 0) {
    agenda.nextPupilAt = now + 10 * 60000;
    const r = await doubleTapPupil(alive[0]);
    flags.pupilCount += 1;
    pushEvent("verb-pupil", { ...r, n: flags.pupilCount });
  }

  if (!quiet && agenda.nextNameAt >= 0 && now >= agenda.nextNameAt) {
    agenda.nextNameAt = -1;
    if (alive.length > 0) {
      const r = await nameCreature(alive[0], "MIRROR");
      flags.named = r.named;
      pushEvent("verb-name", { ...r, id: alive[0].id });
    }
  }
}

/** 推进假时间。stepMs 每片大小，realSleep 每片真实等待（<stepMs 即为加速）。 */
async function advance(msFake, { stepMs = 3000, realSleep = 300, quiet = false } = {}) {
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

// ---------------------------------------------------------------------------
// 剧本：新手段（近实时观察）→ 3 个游戏日
// ---------------------------------------------------------------------------

log("=== boot observation ===");
let w = await observe("boot");
await shot("boot-first-view");
pushEvent("boot", { hud: (await uiText()).hud, dialogue: (await uiText()).dialogue });
await runFor(2500); // opening 台词的揭示节拍
w = await observe("boot+2.5s");

// 新手段 0-10 分钟：近实时（step 3000 / real 650 ≈ 2.5x），动词逐个过
log("=== onboarding (first 10 game minutes) ===");
agenda.nextNameAt = FAKE_NOW() + 2 * 60000;
await advance(60000, { stepMs: 3000, realSleep: 650 });
if (!flags.helped) {
  flags.helped = true;
  const h = await openHelpOnce();
  pushEvent("help", h);
}
await advance(9 * 60000, { stepMs: 3000, realSleep: 650 });

log("=== day 1 rest (compressed) ===");
w = await readWorld();
const day1Left = (w.day + 1) * DAY_MS - w.tick * TICK_MS;
await advance(day1Left, { stepMs: 3000, realSleep: 220 });

log("=== day 2 ===");
await advance(DAY_MS, { stepMs: 3600, realSleep: 180 });

log("=== day 3 ===");
await advance(DAY_MS, { stepMs: 3600, realSleep: 150 });

w = await observe("end");
await shot("final-view");

// 统计汇总
const gvCurve = timeline
  .filter((t) => t.tag)
  .map((t) => ({ tag: t.tag, day: t.day, hour: t.hour, gv: t.gv, stage: t.stage }));

const report = {
  url: URL,
  startedReal: new Date(startedReal).toISOString(),
  rafRestore: rafRestored,
  realElapsedMin: Math.round((Date.now() - startedReal) / 60000),
  final: { tick: w.tick, day: w.day, hour: w.hour, gv: w.gv, stage: w.stage, eggs: w.eggs.length, alive: w.creats.filter((c) => c.behavior !== "dead").length },
  llmCalls,
  errors,
  stageEvents: events.filter((e) => e.kind === "stage"),
  verbEvents: events.filter((e) => e.kind.startsWith("verb") || e.kind === "hatch" || e.kind === "help" || e.kind === "boot"),
  events,
  gvCurve,
  timelineSample: timeline.filter((t) => t.tag),
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
log("=== summary ===");
log("final tick/day/gv/stage:", w.tick, w.day + 1, w.gv, w.stage);
log("stages crossed:", report.stageEvents.length, JSON.stringify(report.stageEvents));
log("llm calls:", llmCalls.length, "errors:", errors.length);
log("report:", REPORT);
await browser.close();
