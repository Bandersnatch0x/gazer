import { chromium } from "playwright";

const p = await chromium.launch();
const page = await p.newPage({ viewport: { width: 960, height: 540 } });
await page.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await page.waitForTimeout(3500);

// 1. Everything at (760,90) including pointer-events:none elements.
const all = await page.evaluate(() =>
  [...document.querySelectorAll("*")]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      return r.left <= 760 && r.right >= 760 && r.top <= 90 && r.bottom >= 90;
    })
    .map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 40), bg: cs.backgroundColor, pe: cs.pointerEvents, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    }),
);
console.log("cover (760,90):", JSON.stringify(all, null, 1));

// CRT framing now installs as .gazer-crt-frame (LS-97 shell); the legacy #crt
// overlay was replaced by the ART-CORE-04 shell + fx layer.
const crtHTML = await page.evaluate(() => document.querySelector(".gazer-crt-frame")?.outerHTML.slice(0, 2000));
console.log("crt:", crtHTML);

// 2. Toggle Pixi layers one by one, screenshot each state.
const states = await page.evaluate(() => {
  const L = window.__gazerLayers;
  const results = [];
  const toggle = (obj, key, on) => { obj[key].visible = on; };
  // baseline
  results.push(["all-on"]);
  return results;
});
await page.screenshot({ path: "e2e/p4-all.png" });
await page.evaluate(() => { window.__gazerLayers.overlayLayer.visible = false; });
await page.screenshot({ path: "e2e/p4-no-overlay.png" });
await page.evaluate(() => { window.__gazerLayers.objectLayer.visible = false; });
await page.screenshot({ path: "e2e/p4-no-objects.png" });
await page.evaluate(() => { window.__gazerLayers.tileLayer.visible = false; });
await page.screenshot({ path: "e2e/p4-tiles-only.png" });
await p.close();
