/**
 * P4 场景 2 — LLM 故障注入：500 / 超时 / 畸形 JSON / 形状不符 / 合法但无根据剧本。
 * 验证点：回退路径（manual pool）接管、无未捕获错误、可继续玩。
 * 驱动方式：喂食把 GV 推过 20 触发阶段跨越（游戏里唯一的实时 LLM 调用点），
 * 每种故障模式各跑一轮。
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHOTS, BASE, sleep, log, attachCollectors, readState, creaturePoint, boot, note,
} from "./lib.mjs";

const OUT = join(import.meta.dirname, "logs", "p4-02-llm-fault.md");
const GAME_URL = `${BASE}?debug=1&endpoint=/v1/game&seed=1997`;
// 页面 URL 查询串含 "/v1/game"，glob 会误伤导航；用谓词精确匹配端点路径。
const isLlmRoute = (u) => {
  try { return new URL(u.toString()).pathname === "/v1/game"; } catch { return false; }
};
note(OUT, `# P4-02 LLM 故障注入 ${new Date().toISOString()}\nURL: ${GAME_URL}`);

/** 喂食循环直到 stage 跨越或次数用尽；记录 LLM 调用与结果。 */
async function pushToStage(page, targetStage, maxFeeds = 60) {
  const calls = [];
  page.on("response", (r) => {
    if (r.url().includes("/v1/game")) calls.push({ t: Date.now(), status: r.status() });
  });
  for (let i = 0; i < maxFeeds; i += 1) {
    const s = await readState(page);
    if (!s) break;
    if (s.stage >= targetStage) break;
    const alive = s.creats.filter((c) => c.behavior !== "dead");
    if (alive.length === 0) break;
    // 挑最饿的喂
    const target = [...alive].sort((a, b) => a.hunger - b.hunger)[0];
    const p = await creaturePoint(page, target);
    await page.mouse.click(p.x, p.y, { delay: 40 });
    await sleep(700);
  }
  const s = await readState(page);
  return { calls, state: s };
}

async function scenario(label, routeHandler, targetStage = 1) {
  note(OUT, `\n## ${label}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const col = attachCollectors(page, `02-${label}`);
  let llmHits = 0;
  await page.route(isLlmRoute, async (route) => {
    llmHits += 1;
    return routeHandler(route);
  });
  try {
    await boot(page, GAME_URL);
    const before = await readState(page);
    const { calls, state } = await pushToStage(page, targetStage);
    note(OUT, `- 被拦截/注入的 /v1/game 请求数：${llmHits}；观测状态码：${calls.map((c) => c.status).join(",") || "无"}`);
    note(OUT, `- 喂食后 stage=${state?.stage}（起始 ${before.stage}）gv=${state?.gv} tick=${state?.tick} creatures=${state?.creats.length}`);
    await page.screenshot({ path: join(SHOTS, `p4-02-${label}.png`) });
    // 断言：游戏仍活着（tick 在走、生物在动）
    await sleep(4000);
    const later = await readState(page);
    note(OUT, `- 4s 后 tick=${later?.tick}（${later && state && later.tick > state.tick ? "世界仍运转" : "!! 疑似停摆"}）creatures=${later?.creats.length}`);
    // 对话区应有 manual pool 台词（回退路径接管）
    const dialogue = await page.evaluate(() => {
      const el = document.querySelector(".gazer-dialogue-mount");
      return el ? el.innerText.slice(0, 400) : "(empty)";
    });
    note(OUT, `- 对话区摘录：${dialogue.replace(/\n/g, " / ").slice(0, 300) || "(空)"}`);
    note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 6), null, 1)}`);
    note(OUT, `- 真实 warning：${col.warnings.length === 0 ? "无" : col.warnings.slice(0, 4).map((w) => w.text.slice(0, 120)).join(" | ")}`);
  } catch (e) {
    note(OUT, `- 场景异常：${String(e).slice(0, 300)}`);
    await page.screenshot({ path: join(SHOTS, `p4-02-${label}-crash.png`) });
  }
  const report = { scenario: label, llmHits, errors: col.errors, warnings: col.warnings };
  await browser.close();
  return report;
}

const results = [];

// A. 服务器 500
results.push(await scenario("500", (route) => route.fulfill({ status: 500, body: "boom" })));

// B. 超时：12s 才响应（客户端 800ms abort）
results.push(await scenario("timeout", async (route) => {
  await sleep(12000);
  return route.fulfill({ status: 200, contentType: "application/json", body: '{"text":"late"}' });
}));

// C. 畸形 JSON（200 + 非 JSON 体）
results.push(await scenario("malformed-json", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: '{{{not json' })));

// D. 形状不符：{text}（桥协议）而非 roundtable 的 {scene}
results.push(await scenario("shape-text", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: "hi" }) })));

// E. 合法 scene 形状但全部无根据（memoryRef 编造、speaker 未知）
const bogusScene = {
  scene: [1, 2, 3].map((i) => ({
    speaker: `ghost_${i}`,
    text: `completely ungrounded claim number ${i} about things never witnessed at all`,
    intent: "observe",
    mood: "curious",
    memoryRef: "fabricated-ref-nope",
  })),
};
results.push(await scenario("ungrounded-scene", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bogusScene) })));

// F. 预算洪峰：同会话把 GV 推过两级，统计窗口内调用次数（验证预算记账）
note(OUT, "\n## F. 预算记账观测（推向 stage 2）");
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const col = attachCollectors(page, "02-budget");
  const stamps = [];
  await page.route(isLlmRoute, (route) => {
    stamps.push(Date.now());
    return route.fulfill({ status: 500, body: "boom" });
  });
  try {
    await boot(page, GAME_URL);
    const { calls } = await pushToStage(page, 2, 160);
    stamps.push(...calls.map(() => Date.now()));
    const inWindow = stamps.filter((t) => Date.now() - t < 30 * 60 * 1000).length;
    note(OUT, `- 全程 /v1/game 调用：${stamps.length} 次；30 分钟滑窗内：${inWindow} 次`);
    note(OUT, `- 说明：live 路径(game.ts→director/client) 无预算闸(src/bridge/budget.ts 未接线)，仅靠「每次阶段跨越一次调用」隐式限流`);
    note(OUT, `- 未捕获错误：${col.errors.length === 0 ? "无" : JSON.stringify(col.errors.slice(0, 5))}`);
    await page.screenshot({ path: join(SHOTS, "p4-02-budget.png") });
  } catch (e) {
    note(OUT, `- 场景异常：${String(e).slice(0, 300)}`);
  }
  results.push({ scenario: "budget", calls: stamps.length, errors: col.errors });
  await browser.close();
}

writeFileSync(join(import.meta.dirname, "logs", "p4-02-llm-fault.json"), JSON.stringify(results, null, 2));
log("scenario 2 done");
