/**
 * P4 共享库：状态读取、console/pageerror 收集、截图、判定工具。
 * 只读游戏（?debug=1 的 window.__gazer() 只读句柄），不修改任何源码。
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SHOTS = join(HERE, "shots");
export const LOGS = join(HERE, "logs");
export const BASE = process.env.GAZER_URL ?? "http://localhost:5199/";

mkdirSync(SHOTS, { recursive: true });
mkdirSync(LOGS, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log("[p4]", ...a);

/** 无害 console 噪音白名单（军规允许忽略的）。 */
const BENIGN = [
  /favicon/i,
  /Failed to load resource.*(404|403)/, // 缺图标类
  /Download the Vue Devtools/i,
  /Autofocus processing/i,
];

export function classify(m) {
  const text = m.text();
  for (const re of BENIGN) if (re.test(text)) return "benign";
  return "real";
}

/**
 * 挂上 console/pageerror/requestfailed 收集器。返回 { errors, warnings, notes, dump }。
 */
export function attachCollectors(page, label) {
  const errors = [];
  const warnings = [];
  const netFail = [];
  const dump = (phase) => {
    const file = join(LOGS, `${label}-${phase}.json`);
    writeFileSync(file, JSON.stringify({ errors, warnings, netFail }, null, 2));
    return file;
  };
  page.on("pageerror", (e) => errors.push({ t: Date.now(), text: String(e) }));
  page.on("console", (m) => {
    const kind = classify(m);
    if (m.type() === "error" && kind === "real") errors.push({ t: Date.now(), text: m.text() });
    if (m.type() === "warning" && kind === "real") warnings.push({ t: Date.now(), text: m.text() });
  });
  page.on("requestfailed", (r) =>
    netFail.push({ t: Date.now(), url: r.url(), err: r.failure()?.errorText ?? "?" }),
  );
  return { errors, warnings, netFail, dump };
}

/** 读取世界状态（debug 只读句柄）。 */
export async function readState(page) {
  return page.evaluate(() => {
    const w = window.__gazer?.();
    if (!w) return null;
    return {
      tick: w.tick,
      gv: w.gv,
      stage: w.stage,
      seed: w.seed,
      eggs: w.eggs.length,
      creats: Object.values(w.creatures).map((c) => ({
        id: c.id,
        tile: { x: c.position.x, y: c.position.y },
        behavior: c.behavior,
        hunger: c.stats.hunger,
        hygiene: c.stats.hygiene,
      })),
    };
  });
}

/** 逻辑坐标(320x180) → 页面 CSS 坐标。 */
export async function cssPoint(page, lp) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("canvas not found");
  return {
    x: box.x + (lp.x / 320) * box.width,
    y: box.y + (lp.y / 180) * box.height,
  };
}

const centerOf = (t) => ({ x: 160 + (t.x - t.y) * 8, y: 30 + (t.x + t.y) * 4 + 4 });

export async function creaturePoint(page, c) {
  return cssPoint(page, centerOf(c.tile));
}

export async function eggPoint(page) {
  const tile = await page.evaluate(() => {
    const w = window.__gazer?.();
    return w && w.eggs.length > 0 ? { x: w.eggs[0].at.x, y: w.eggs[0].at.y } : null;
  });
  if (!tile) return null;
  return cssPoint(page, centerOf(tile));
}

/**
 * 收集页面上所有可见 UI 文本（HUD、对话、面板、按钮），供占位符扫描。
 */
export async function uiText(page) {
  return page.evaluate(() => {
    const parts = [];
    for (const sel of [".gazer-hud", ".gazer-bar", ".gazer-dialogue-mount", ".gazer-panel"]) {
      for (const el of document.querySelectorAll(sel)) {
        if (!el.hidden) parts.push(el.innerText ?? el.textContent ?? "");
      }
    }
    return parts.join("\n---\n");
  });
}

/** 占位符扫描：出现即嫌疑。 */
export const PLACEHOLDER_RE =
  /undefined|NaN|\[object|TODO|FIXME|占位|placeholder|\{\w+\}|lorem/i;

export async function boot(page, url, timeout = 25000) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout });
  await page.waitForFunction(
    () => Object.keys(window.__gazer().creatures).length > 0,
    null,
    { timeout: 30000 },
  );
}

/** 追加一行结果到 markdown 明细文件。 */
export function note(file, text) {
  appendFileSync(file, text + "\n");
}
