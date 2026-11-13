/** Lead 探针：WebGL ReadPixels 告警是否与 Playwright 截图相关。 */
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const warnings = [];
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") warnings.push({ t: Date.now(), text: m.text().slice(0, 120) });
});
await page.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await page.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await page.waitForTimeout(8000);
const before = warnings.filter((w) => /ReadPixels|GPU stall/i.test(w.text)).length;
// 纯运行 10s，无截图
await page.waitForTimeout(10000);
const mid = warnings.filter((w) => /ReadPixels|GPU stall/i.test(w.text)).length;
// 截图 3 次
for (let i = 0; i < 3; i += 1) {
  await page.screenshot({ path: `e2e/playtest/lead/readpixels-${i}.png` });
  await page.waitForTimeout(500);
}
const after = warnings.filter((w) => /ReadPixels|GPU stall/i.test(w.text)).length;
console.log(JSON.stringify({ warningsInBoot: before, afterPureRun: mid, afterScreenshots: after, deltaPure: mid - before, deltaShot: after - mid }, null, 1));
await browser.close();
