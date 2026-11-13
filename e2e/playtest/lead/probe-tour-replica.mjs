/** 票 0015 §2 探针:复刻 p2-tour 跨塔前全序列(照料→面板→昼夜四相位→shell 漂移→跨阈)。 */
import { chromium } from "playwright";

const GAME_URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const OUT = "e2e/playtest/lead/shots/";
const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e)));
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(800);

const state = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick, gv: Math.round(w.gv * 100) / 100, stage: w.stage,
      structures: w.structures.map((s) => s.kind),
      creatures: Object.values(w.creatures).map((c) => ({ id: c.id, tile: c.position, behavior: c.behavior })),
    };
  });
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` }).then(() => console.log("shot", name));
const livingCreatures = async () =>
  (await state()).creatures.filter((c) => c.behavior !== "dead");
const creaturePoint = async (c) => {
  const box = await page.locator("canvas").first().boundingBox();
  const lp = centerOf(c.tile);
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};
const tap = async (c) => { const p = await creaturePoint(c); await page.mouse.click(p.x, p.y, { delay: 40 }); };

async function patchWorld(kind, value) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(({ kind, value }) => {
      const w = window.__gazer();
      if (kind === "tick") w.tick = value;
      if (kind === "gv") w.gv = value;
    }, { kind, value });
    await sleep(3400);
    const ok = await page.evaluate(({ kind, value }) => {
      const w = window.__gazer();
      if (kind === "tick") return Math.abs((w.tick % 1200) - (value % 1200)) <= 3;
      if (kind === "gv") return Math.abs(w.gv - value) < 1.5;
      return true;
    }, { kind, value });
    if (ok) return true;
  }
  console.log("!! patch failed", kind, value);
  return false;
}

const ptForHour = (h) => (((h + 12) % 24) * 50);
async function setHour(hour) {
  const pt = ptForHour(hour);
  const current = await page.evaluate(() => window.__gazer().tick);
  const target = (Math.floor(current / 1200) + 1) * 1200 + pt;
  await patchWorld("tick", target);
  await sleep(400);
}

// ---- 复刻巡览序列 ----
let s = await state();
let alive = await livingCreatures();
await tap(alive[0]); await sleep(1000);
s = await state();
alive = await livingCreatures();
if (alive[1]) { await tap(alive[1]); await sleep(1000); }
alive = await livingCreatures();
{
  const p = await creaturePoint(alive[0]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await sleep(760); await page.mouse.up();
  await sleep(700);
}
await page.mouse.click((await creaturePoint(alive[0])).x, (await creaturePoint(alive[0])).y, { button: "right", delay: 40 });
await sleep(700);

// 面板开合(弹簧面板会触发 rebuildScene)
const keys = page.locator(".gazer-bar .gazer-key");
for (const idx of [1, 2, 3]) {
  await keys.nth(idx).click();
  await sleep(350);
  await page.locator(".gazer-panel > button").first().click();
  await sleep(250);
}
// 命名
{
  const c = (await livingCreatures())[0];
  const p = await creaturePoint(c);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await sleep(950); await page.mouse.up();
  try {
    await page.waitForSelector(".gazer-input", { timeout: 3000 });
    await page.locator(".gazer-input").fill("莫娜");
    await page.locator(".gazer-panel .gazer-choice").click();
    await sleep(400);
    console.log("named");
  } catch { console.log("!! naming panel not opened"); }
}

// 昼夜四相位
for (const hour of [12, 18, 0, 6]) {
  await setHour(hour);
  await sleep(400);
}

// shell 漂移揭穿
{
  const current = await page.evaluate(() => window.__gazer().tick);
  const target = Math.ceil((current + 2) / 2400) * 2400 + 300 - 2;
  await patchWorld("tick", target);
  await sleep(4200);
  await shot("rep-10-drift");
}

console.log("pre-cross state:", JSON.stringify(await state()));
// ---- 跨阈(与 crossTo 相同):gv→19.8 + 真喂 + 连拍 ----
await patchWorld("gv", 19.8);
const c = (await livingCreatures())[0];
if (!c) { console.log("!! no living creature"); process.exit(1); }
await tap(c);
for (const [i, wait] of [250, 350, 450, 700, 1200].entries()) {
  await sleep(wait);
  await shot(`rep-11-tower-${i}`);
}
await sleep(6000);
console.log("post-cross state:", JSON.stringify(await state()));
await shot("rep-11-settled");
await browser.close();
