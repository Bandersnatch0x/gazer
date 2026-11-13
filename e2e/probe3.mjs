import { chromium } from "playwright";

const p = await chromium.launch();
const page = await p.newPage({ viewport: { width: 960, height: 540 } });
await page.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await page.waitForTimeout(2500);

const stack = await page.evaluate(() =>
  document.elementsFromPoint(760, 90).map((e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 40), bg: cs.backgroundColor, opacity: cs.opacity, zIndex: cs.zIndex, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  }),
);
console.log("stack:", JSON.stringify(stack, null, 1));

// Any element with a near-black background bigger than 200x100?
const blacks = await page.evaluate(() =>
  [...document.querySelectorAll("*")]
    .map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 40), bg: cs.backgroundColor, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, disp: cs.display };
    })
    .filter((e) => e.rect.w > 200 && e.rect.h > 80 && /rgba?\((0|1|2),/.test(e.bg)),
);
console.log("black bgs:", JSON.stringify(blacks, null, 1));

await page.evaluate(() => { document.getElementById("canvas").style.visibility = "hidden"; });
await page.screenshot({ path: "e2e/probe3-nocanvas.png" });
await page.evaluate(() => { document.getElementById("canvas").style.visibility = ""; });
await page.screenshot({ path: "e2e/probe3-canvas.png" });
await p.close();
