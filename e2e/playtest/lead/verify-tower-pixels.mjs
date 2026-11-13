/** 票 0015 §2 验证:跨阈后截图,对 tile(12,2) 塔区做像素统计,断言非纯背景色。 */
import { chromium } from "playwright";

const GAME_URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997";
const OUT = "e2e/playtest/lead/shots/tower-verify.png";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("pageerror:", String(e)));
await page.goto(GAME_URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });
await sleep(800);

await page.evaluate(() => { window.__gazer().gv = 41; });
const c = await page.evaluate(() => {
  const w = window.__gazer();
  const alive = Object.values(w.creatures).find((x) => x.behavior !== "dead");
  return alive ? { x: alive.position.x, y: alive.position.y } : null;
});
if (c === null) throw new Error("no living creature");
{
  const box = await page.locator("canvas").first().boundingBox();
  const px = box.x + ((160 + (c.x - c.y) * 8) / 320) * box.width;
  const py = box.y + ((30 + (c.x + c.y) * 4 + 4) / 180) * box.height;
  await page.mouse.click(px, py, { delay: 40 });
}
await sleep(4000); // 跨阈 + 前摇 + 生长 1.5s

const st = await page.evaluate(() => {
  const w = window.__gazer();
  return { gv: +w.gv.toFixed(1), stage: w.stage, structures: w.structures.map((s) => s.kind) };
});
console.log("state:", JSON.stringify(st));
if (!st.structures.includes("black_tower")) throw new Error("structures lacks black_tower");

await page.screenshot({ path: OUT });

// 像素断言:把截图喂回页面 2D canvas,统计塔区(tile(12,2),逻辑 x232..248 y40..88,×3)。
const stat = await page.evaluate(async (shotDataUrl) => {
  const img = new Image();
  img.src = shotDataUrl;
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const SCALE = img.width / 320;
  // 塔身中心竖条(避开塔缘 1px 与眼底):逻辑 x 236..244, y 44..84
  const x0 = Math.round(236 * SCALE), x1 = Math.round(244 * SCALE);
  const y0 = Math.round(44 * SCALE), y1 = Math.round(84 * SCALE);
  const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const counts = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][1] / total;
  return {
    region: { x0, x1, y0, y1 },
    total,
    uniqueColors: counts.size,
    dominantShare: +dominant.toFixed(4),
    topColors: sorted.slice(0, 5),
  };
}, `data:image/png;base64,${(await import("node:fs")).readFileSync(OUT).toString("base64")}`);

console.log("pixel stat:", JSON.stringify(stat, null, 1));
// 断言:塔区不是单一背景色(主色占比 < 0.9),且存在显著的暗色塔身像素。
const darkPixels = stat.topColors
  .filter(([rgb]) => {
    const [r, g, b] = rgb.split(",").map(Number);
    return r < 60 && g < 70 && b < 80; // 塔身 tint #141821 一带的暗色
  })
  .reduce((sum, [, n]) => sum + n, 0);
const darkShare = darkPixels / stat.total;
console.log("dark share:", darkShare.toFixed(4));
if (stat.dominantShare > 0.9) throw new Error(`塔区近似纯背景色 (dominant ${stat.dominantShare})`);
if (darkShare < 0.3) throw new Error(`暗色塔身像素不足 (dark share ${darkShare.toFixed(4)})`);
console.log("PASS: tile(12,2) 塔身肉眼可见(非纯背景,暗色塔身占比", `${(darkShare * 100).toFixed(1)}%)`);
await browser.close();
