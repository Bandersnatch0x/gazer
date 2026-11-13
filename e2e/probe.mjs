import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
await p.goto("http://localhost:5199/?debug=1&endpoint=/v1/game&seed=1997");
await p.waitForFunction(() => typeof window.__gazer === "function", null, { timeout: 20000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: "e2e/probe-shot.png" });
await b.close();
