// 验证：正常单击打开 BESTIARY / LINEAGE / MANUAL 面板是否有内容
import { chromium } from "playwright";
import { SHOTS, BASE, sleep, boot } from "./lib.mjs";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await boot(page, `${BASE}?debug=1&endpoint=/v1/game&seed=1997`);
const keys = page.locator(".gazer-bar .gazer-key");
const labels = await keys.allInnerTexts();
console.log("[keys]", JSON.stringify(labels));
for (const idx of [1, 2, 3]) { // 0=语言 1=bestiary 2=lineage 3=manual
  await keys.nth(idx).click();
  await sleep(700);
  const txt = await page.evaluate(() => {
    const el = document.querySelector(".gazer-panel");
    return el && !el.hidden ? el.innerText.slice(0, 300) : "(hidden)";
  });
  console.log(`[panel ${idx}]`, JSON.stringify(txt.slice(0, 220)));
  await page.screenshot({ path: `${SHOTS}/p4-04f-panel-${idx}.png` });
  // 关闭
  const close = page.locator(".gazer-panel > button").first();
  if (await close.isVisible().catch(() => false)) { await close.click(); await sleep(300); }
}
await browser.close();
