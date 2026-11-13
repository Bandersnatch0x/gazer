/**
 * 票 0026 — FX DOM/WebAPI 层(ui/shell.ts 侧)。
 *
 * 覆盖票内交付形状 6 的 ui/shell 面:
 * - G3:D-03 越界眼不透明度一律过 0.08 cap(壳面唯一出口);
 * - G5:幽灵光标只渲染,源码零 dispatchEvent/零合成输入事件;
 * - G6:伪时钟仅页面内层、双层并存,钟面取模拟 tick(非系统时间);
 * - D-01 四段演变、D-02/D-02a 书签眼与眼锁、D-03 布点、D-06 采样与镜面律;
 * - W 组:canon key 逐字 diff、回页/拨日/休眠/存档窥视判定与安装流程;
 * - fx → shell/audio 派发路由。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonLine } from "../src/canon";
import {
  ALERT_VEIL_OPACITY,
  COLLECTIVE_ALERT_MS,
  CLOCK_JUMP_THRESHOLD_MS,
  FAVICON_EYE_BLINK,
  FAVICON_EYE_OPEN,
  FAVICON_INK,
  FAVICON_SIZE,
  FAVICON_VOID,
  GHOST_CURSOR_SIZE_PX,
  GHOST_TRAIL_CAPACITY,
  SLEEP_GAP_MS,
  TAB_RETURN_ALERT_MS,
  TAB_RETURN_LINE_MS,
  TITLE_PHASE_ORDER,
  WEBAPI_LINE_KEYS,
  clockJumpDetected,
  createFxShellHost,
  dispatchShellFx,
  faviconBlinkAllowed,
  installWebApiWatchers,
  integrityVerdict,
  outsideEyeLayout,
  outsideEyeOpacity,
  paintFaviconEye,
  pseudoClockFace,
  sampleTrail,
  saveChecksum,
  sleepWakeDetected,
  sleepWakeNudge,
  tabReturnVerdict,
  titleFaceFor,
  type FxShellHost,
  type GhostSample,
  type OutsideEyeSlot,
  type ShellFxTargets,
  type StorageLike,
  type WebApiWatch,
} from "../src/ui/shell";

// ---------------------------------------------------------------------------
// DOM 桩:与 ui-shell.test.ts / ui-terminal.test.ts 同路数。
// ---------------------------------------------------------------------------

class StubNode {
  tag: string;
  className = "";
  private ownText = "";
  readonly attributes = new Map<string, string>();
  readonly children: StubNode[] = [];
  parent: StubNode | null = null;
  readonly listeners = new Map<string, Set<() => void>>();
  readonly style = {
    properties: new Map<string, string>(),
    setProperty: (name: string, value: string): void => {
      this.style.properties.set(name, value);
    },
  };

  constructor(tag: string) {
    this.tag = tag;
  }

  get textContent(): string {
    if (this.children.length === 0) {
      return this.ownText;
    }
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes: StubNode[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
}

class StubDocument {
  readonly head = new StubNode("head");
  readonly body = new StubNode("body");
  title = "";
  visibilityState = "visible";
  readonly created: StubNode[] = [];
  readonly listeners = new Map<string, Set<() => void>>();

  createElement(tag: string): StubNode {
    const node = new StubNode(tag);
    this.created.push(node);
    return node;
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
}

function stubDoc(): StubDocument {
  return new StubDocument();
}

function asStub(node: unknown): StubNode {
  return node as StubNode;
}

function stylesOf(node: unknown): Map<string, string> {
  return asStub(node).style.properties;
}

function makeHost(doc?: StubDocument, canvasRect?: { x: number; y: number; w: number; h: number }): {
  host: FxShellHost;
  doc: StubDocument;
} {
  const d = doc ?? stubDoc();
  const host = createFxShellHost(d as unknown as Document, {
    viewport: () => ({ w: 800, h: 600 }),
    ...(canvasRect !== undefined ? { canvasRect: () => canvasRect } : {}),
  });
  return { host, doc: d };
}

// ---------------------------------------------------------------------------
// D-01 title_mutate
// ---------------------------------------------------------------------------

describe("D-01 title_mutate 四段演变", () => {
  it("四段序:question → claim → clock → name,终态=玩家名", () => {
    expect(TITLE_PHASE_ORDER).toEqual(["question", "claim", "clock", "name"]);
    expect(TITLE_PHASE_ORDER[TITLE_PHASE_ORDER.length - 1]).toBe("name");
  });

  it("面函数:question/?、claim/ours、name/玩家名(无名兜底 ?)", () => {
    expect(titleFaceFor("question", "铃", 0)).toBe("?");
    expect(titleFaceFor("claim", "铃", 0)).toBe("ours");
    expect(titleFaceFor("name", "铃", 0)).toBe("铃");
    expect(titleFaceFor("name", null, 0)).toBe("?");
    expect(titleFaceFor("name", "", 0)).toBe("?");
  });

  it("clock 面取模拟 tick 的钟面(确定性,非系统时间)", () => {
    expect(titleFaceFor("clock", null, 16151)).toBe("23:01");
    expect(titleFaceFor("clock", null, 16151)).toBe(titleFaceFor("clock", null, 16151));
    expect(titleFaceFor("clock", null, 0)).toBe("12:00");
  });

  it("host:setTitleMode 落 document.title,setPlayerName 后 name 面跟随", () => {
    const { host, doc } = makeHost();
    host.tick(16151);
    host.setTitleMode("name");
    expect(doc.title).toBe("?");
    host.setPlayerName("gazer_03");
    expect(doc.title).toBe("gazer_03");
    host.setTitleMode("clock");
    expect(doc.title).toBe("23:01");
    host.destroy();
  });
});

// ---------------------------------------------------------------------------
// D-02 / D-02a favicon_eye 与眼锁
// ---------------------------------------------------------------------------

describe("D-02/D-02a favicon 眼", () => {
  it("掩码 16×16,blink 面与 open 面不同", () => {
    for (const mask of [FAVICON_EYE_OPEN, FAVICON_EYE_BLINK]) {
      expect(mask).toHaveLength(FAVICON_SIZE);
      for (const row of mask) {
        expect(row).toHaveLength(FAVICON_SIZE);
      }
    }
    expect(FAVICON_EYE_OPEN.join("\n")).not.toBe(FAVICON_EYE_BLINK.join("\n"));
  });

  it("纯绘制:底色铺满 + 掩码逐像素落笔", () => {
    const rects: { color: string; x: number; y: number; w: number; h: number }[] = [];
    const face = {
      fillStyle: "",
      fillRect(x: number, y: number, w: number, h: number): void {
        rects.push({ color: face.fillStyle, x, y, w, h });
      },
    };
    paintFaviconEye(face, FAVICON_EYE_OPEN);
    expect(rects[0]).toEqual({ color: FAVICON_VOID, x: 0, y: 0, w: FAVICON_SIZE, h: FAVICON_SIZE });
    const inkPixels = FAVICON_EYE_OPEN.join("").split("").filter((c) => c === "o").length;
    expect(rects).toHaveLength(inkPixels + 1);
    expect(rects[1]?.color).toBe(FAVICON_INK);
  });

  it("D-02a 眼锁:锁期拒绝 blink——它一直在看", () => {
    expect(faviconBlinkAllowed(false, true)).toBe(true);
    expect(faviconBlinkAllowed(true, true)).toBe(false);
    expect(faviconBlinkAllowed(true, false)).toBe(true);
  });

  it("host:favicon link 挂 head;无 2d 画布环境静默降级(不报错)", () => {
    const { host, doc } = makeHost();
    const link = doc.created.find((node) => node.tag === "link");
    expect(link).toBeDefined();
    expect(link?.getAttribute("rel")).toBe("icon");
    host.destroy();
    // destroy 移除 link。
    expect(doc.head.children).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// D-03 canvas_escape_eyes + G3
// ---------------------------------------------------------------------------

describe("D-03 越界眼与 G3 cap", () => {
  const viewport = { w: 800, h: 600 };
  const canvas = { x: 100, y: 100, w: 320, h: 180 };

  it("G3:壳面 opacity 唯一出口,0.9 需求被裁至 0.08", () => {
    expect(outsideEyeOpacity(0.9)).toBe(0.08);
    expect(outsideEyeOpacity(0.06)).toBe(0.06);
    expect(outsideEyeOpacity(0.05)).toBe(0.05);
    expect(outsideEyeOpacity(-1)).toBe(0);
    expect(outsideEyeOpacity(Number.NaN)).toBe(0);
  });

  it("布点确定性:corners/edges/near_canvas,count 1–8 循环取位", () => {
    const corners: readonly OutsideEyeSlot[] = outsideEyeLayout("corners", 4, viewport, canvas);
    expect(corners).toHaveLength(4);
    expect(new Set(corners.map((s) => s.x + "," + s.y)).size).toBe(4);
    const edges: readonly OutsideEyeSlot[] = outsideEyeLayout("edges", 8, viewport, canvas);
    expect(edges).toHaveLength(8);
    expect(edges[0]).toEqual(edges[4]);
    const near: readonly OutsideEyeSlot[] = outsideEyeLayout("near_canvas", 2, viewport, canvas);
    // near_canvas:贴画布外缘。
    expect(near[0]!.x).toBeLessThan(canvas.x);
    expect(near[1]!.x).toBeGreaterThan(canvas.x + canvas.w);
    // 越界钳制:任何点不出视口。
    for (const slot of [...corners, ...edges, ...near]) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x).toBeLessThanOrEqual(viewport.w);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeLessThanOrEqual(viewport.h);
    }
  });

  it("host:越界眼 DOM 落点 opacity 走 cap,data-eye 随眨眼时钟同帧", () => {
    const { host } = makeHost(undefined, canvas);
    host.showOutsideEyes({ count: 3, pos: "edges", follow: true, opacity: 0.5 });
    const eyesLayer = asStub(host.root).children[0]!;
    expect(eyesLayer.children).toHaveLength(3);
    const eye = eyesLayer.children[0]!;
    // G3:0.5 → 0.08。
    expect(eye.style.properties.get("opacity")).toBe("0.08");
    expect(eye.style.properties.get("pointer-events")).toBe("none");
    // G4:blink tick 上同帧闭眼。
    host.tick(0); // tick 0 落在眨眼闭窗(blinkClosedAt(0) === true)
    expect(eye.getAttribute("data-eye")).toBe("closed");
    // applyEyes 重建元素:同帧后重新取当前落点。
    host.tick(5);
    const eyeNow = eyesLayer.children[0]!;
    expect(eyeNow.getAttribute("data-eye")).toBe("open");
    host.clearOutsideEyes();
    expect(eyesLayer.children).toHaveLength(0);
    host.destroy();
  });
});

// ---------------------------------------------------------------------------
// D-05 伪时钟 + G6 双层并存
// ---------------------------------------------------------------------------

describe("D-05 伪时钟(G6)", () => {
  it("钟面 = 个体名 + 模拟 tick 钟面,纯函数确定性", () => {
    expect(pseudoClockFace(16151, "gazer_03")).toBe("gazer_03 23:01");
    expect(pseudoClockFace(0, "01")).toBe("01 12:00");
    expect(pseudoClockFace(16151, "gazer_03")).toBe(pseudoClockFace(16151, "gazer_03"));
  });

  it("host:页面内伪时钟层挂 fx 根内,带 page-clock 面;真时钟面不被触碰", () => {
    const { host } = makeHost();
    host.showPseudoClock("gazer_03");
    host.tick(16151);
    const clockLayer = asStub(host.root).children[1]!;
    expect(clockLayer.getAttribute("data-face")).toBe("page-clock");
    expect(clockLayer.textContent).toBe("gazer_03 23:01");
    expect(clockLayer.style.properties.get("display")).toBe("block");
    host.hidePseudoClock();
    expect(clockLayer.style.properties.get("display")).toBe("none");
    expect(clockLayer.textContent).toBe("");
    host.destroy();
  });
});

// ---------------------------------------------------------------------------
// D-06 幽灵光标 + G5 无合成输入 + G7 镜面律
// ---------------------------------------------------------------------------

describe("D-06 幽灵光标(G5/G7)", () => {
  const trail = [
    { x: 10, y: 10, t: 100 },
    { x: 20, y: 12, t: 200 },
    { x: 30, y: 14, t: 300 },
    { x: 40, y: 16, t: 400 },
  ];

  it("采样确定性:同参数同结果,fidelity 0.6 隔点稀疏化", () => {
    const full: GhostSample | null = sampleTrail(trail, 500, 1000, 1);
    expect(full).toEqual({ x: 40, y: 16 });
    const sparse: GhostSample | null = sampleTrail(trail, 500, 1000, 0.6);
    // step = 2:保留第 0、2 点 → 最后为 (30,14)。
    expect(sparse).toEqual({ x: 30, y: 14 });
    expect(sampleTrail([], 500, 1000, 1)).toBeNull();
    // 窗口裁剪:t > atMs 的点不进窗口。
    expect(sampleTrail(trail, 250, 1000, 1)).toEqual({ x: 20, y: 12 });
  });

  it("G5 结构保证:shell.ts 源码零 dispatchEvent、零合成输入事件构造", () => {
    const source = readFileSync(join(process.cwd(), "src", "ui", "shell.ts"), "utf8");
    expect(source).not.toMatch(/dispatchEvent/);
    expect(source).not.toMatch(/new PointerEvent/);
    expect(source).not.toMatch(/new MouseEvent/);
    expect(source).not.toMatch(/new KeyboardEvent/);
    expect(source).not.toMatch(/new TouchEvent/);
  });

  it("G5:host 根层 aria-hidden 且幽灵层 pointer-events none——只渲染,不接输入", () => {
    const { host } = makeHost();
    expect(asStub(host.root).getAttribute("aria-hidden")).toBe("true");
    expect(stylesOf(host.root).get("pointer-events")).toBe("none");
    host.startCursorMimic({ windowMs: 30000, fidelity: 1 });
    const ghostLayer = asStub(host.root).children[2]!;
    expect(ghostLayer.getAttribute("data-face")).toBe("ghost-cursor");
    host.stopCursorMimic();
    host.destroy();
  });

  it("G7 镜面律:玩家停输 300ms 内冻结,越窗后续播(复用终端 MIRROR_RESUME_MS)", () => {
    const { host } = makeHost();
    host.startCursorMimic({ windowMs: 30000, fidelity: 1 });
    for (const p of trail) {
      host.recordPointer(p.x, p.y, p.t);
    }
    const ghostLayer = asStub(host.root).children[2]!;
    host.playerTyped(500);
    // 停输 300ms 内(500–800):冻结在停输时刻的采样点。
    host.frame(799);
    expect(ghostLayer.style.properties.get("left")).toBe(String(40 - GHOST_CURSOR_SIZE_PX / 2) + "px");
    // 越窗(≥300ms):跟随新采样。
    host.frame(801);
    expect(ghostLayer.style.properties.get("left")).toBe(String(40 - GHOST_CURSOR_SIZE_PX / 2) + "px");
    host.recordPointer(60, 18, 850);
    host.frame(900);
    expect(ghostLayer.style.properties.get("left")).toBe(String(60 - GHOST_CURSOR_SIZE_PX / 2) + "px");
    host.stopCursorMimic();
    host.destroy();
  });

  it("轨迹容量有界:超容量丢最旧", () => {
    const { host } = makeHost();
    for (let i = 0; i < GHOST_TRAIL_CAPACITY + 10; i += 1) {
      host.recordPointer(i, i, i);
    }
    host.startCursorMimic({ windowMs: 1_000_000, fidelity: 1 });
    host.frame(GHOST_TRAIL_CAPACITY + 20);
    const ghostLayer = asStub(host.root).children[2]!;
    // 最后记录点 (609,609) 仍在窗口内,幽灵落在那里。
    expect(ghostLayer.style.properties.get("left")).toBe(
      String(GHOST_TRAIL_CAPACITY + 9 - GHOST_CURSOR_SIZE_PX / 2) + "px",
    );
    host.stopCursorMimic();
    host.destroy();
  });
});

// ---------------------------------------------------------------------------
// 回页集体 ALERT 面
// ---------------------------------------------------------------------------

describe("集体 ALERT 面", () => {
  it("正典时长 0.8s;暗纱只在窗口内点亮", () => {
    expect(COLLECTIVE_ALERT_MS).toBe(800);
    const { host } = makeHost();
    const veil = asStub(host.root).children[3]!;
    host.alert(800, 1000);
    host.frame(1500);
    expect(veil.style.properties.get("opacity")).toBe(ALERT_VEIL_OPACITY);
    host.frame(2000);
    expect(veil.style.properties.get("opacity")).toBe("0");
    host.destroy();
  });
});

// ---------------------------------------------------------------------------
// W 组:canon key 逐字 diff + 判定函数
// ---------------------------------------------------------------------------

describe("W 组 canon 行(逐字 diff)", () => {
  it("key 与 src/canon/registry.ts 逐字一致", () => {
    expect(WEBAPI_LINE_KEYS.tab_return).toBe("webapi.gone_counted");
    expect(WEBAPI_LINE_KEYS.save_integrity).toBe("webapi.looked_inside");
    expect(WEBAPI_LINE_KEYS.clock_jump).toBe("webapi.moved_sun");
    expect(WEBAPI_LINE_KEYS.sleep_wake).toBe("webapi.slept_counting");
  });

  it("canon 文案与 FX-LIB-MASTER §1 W-01–W-04 逐字 diff = 0", () => {
    expect(canonLine(WEBAPI_LINE_KEYS.tab_return)).toBe("> you were gone. we counted.");
    expect(canonLine(WEBAPI_LINE_KEYS.save_integrity)).toBe("> you looked inside us.");
    expect(canonLine(WEBAPI_LINE_KEYS.clock_jump)).toBe("> you moved the sun.");
    expect(canonLine(WEBAPI_LINE_KEYS.sleep_wake)).toBe("> you slept. we kept counting.");
  });
});

describe("W-01 tab_return_detect", () => {
  it("阈值:>60s 集体 ALERT;>5min 终端行", () => {
    expect(TAB_RETURN_ALERT_MS).toBe(60_000);
    expect(TAB_RETURN_LINE_MS).toBe(300_000);
    expect(tabReturnVerdict(59_999)).toBe("none");
    expect(tabReturnVerdict(60_000)).toBe("alert");
    expect(tabReturnVerdict(299_999)).toBe("alert");
    expect(tabReturnVerdict(300_000)).toBe("line");
    expect(tabReturnVerdict(Number.NaN)).toBe("none");
  });

  it("安装面:离页 61s 回页 → 集体 ALERT;离页 5min 回页 → ALERT + 终端行", () => {
    const alerts: number[] = [];
    const lines: string[] = [];
    const doc = stubDoc();
    const watchers = installWebApiWatchers(doc as unknown as Document, {
      onAlert: (ms) => alerts.push(ms),
      onCanonLine: (key) => lines.push(key),
    });
    watchers.arm("tab_return", true);
    watchers.onVisibility(true, 1_000, 1_000);
    watchers.onVisibility(false, 62_000, 62_000);
    expect(alerts).toEqual([800]);
    expect(lines).toEqual([]);
    // 再次离页 5min 后回页:away = 362_001 − 62_001 = 300_000 → line。
    watchers.onVisibility(true, 62_001, 62_001);
    watchers.onVisibility(false, 362_001, 362_001);
    expect(alerts).toEqual([800, 800]);
    expect(lines).toEqual(["webapi.gone_counted"]);
    watchers.dispose();
  });

  it("未 arm 的探测器不触发;dispose 摘除 visibilitychange 监听", () => {
    const alerts: number[] = [];
    const doc = stubDoc();
    const watchers = installWebApiWatchers(doc as unknown as Document, {
      onAlert: (ms) => alerts.push(ms),
      onCanonLine: () => {},
    });
    watchers.onVisibility(true, 0, 0);
    watchers.onVisibility(false, 400_000, 400_000);
    expect(alerts).toEqual([]);
    expect(doc.listeners.get("visibilitychange")?.size).toBe(1);
    watchers.dispose();
    expect(doc.listeners.get("visibilitychange")?.size).toBe(0);
  });
});

describe("W-03 clock_jump_detect", () => {
  it("判定:事件时间戳差与单调钟差分叉 ≥ 1min 视为拨动", () => {
    expect(CLOCK_JUMP_THRESHOLD_MS).toBe(60_000);
    expect(clockJumpDetected(120_000, 60_000)).toBe(true);
    expect(clockJumpDetected(60_000, 120_000)).toBe(true);
    expect(clockJumpDetected(120_000, 120_000)).toBe(false);
    expect(clockJumpDetected(120_001, 60_000)).toBe(true);
    expect(clockJumpDetected(120_000, 60_001)).toBe(false);
    expect(clockJumpDetected(Number.NaN, 0)).toBe(false);
  });

  it("安装面:回页时戳分叉 → moved_sun,每会话只报一次", () => {
    const lines: string[] = [];
    const doc = stubDoc();
    const watchers = installWebApiWatchers(doc as unknown as Document, {
      onAlert: () => {},
      onCanonLine: (key) => lines.push(key),
    });
    watchers.arm("clock_jump", true);
    // 基线:离页、回页,钟面一致。
    watchers.onVisibility(true, 1_000, 1_000);
    watchers.onVisibility(false, 2_000, 2_000);
    expect(lines).toEqual([]);
    // 再回页:真实钟走了 10min,单调钟只走 1min → 拨日。
    watchers.onVisibility(true, 3_000, 3_000);
    watchers.onVisibility(false, 613_000, 63_000);
    watchers.onVisibility(true, 614_000, 64_000);
    expect(lines).toEqual(["webapi.moved_sun"]);
    // 再次拨动不重复报(每会话一次)。
    watchers.onVisibility(false, 1_225_000, 125_000);
    watchers.onVisibility(true, 1_836_000, 186_000);
    expect(lines).toEqual(["webapi.moved_sun"]);
    watchers.dispose();
  });
});

describe("W-04 sleep_wake_detect", () => {
  it("判定:可见状态下帧间断档 > 1min 视为睡过;隐藏页不算", () => {
    expect(SLEEP_GAP_MS).toBe(60_000);
    expect(sleepWakeDetected(61_000, true)).toBe(true);
    expect(sleepWakeDetected(61_000, false)).toBe(false);
    expect(sleepWakeDetected(60_000, true)).toBe(false);
    expect(sleepWakeDetected(Number.NaN, true)).toBe(false);
  });

  it("微移纯面:确定性 ±1 tile", () => {
    expect(sleepWakeNudge({ x: 4, y: 5 }, 0)).toEqual({ x: 5, y: 4 });
    expect(sleepWakeNudge({ x: 4, y: 5 }, 1)).toEqual({ x: 3, y: 4 });
    expect(sleepWakeNudge({ x: 4, y: 5 }, 2)).toEqual({ x: 5, y: 6 });
    expect(sleepWakeNudge({ x: 4, y: 5 }, 3)).toEqual({ x: 3, y: 6 });
    expect(sleepWakeNudge({ x: 4, y: 5 }, 0)).toEqual(sleepWakeNudge({ x: 4, y: 5 }, 0));
  });

  it("安装面:接线帧断档 → slept_counting 行 + 集体 ALERT + 唤醒回调", () => {
    const lines: string[] = [];
    const alerts: number[] = [];
    let wakes = 0;
    const doc = stubDoc();
    const watchers = installWebApiWatchers(doc as unknown as Document, {
      onAlert: (ms) => alerts.push(ms),
      onCanonLine: (key) => lines.push(key),
      onSleepWake: () => {
        wakes += 1;
      },
    });
    watchers.arm("sleep_wake", true);
    watchers.poll(1_000, 1_000, true);
    // 正常帧节奏:不触发。
    watchers.poll(2_000, 2_000, true);
    expect(lines).toEqual([]);
    // 设备睡过:帧间 90s 断档。
    watchers.poll(92_000, 92_000, true);
    expect(lines).toEqual(["webapi.slept_counting"]);
    expect(alerts).toEqual([800]);
    expect(wakes).toBe(1);
    watchers.dispose();
  });
});

describe("W-02 save_integrity_watch", () => {
  function memoryStorage(): StorageLike & { values: Map<string, string> } {
    const values = new Map<string, string>();
    return {
      values,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
      get length(): number {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
    };
  }

  it("校验和确定性:key 集或任一值变脸即 tampered", () => {
    const store = memoryStorage();
    store.values.set("gazer:save", "world-state-v1");
    const before = saveChecksum(store);
    expect(saveChecksum(store)).toBe(before);
    store.values.set("gazer:save", "tampered-by-hand");
    expect(integrityVerdict(before, saveChecksum(store))).toBe("tampered");
    store.values.delete("gazer:save");
    expect(integrityVerdict(before, saveChecksum(store))).toBe("tampered");
    // 旗标 key 本身不计入校验和。
    store.values.set("gazer:save", "world-state-v1");
    store.values.set(WEBAPI_LINE_KEYS.save_integrity, "flag");
    const base = saveChecksum(store);
    store.values.set("gazer:watch/integrity", "1");
    expect(saveChecksum(store)).toBe(base);
  });

  it("安装面:外部篡改只记旗标;下次开场认账后清旗", () => {
    const store = memoryStorage();
    store.values.set("gazer:save", "world-state-v1");
    const firstLines: string[] = [];
    const doc1 = stubDoc();
    const w1 = installWebApiWatchers(doc1 as unknown as Document, {
      onAlert: () => {},
      onCanonLine: (key) => firstLines.push(key),
    }, store);
    w1.arm("save_integrity", true);
    w1.poll(1_000, 1_000, true);
    expect(firstLines).toEqual([]);
    // 外部改存档 → 只落旗标,本次会话不说话。
    store.values.set("gazer:save", "tampered-by-hand");
    w1.poll(2_000, 2_000, true);
    expect(firstLines).toEqual([]);
    expect(store.values.get("gazer:watch/integrity")).toBe("1");
    w1.dispose();
    // 下次开场:旗标在 → looked_inside 行,旗标清。
    const secondLines: string[] = [];
    const doc2 = stubDoc();
    const w2 = installWebApiWatchers(doc2 as unknown as Document, {
      onAlert: () => {},
      onCanonLine: (key) => secondLines.push(key),
    }, store);
    expect(secondLines).toEqual(["webapi.looked_inside"]);
    expect(store.values.get("gazer:watch/integrity")).toBeUndefined();
    w2.dispose();
  });

  it("storage 缺失或拒绝:静默降级,不报错", () => {
    const lines: string[] = [];
    const doc = stubDoc();
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      length: 0,
      key: () => null,
    };
    expect(() => {
      const w = installWebApiWatchers(doc as unknown as Document, {
        onAlert: () => {},
        onCanonLine: (key) => lines.push(key),
      }, throwing);
      w.arm("save_integrity", true);
      w.poll(0, 0, true);
      w.dispose();
    }).not.toThrow();
    const w2 = installWebApiWatchers(doc as unknown as Document, {
      onAlert: () => {},
      onCanonLine: (key) => lines.push(key),
    }, null);
    w2.poll(0, 0, true);
    w2.dispose();
  });
});

// ---------------------------------------------------------------------------
// fx → shell/audio 派发路由
// ---------------------------------------------------------------------------

function makeTargets() {
  const calls: string[] = [];
  const terminal = {
    applyErosion: (step: number) => {
      calls.push("erosion:" + step);
      return true;
    },
    whisperScroll: (delta: number) => {
      calls.push("scroll:" + delta);
      return delta;
    },
  };
  const shell = {
    setTitleMode: (mode: string) => calls.push("title:" + mode),
    setFaviconMode: (mode: string) => calls.push("favicon:" + mode),
    showOutsideEyes: (p: { count: number; pos: string; follow: boolean; opacity: number }) =>
      calls.push("eyes:" + p.count + ":" + p.pos + ":" + p.opacity),
    showPseudoClock: (t: string) => calls.push("clock:" + t),
    startCursorMimic: (o: { windowMs: number; fidelity: number }) =>
      calls.push("mimic:" + o.windowMs + ":" + o.fidelity),
  };
  const audio = {
    removeTrack: (idx: number, dur: number) => calls.push("track_remove:" + idx + ":" + dur),
    roomTone: (g: number) => calls.push("room_tone:" + g),
    duckAmbient: (db: number, ramp: number) => calls.push("duck:" + db + ":" + ramp),
    setLowpass: (active: boolean, fc?: number) => calls.push("lowpass:" + String(active) + ":" + String(fc)),
    heartbeat: () => calls.push("heartbeat"),
    whisperBed: (v: number) => calls.push("bed:" + v),
  };
  const watches: WebApiWatch[] = [];
  const targets: ShellFxTargets = {
    terminal: terminal as unknown as ShellFxTargets["terminal"],
    shell: shell as unknown as ShellFxTargets["shell"],
    audio: audio as unknown as ShellFxTargets["audio"],
    watch: (w: WebApiWatch) => watches.push(w),
  };
  return { calls, watches, targets };
}

describe("dispatchShellFx 路由", () => {
  it("D 组:D-01/D-02/D-03/D-04/D-05/D-06/D-07 各落其位", () => {
    const { calls, targets } = makeTargets();
    dispatchShellFx({ kind: "title_mutate", mode: "name" }, targets);
    dispatchShellFx({ kind: "favicon_eye", mode: "blink" }, targets);
    dispatchShellFx(
      { kind: "canvas_escape_eyes", count: 2, pos: "edges", follow: true, opacity: 0.06 },
      targets,
    );
    dispatchShellFx({ kind: "dom_erosion", step: 1 }, targets);
    dispatchShellFx({ kind: "os_status_clock", target: "gazer_03" }, targets);
    dispatchShellFx({ kind: "cursor_mimic", windowMs: 30000, fidelity: 0.8 }, targets);
    dispatchShellFx({ kind: "scroll_whisper", delta: 10, when: "on_idle" }, targets);
    expect(calls).toEqual([
      "title:name",
      "favicon:blink",
      "eyes:2:edges:0.06",
      "erosion:1",
      "clock:gazer_03",
      "mimic:30000:0.8",
      "scroll:10",
    ]);
  });

  it("W 组:arm 面;A 组:音频落点", () => {
    const { calls, watches, targets } = makeTargets();
    dispatchShellFx({ kind: "webapi_watch", watch: "tab_return" }, targets);
    dispatchShellFx({ kind: "webapi_watch", watch: "sleep_wake" }, targets);
    dispatchShellFx({ kind: "track_remove", trackIdx: 1, durMs: 4000 }, targets);
    dispatchShellFx({ kind: "room_tone", gain: 0.04 }, targets);
    dispatchShellFx({ kind: "ambient_duck", db: -2, rampMs: 1000 }, targets);
    dispatchShellFx({ kind: "lowpass_void", radius: 4, fc: 1200 }, targets);
    dispatchShellFx({ kind: "heartbeat_sonify" }, targets);
    dispatchShellFx({ kind: "whisper_bed", voices: 3 }, targets);
    expect(watches).toEqual(["tab_return", "sleep_wake"]);
    expect(calls).toEqual([
      "track_remove:1:4000",
      "room_tone:0.04",
      "duck:-2:1000",
      "lowpass:true:1200",
      "heartbeat",
      "bed:3",
    ]);
  });
});
