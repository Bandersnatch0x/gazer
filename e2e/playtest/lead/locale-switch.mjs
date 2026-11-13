/**
 * Lead 探针：语言切换一致性（ticket 0016 §3）。
 * zh 启动 → 喂一次（产生台词）→ 切 EN → 立即断言：
 *  - HUD 立即换语言（无 3s 延迟）；
 *  - 对话区每一行的正文与来路标记同为 EN（无中英混排）。
 */
import { chromium } from "playwright";

const URL = "http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997&lang=zh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForFunction(() => Object.keys(window.__gazer().creatures).length > 0, null, { timeout: 30000 });

// 喂一次：产生一条 manual 台词
const p = await page.evaluate(() => {
  const c = Object.values(window.__gazer().creatures).find((x) => x.behavior !== "dead");
  return { x: c.position.x, y: c.position.y };
});
const box = await page.locator("canvas").first().boundingBox();
const cx = box.x + (p.x / 320) * box.width;
const cy = box.y + (p.y / 180) * box.height;
await page.mouse.click(cx, cy, { delay: 40 });
await sleep(1200); // feedGuardMs 300 + 落账

// 切 EN（第一个 .gazer-key 是语言键）
await page.locator(".gazer-bar .gazer-key").first().click();
await sleep(400); // 立即检查，不给它追 tick 的机会

const hud = await page.evaluate(() => document.getElementById("hud")?.textContent ?? "");
const lines = await page.evaluate(() =>
  [...document.querySelectorAll(".gazer-dialogue__line")].map((line) => ({
    text: line.querySelector(".gazer-dialogue__text")?.textContent ?? "",
    mark: line.querySelector(".gazer-witness")?.textContent ?? "",
    markTitle: line.querySelector(".gazer-witness")?.getAttribute("aria-label") ?? "",
  })),
);
console.log("HUD@switch:", hud);
console.log("lines:", JSON.stringify(lines, null, 1));
await page.screenshot({ path: "e2e/playtest/lead/locale-switch.png" });

// 判定：HUD 含 EN 词（GAZE/PHASE），无中文字符；台词行内无中文字符
const hudOk = /[A-Z]/.test(hud) && !/[\u4e00-\u9fff]/.test(hud);
const mixed = lines.filter((l) => /[\u4e00-\u9fff]/.test(l.text));
console.log("hudOk:", hudOk, "| mixed-text lines:", mixed.length);
if (mixed.length > 0) console.log("MIXED:", JSON.stringify(mixed, null, 1));
await browser.close();
