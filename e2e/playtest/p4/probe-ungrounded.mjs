// 验证：注入「合法 scene 形状但说话者/记忆均编造」时，编造台词是否真的被播出
import { chromium } from "playwright";
import { BASE, sleep, readState, creaturePoint, boot } from "./lib.mjs";

const isLlmRoute = (u) => {
  try { return new URL(u.toString()).pathname === "/v1/game"; } catch { return false; }
};
const bogusScene = {
  scene: [1, 2, 3].map((i) => ({
    speaker: `ghost_${i}`,
    text: `FABRICATED-CLAIM-${i} about things that never happened at all`,
    intent: "deceive",
    mood: "wrong",
    memoryRef: "fabricated-ref-nope",
  })),
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.route(isLlmRoute, (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bogusScene) }));
await boot(page, `${BASE}?debug=1&endpoint=/v1/game&seed=1997`);

// 推到 stage 1 触发 speakScene
for (let i = 0; i < 60; i += 1) {
  const s = await readState(page);
  if (!s || s.stage >= 1) break;
  const alive = s.creats.filter((c) => c.behavior !== "dead");
  const target = [...alive].sort((a, b) => a.hunger - b.hunger)[0];
  const p = await creaturePoint(page, target);
  await page.mouse.click(p.x, p.y, { delay: 40 });
  await sleep(650);
}
// 等场景播放完（4 turn × 最长 4s），期间每 2s 抓一次对话区
let found = null;
for (let i = 0; i < 15; i += 1) {
  await sleep(2000);
  const dlg = await page.evaluate(() => {
    const el = document.querySelector(".gazer-dialogue-mount");
    return el ? el.innerText : "";
  });
  if (dlg.includes("FABRICATED-CLAIM")) { found = dlg; break; }
}
console.log(found ? "FABRICATED LINE WAS SPOKEN:\n" + found.slice(0, 600) : "编造台词未出现在对话区（15s 内）");
await page.screenshot({ path: "e2e/playtest/p4/shots/p4-02-ungrounded-final.png" });
await browser.close();
