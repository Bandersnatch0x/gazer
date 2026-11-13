import { chromium } from "playwright";

const p = await chromium.launch();
const page = await p.newPage({ viewport: { width: 960, height: 540 } });
await page.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await page.waitForTimeout(2000);

let shotIdx = 0;
for (let i = 0; i < 45; i += 1) {
  const scene = await page.evaluate(() => {
    const g = window.__gazerScene;
    const w = window.__gazer?.();
    return {
      scene: g ? g() : null,
      tick: w ? w.tick : -1,
    };
  });
  const overlay = scene.scene?.overlay ?? [];
  const kids = overlay.map((c) => ({ type: c.type, w: Math.round(c.w), h: Math.round(c.h), kids: c.kids }));
  const interesting = overlay.length !== 3 || overlay.some((c) => c.kids && c.kids.length > 0);
  console.log(`t=${i * 2}s tick=${scene.tick} overlay=${JSON.stringify(kids)}`);
  if (interesting) {
    shotIdx += 1;
    await page.screenshot({ path: `e2e/box-hit-${shotIdx}.png` });
  }
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: "e2e/box-final.png" });
await p.close();
