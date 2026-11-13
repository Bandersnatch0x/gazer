import { chromium } from "playwright";

const p = await chromium.launch();
const page = await p.newPage({ viewport: { width: 960, height: 540 } });
await page.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const target = document.elementFromPoint(760, 90);
  const chain = [];
  let n = target;
  while (n && n !== document.documentElement && chain.length < 6) {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    chain.push({ tag: n.tagName, id: n.id, cls: String(n.className).slice(0, 80), pos: cs.position, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } });
    n = n.parentElement;
  }
  return chain;
});
console.log("chain at (760,90):", JSON.stringify(info, null, 1));

const fixed = await page.evaluate(() =>
  [...document.querySelectorAll("div,aside,section,canvas")]
    .map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 50), pos: cs.position, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), disp: cs.display };
    })
    .filter((e) => e.w > 0 && (e.pos === "fixed" || e.pos === "absolute"))
);
console.log("positioned elements:", JSON.stringify(fixed, null, 1));
await page.screenshot({ path: "e2e/probe2.png" });
await p.close();
