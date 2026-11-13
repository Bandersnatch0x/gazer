/**
 * GAZER self-test — drives the real game (vite dev server, real LLM endpoint)
 * through the interaction verbs a human has, via Playwright's real mouse.
 *
 * Verbs exercised (see src/sim/rhythm.ts):
 *   quick tap        -> pending feed (fires after feedGuardMs 300)
 *   double tap       -> gaze into the pupil (panel opens; closed via its button)
 *   hold 650-900ms   -> pet
 *   drag > 8px       -> carry the creature to another tile
 *   right click      -> clean
 *   tap on an egg    -> hatch choice panel (pick the first choice)
 *
 * The LLM loop is observed by counting /v1/game responses and dialogue lines;
 * sim telemetry rides along in the page. Screenshots + a JSON report land in
 * e2e/shots and e2e/selftest-report.json.
 *
 * Usage: node e2e/selftest.mjs  (dev server on :5199 must be running)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, "shots");
const REPORT = join(HERE, "selftest-report.json");
const URL = process.env.GAZER_URL ?? "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";

// Logical scene constants (src/render/scene.ts): 320x180, tile diamond math.
const LW = 320, LH = 180, ORIGIN_X = 160, ORIGIN_Y = 30;
const centerOf = (t) => ({ x: ORIGIN_X + (t.x - t.y) * 8, y: ORIGIN_Y + (t.x + t.y) * 4 + 4 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[selftest]", ...a);

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const errors = [];
const llmCalls = [];
const timeline = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("/v1/game")) llmCalls.push({ t: Date.now(), status: r.status() }); });

log("opening", URL);
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
log("game is up, creatures alive");

const readState = () =>
  page.evaluate(() => {
    const w = window.__gazer();
    return {
      tick: w.tick,
      gv: w.gv,
      stage: w.stage,
      eggs: w.eggs.length,
      creats: Object.values(w.creatures).map((c) => ({
        id: c.id,
        tile: { x: c.position.x, y: c.position.y },
        behavior: c.behavior,
        hunger: c.stats.hunger,
        hygiene: c.stats.hygiene,
        happiness: c.stats.happiness,
        energy: c.stats.energy,
      })),
    };
  });

const cssPoint = async (lp) => {
  const box = await page.locator("canvas").first().boundingBox();
  return { x: box.x + (lp.x / LW) * box.width, y: box.y + (lp.y / LH) * box.height };
};

const centerOfCreature = async (c) => cssPoint(centerOf(c.tile));

// ---- verbs ----------------------------------------------------------------

async function feed(c) {
  const p = await centerOfCreature(c);
  await page.mouse.click(p.x, p.y, { delay: 40 });
  log("feed ->", c.id);
}

async function pet(c) {
  const p = await centerOfCreature(c);
  await page.mouse.down();
  await sleep(750); // past petHoldMs 650, before nameHoldMs 900
  await page.mouse.up();
  log("pet ->", c.id);
}

async function carry(from, to) {
  const a = await centerOfCreature(from);
  const b = await centerOfCreature(to);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  log("carry", from.id, "->", to.id);
}

async function clean(c) {
  const p = await centerOfCreature(c);
  await page.mouse.click(p.x, p.y, { button: "right", delay: 40 });
  log("clean ->", c.id);
}

async function stare(c) {
  const p = await centerOfCreature(c);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  await sleep(120);
  await page.mouse.click(p.x, p.y, { delay: 30 });
  try {
    await page.waitForSelector(".gazer-panel:not([hidden])", { timeout: 3000 });
    await page.screenshot({ path: join(SHOTS, "stare.png") });
    log("stare panel open");
    await page.locator(".gazer-panel > button").first().click();
    await sleep(200);
    log("stare panel closed");
  } catch {
    log("stare panel did not open (double tap not registered?)");
  }
}

async function hatchEggIfAny() {
  const s = await readState();
  if (s.eggs === 0) return false;
  // The debug handle exposes eggs with their tiles; tap the first.
  const eggTile = await page.evaluate(() => {
    const w = window.__gazer();
    return w.eggs.length > 0 ? { x: w.eggs[0].at.x, y: w.eggs[0].at.y } : null;
  });
  if (!eggTile) return false;
  const p = await cssPoint(centerOf(eggTile));
  await page.mouse.click(p.x, p.y, { delay: 40 });
  log("tap egg at", JSON.stringify(eggTile));
  try {
    await page.waitForSelector(".gazer-form", { timeout: 3000 });
    await page.screenshot({ path: join(SHOTS, "hatch-choice.png") });
    await page.locator(".gazer-form button").first().click();
    log("hatch choice made");
    await sleep(300);
    return true;
  } catch {
    log("no hatch choice panel appeared");
    return false;
  }
}

// ---- the loop -------------------------------------------------------------

const snapshot = async (label) => {
  const s = await readState();
  timeline.push({ at: new Date().toISOString(), label, ...s });
  return s;
};

await snapshot("start");
await page.screenshot({ path: join(SHOTS, "01-start.png") });

const CYCLES = 4;
for (let cycle = 0; cycle < CYCLES; cycle += 1) {
  log(`--- cycle ${cycle + 1}/${CYCLES} ---`);
  await hatchEggIfAny();

  let s = await readState();
  if (s.creats.length === 0) { log("no creatures left; stopping"); break; }

  // Feed the hungriest twice.
  const hungriest = [...s.creats].sort((a, b) => a.hunger - b.hunger)[0];
  await feed(hungriest);
  await sleep(1200);
  s = await readState();
  if (s.creats.length > 1) {
    const other = s.creats.find((c) => c.id !== hungriest.id);
    await feed(other);
    await sleep(1200);
  }

  s = await readState();
  if (s.creats.length === 0) break;
  await pet(s.creats[0]);
  await sleep(600);

  s = await readState();
  if (s.creats.length > 1) {
    await carry(s.creats[0], s.creats[1]);
    await sleep(800);
  }

  s = await readState();
  if (s.creats.length === 0) break;
  const dirtiest = [...s.creats].sort((a, b) => a.hygiene - b.hygiene)[0];
  await clean(dirtiest);
  await sleep(800);

  s = await readState();
  if (s.creats.length === 0) break;
  if (cycle === 1) await stare(s.creats[0]);

  await snapshot(`cycle-${cycle + 1}`);
  await page.screenshot({ path: join(SHOTS, `cycle-${cycle + 1}.png`) });
}

const finalState = await snapshot("end");
await page.screenshot({ path: join(SHOTS, "99-end.png") });

const report = {
  url: URL,
  cycles: CYCLES,
  llmCalls: llmCalls.length,
  llmStatuses: llmCalls.map((c) => c.status),
  errors,
  finalState,
  timeline,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));

log("=== summary ===");
log("LLM /v1/game calls:", llmCalls.length, "statuses:", llmCalls.map((c) => c.status).join(",") || "none");
log("final GV:", finalState.gv, "stage:", finalState.stage, "creatures:", finalState.creats.length, "eggs:", finalState.eggs);
log("page errors:", errors.length === 0 ? "none" : errors.slice(0, 5));
log("report:", REPORT);

await browser.close();
