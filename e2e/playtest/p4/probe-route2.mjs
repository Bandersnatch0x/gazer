// 复现 p4-02 场景：同款 boot + 喂食推 GV，验证 route 拦截是否命中
import { chromium } from "playwright";
import { BASE, sleep, attachCollectors, readState, creaturePoint, boot } from "./lib.mjs";

const isLlmRoute = (u) => {
  try { return new URL(u.toString()).pathname === "/v1/game"; } catch { return false; }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const col = attachCollectors(page, "probe2");
let hits = 0;
await page.route(isLlmRoute, (route) => {
  hits += 1;
  console.log("[route hit] fulfilling 500");
  return route.fulfill({ status: 500, body: "boom" });
});
page.on("response", (r) => {
  if (r.url().includes("/v1/game")) console.log("[resp]", r.status(), r.request().method(), r.url());
});
page.on("requestfailed", (r) => console.log("[reqfail]", r.url(), r.failure()?.errorText));

await boot(page, `${BASE}?debug=1&endpoint=/v1/game&seed=1997`);
for (let i = 0; i < 40; i += 1) {
  const s = await readState(page);
  if (!s || s.stage >= 1) break;
  const alive = s.creats.filter((c) => c.behavior !== "dead");
  if (alive.length === 0) break;
  const target = [...alive].sort((a, b) => a.hunger - b.hunger)[0];
  const p = await creaturePoint(page, target);
  await page.mouse.click(p.x, p.y, { delay: 40 });
  await sleep(650);
}
const s = await readState(page);
console.log("[end] stage:", s?.stage, "gv:", s?.gv, "route hits:", hits);
await browser.close();
