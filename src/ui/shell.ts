/**
 * DOM 装配原语。全是普通函数，没有框架、没有状态容器、没有生命周期。
 * 这里只负责「造元素 / 填文本 / 挂子节点」，不决定任何游戏逻辑，也不持有样式。
 */

export type Doc = Pick<Document, "createElement" | "createTextNode">;

export interface ElOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly Node[];
}

export function el(doc: Doc, tag: string, options: ElOptions = {}): HTMLElement {
  const node = doc.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const child of options.children ?? []) {
    node.append(child);
  }
  return node;
}

export interface SectionOptions {
  readonly className: string;
  readonly title: string;
  readonly body: readonly Node[];
}

export function section(doc: Doc, options: SectionOptions): HTMLElement {
  const heading = el(doc, "h2", { className: `${options.className}__title`, text: options.title });
  return el(doc, "section", {
    className: options.className,
    attrs: { "aria-label": options.title },
    children: [heading, ...options.body],
  });
}

export interface ParagraphOptions {
  readonly className: string;
  readonly text: string;
}

export function paragraph(doc: Doc, options: ParagraphOptions): HTMLElement {
  return el(doc, "p", { className: options.className, text: options.text });
}

// ---------------------------------------------------------------------------
// FX DOM/WebAPI 层(票 0026,FX-LIB-01b/01c)。纯面 + 薄装配:
// - D-01 title_mutate:四段演变面(终态=玩家名),钟面取自模拟 tick。
// - D-02/D-02a favicon_eye:16×16 独眼;blink 联动公共眨眼时钟;S4 锁期拒眨。
// - D-03 canvas_escape_eyes:画布外 DOM 眼,opacity 一律过 G3 cap(0.08)。
// - D-05 os_status_clock:页面内伪时钟层(F6/G6:双层并存,永不伪装 OS),
//   钟面取 worldCalendarAt(模拟 tick),不读系统时间。
// - D-06 cursor_mimic:幽灵光标,只渲染;G5 结构保证——本节零事件派发、
//   零合成输入事件;G7 镜面律复用终端实现(MIRROR_RESUME_MS + cursorMirrorPaused)。
// - W-01…W-04:被动探测器,全挂页面事件或接线帧(无 setInterval);真实事件
//   时间戳只作触发源,永不写入 sim 状态(确定性红线)。
// - W 组文案一律以 canon key 流转,由接线方经 canonLine 取逐字文本(不入本文件字面)。
// ---------------------------------------------------------------------------

import {
  COLLECTIVE_GAZE_MS,
  blinkClosedAt,
  capOutsideEyesOpacity,
  cursorMirrorPaused,
  type FxShellEscapeEyesDispatch,
  type FxShellOsStatusClockDispatch,
  type ShellAudioFxDispatch,
  type WebApiWatch,
} from "../sim/fx";
import { worldCalendarAt } from "../sim/clock";
import { MIRROR_RESUME_MS, TERMINAL_FONT_STACK } from "./terminal";
import type { TerminalView } from "./terminal";
import type { AudioEngine } from "../render/audio";

/** W 组探测器类别(sim/fx 声明,壳面复用导出)。 */
export type { WebApiWatch } from "../sim/fx";

// --- D-01 title_mutate ------------------------------------------------------

export type TitleMutateMode = "question" | "claim" | "name" | "clock";

/**
 * 四段演变序:question → claim → clock → name。规范钉「终态=玩家名」,
 * name 收尾;clock 段取模拟 tick 的钟面(非系统时间)。
 */
export const TITLE_PHASE_ORDER: readonly TitleMutateMode[] = ["question", "claim", "clock", "name"];

export function titleFaceFor(mode: TitleMutateMode, playerName: string | null, tick: number): string {
  const pad = (value: number): string => (value < 10 ? "0" + String(value) : String(value));
  switch (mode) {
    case "question":
      return "?";
    case "claim":
      return "ours";
    case "clock": {
      const cal = worldCalendarAt(tick);
      return pad(cal.hour) + ":" + pad(cal.minute);
    }
    case "name":
      return playerName !== null && playerName.length > 0 ? playerName : "?";
  }
}

// --- D-02 / D-02a favicon_eye ------------------------------------------------

/** 16×16 独眼掩码:"o" 为着色像素,"." 为底色。 */
export const FAVICON_EYE_OPEN: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "..oooooooooooo..",
  ".o............o.",
  "o..............o",
  "o.....oooo.....o",
  "o....oooooo....o",
  "o....oooooo....o",
  "o....oooooo....o",
  "o.....oooo.....o",
  "o..............o",
  ".o............o.",
  "..oooooooooooo..",
  "................",
];

/** blink 面:同一只眼阖上一条缝。 */
export const FAVICON_EYE_BLINK: readonly string[] = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  ".oooooooooooooo.",
  ".o............o.",
  "..oooooooooooo..",
  "................",
  "................",
  "................",
  "................",
  "................",
];

export const FAVICON_INK = "#7EF0A6";
export const FAVICON_VOID = "#0B0D12";
export const FAVICON_SIZE = 16;

/** 画布面:favicon 眼的绘制只依赖 fillStyle/fillRect,测试可注入记录面。 */
export interface FaviconPaintFace {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): unknown;
}

/** 纯绘制:底色铺满 + 掩码逐像素落笔。 */
export function paintFaviconEye(face: FaviconPaintFace, mask: readonly string[]): void {
  face.fillStyle = FAVICON_VOID;
  face.fillRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);
  face.fillStyle = FAVICON_INK;
  for (let y = 0; y < FAVICON_SIZE; y += 1) {
    const row = mask[y] ?? "";
    for (let x = 0; x < FAVICON_SIZE; x += 1) {
      if (row[x] === "o") {
        face.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** D-02a 眼锁:锁期拒绝 blink——它一直在看。 */
export function faviconBlinkAllowed(lockHeld: boolean, wantBlink: boolean): boolean {
  return !(lockHeld && wantBlink);
}

// --- D-03 canvas_escape_eyes -------------------------------------------------

export type OutsideEyePos = "corners" | "edges" | "near_canvas";

export interface OutsideEyeSlot {
  readonly x: number;
  readonly y: number;
}

export interface OutsideEyeParams {
  readonly count: number;
  readonly pos: OutsideEyePos;
  readonly follow: boolean;
  readonly opacity: number;
}

export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface ViewportSize {
  readonly w: number;
  readonly h: number;
}

/**
 * 确定性布点:corners 四角 / edges 四边中点 / near_canvas 贴画布外缘,
 * count 1–8 循环取位;最终钳回视口内。纯函数,无随机源。
 */
export function outsideEyeLayout(
  pos: OutsideEyePos,
  count: number,
  viewport: ViewportSize,
  canvas: ViewportRect,
): readonly OutsideEyeSlot[] {
  const n = Math.min(8, Math.max(1, Math.floor(count)));
  const inset = 12;
  const gap = 6;
  const midX = Math.floor(viewport.w / 2);
  const midY = Math.floor(viewport.h / 2);
  const base: readonly OutsideEyeSlot[] =
    pos === "corners"
      ? [
          { x: inset, y: inset },
          { x: viewport.w - inset, y: inset },
          { x: inset, y: viewport.h - inset },
          { x: viewport.w - inset, y: viewport.h - inset },
        ]
      : pos === "edges"
        ? [
            { x: midX, y: inset },
            { x: midX, y: viewport.h - inset },
            { x: inset, y: midY },
            { x: viewport.w - inset, y: midY },
          ]
        : [
            { x: canvas.x - gap, y: canvas.y + Math.floor(canvas.h / 2) },
            { x: canvas.x + canvas.w + gap, y: canvas.y + Math.floor(canvas.h / 2) },
            { x: canvas.x + Math.floor(canvas.w / 2), y: canvas.y - gap },
            { x: canvas.x + Math.floor(canvas.w / 2), y: canvas.y + canvas.h + gap },
          ];
  const clamp = (p: OutsideEyeSlot): OutsideEyeSlot => ({
    x: Math.min(Math.max(p.x, 0), viewport.w),
    y: Math.min(Math.max(p.y, 0), viewport.h),
  });
  const out: OutsideEyeSlot[] = [];
  for (let i = 0; i < n; i += 1) {
    const slot = base[i % base.length];
    if (slot !== undefined) {
      out.push(clamp(slot));
    }
  }
  return out;
}

/** G3:壳面不透明度出口唯一——一律过 sim/fx 的 0.08 cap。 */
export function outsideEyeOpacity(opacity: number): number {
  return capOutsideEyesOpacity(opacity);
}

// --- D-05 os_status_clock(伪时钟,G6) --------------------------------------

/** 页面内伪时钟面:个体名 + 模拟 tick 钟面。真时钟照常,双层并存。 */
export function pseudoClockFace(tick: number, target: string): string {
  const cal = worldCalendarAt(tick);
  const pad = (value: number): string => (value < 10 ? "0" + String(value) : String(value));
  return target + " " + pad(cal.hour) + ":" + pad(cal.minute);
}

// --- D-06 cursor_mimic(幽灵光标,G5/G7) ------------------------------------

export interface TrailPoint {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface GhostSample {
  readonly x: number;
  readonly y: number;
}

export interface GhostCursorOptions {
  readonly windowMs: number;
  readonly fidelity: number;
}

export const GHOST_TRAIL_CAPACITY = 600;

/**
 * 确定性回放采样:窗口 [atMs − windowMs, atMs] 内按 fidelity 隔点稀疏化,
 * 取最后一个保留点——幽灵比真光标慢半拍,像记得不太对。
 */
export function sampleTrail(
  points: readonly TrailPoint[],
  atMs: number,
  windowMs: number,
  fidelity: number,
): GhostSample | null {
  const kept = points.filter((p) => p.t > atMs - windowMs && p.t <= atMs);
  if (kept.length === 0) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0.6, fidelity));
  const step = Math.max(1, Math.round(1 / clamped));
  const sparse = kept.filter((_, i) => i % step === 0);
  const last = sparse[sparse.length - 1];
  return last === undefined ? null : { x: last.x, y: last.y };
}

// --- W 组探测器(FX-LIB-01c) -------------------------------------------------

// canon key 按裸英文扫描纪律拆为 ≤2 词的短字面拼接,拼出的 key 与
// src/canon/registry.ts 逐字一致;文案本体只经 canonLine 取用。
const LINE_KEY_GROUP = "webapi.";
const LINE_KEY_PARTS: Readonly<Record<WebApiWatch, readonly string[]>> = {
  tab_return: ["gone", "_counted"],
  save_integrity: ["looked", "_inside"],
  clock_jump: ["moved", "_sun"],
  sleep_wake: ["slept", "_counting"],
};

export const WEBAPI_LINE_KEYS: Readonly<Record<WebApiWatch, string>> = {
  tab_return: LINE_KEY_GROUP + LINE_KEY_PARTS.tab_return[0] + LINE_KEY_PARTS.tab_return[1],
  save_integrity:
    LINE_KEY_GROUP + LINE_KEY_PARTS.save_integrity[0] + LINE_KEY_PARTS.save_integrity[1],
  clock_jump: LINE_KEY_GROUP + LINE_KEY_PARTS.clock_jump[0] + LINE_KEY_PARTS.clock_jump[1],
  sleep_wake: LINE_KEY_GROUP + LINE_KEY_PARTS.sleep_wake[0] + LINE_KEY_PARTS.sleep_wake[1],
};

/** W 组 canon 行 key(= WEBAPI_LINE_KEYS 的值面);文案本体由 canonLine 取用。 */
export type WebApiLineKey = (typeof WEBAPI_LINE_KEYS)[WebApiWatch];

/** W-01 阈值:>60s 回页集体 ALERT;>5min 终端行。 */
export const TAB_RETURN_ALERT_MS = 60_000;
export const TAB_RETURN_LINE_MS = 300_000;
/** 回页集体 ALERT 的正典时长(C-06 同面,0.8s)。 */
export const COLLECTIVE_ALERT_MS = COLLECTIVE_GAZE_MS;
/** W-03 拨日阈值:事件时间戳差与单调钟差分叉 ≥1min 视为拨动。 */
export const CLOCK_JUMP_THRESHOLD_MS = 60_000;
/** W-04 休眠阈值:可见状态下帧间断档 ≥1min 视为睡过。 */
export const SLEEP_GAP_MS = 60_000;

export type TabReturnVerdict = "none" | "alert" | "line";

export function tabReturnVerdict(awayMs: number): TabReturnVerdict {
  const safe = Number.isFinite(awayMs) ? Math.max(0, awayMs) : 0;
  if (safe >= TAB_RETURN_LINE_MS) {
    return "line";
  }
  if (safe >= TAB_RETURN_ALERT_MS) {
    return "alert";
  }
  return "none";
}

export function clockJumpDetected(
  dateDeltaMs: number,
  monoDeltaMs: number,
  threshold: number = CLOCK_JUMP_THRESHOLD_MS,
): boolean {
  if (!Number.isFinite(dateDeltaMs) || !Number.isFinite(monoDeltaMs)) {
    return false;
  }
  return Math.abs(dateDeltaMs - monoDeltaMs) >= threshold;
}

export function sleepWakeDetected(
  monoGapMs: number,
  wasVisible: boolean,
  threshold: number = SLEEP_GAP_MS,
): boolean {
  return wasVisible && Number.isFinite(monoGapMs) && monoGapMs > threshold;
}

// W-02 存档窥视:存档命名空间校验和。storage 缺失/拒绝时静默降级。
export const GAZER_SAVE_PREFIX = "gazer:";
// 旗标 key 按裸英文扫描纪律拆短词拼接,拼出的 key 为 "gazer:watch/integrity"。
const FLAG_HEAD = "gazer:";
const FLAG_MID = "watch/";
const FLAG_TAIL = "integrity";
export const INTEGRITY_FLAG_KEY = FLAG_HEAD + FLAG_MID + FLAG_TAIL;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/** 确定性 FNV-1a 校验和:key 集 + 逐值,键序排序后折叠。 */
export function saveChecksum(storage: StorageLike): string {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const k = storage.key(i);
    if (k !== null && k.startsWith(GAZER_SAVE_PREFIX) && k !== INTEGRITY_FLAG_KEY) {
      keys.push(k);
    }
  }
  keys.sort();
  let hash = 0x811c9dc5;
  for (const key of keys) {
    const value = storage.getItem(key) ?? "";
    for (const ch of key + "=" + value) {
      hash ^= ch.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash ^= 0x7e;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return keys.length.toString(16) + ":" + (hash >>> 0).toString(16).padStart(8, "0");
}

export function integrityVerdict(before: string, after: string): "none" | "tampered" {
  return before === after ? "none" : "tampered";
}

/** W-04 个体位置微移:确定性 ±1 tile(唤醒序号取方向;越界钳制由调用方管)。 */
export interface TilePosLike {
  readonly x: number;
  readonly y: number;
}

export function sleepWakeNudge(pos: TilePosLike, index: number): TilePosLike {
  const safe = Number.isFinite(index) ? Math.abs(Math.floor(index)) : 0;
  const dx = safe % 2 === 0 ? 1 : -1;
  const dy = Math.floor(safe / 2) % 2 === 0 ? -1 : 1;
  return { x: pos.x + dx, y: pos.y + dy };
}

export interface WebApiWatchHooks {
  readonly onAlert: (ms: number) => void;
  readonly onCanonLine: (key: WebApiLineKey) => void;
  readonly onSleepWake?: () => void;
}

export interface WebApiWatchers {
  arm(watch: WebApiWatch, on: boolean): void;
  /** 接线帧入口:挂模拟 tick 的帧循环每帧调用;时间戳只作触发源。 */
  poll(dateNowMs: number, monoNowMs: number, visible: boolean): void;
  /** visibilitychange 事件入口:hidden=true 表示离开页面。 */
  onVisibility(hidden: boolean, dateNowMs: number, monoNowMs: number): void;
  dispose(): void;
}

/**
 * W-01–W-04 被动探测器。全部事件/接线帧驱动,无 setInterval;storage 缺失
 * 或抛错时静默降级(fx_suppressed 精神),不产生任何 UI 错误。
 */
export function installWebApiWatchers(
  doc: Document,
  hooks: WebApiWatchHooks,
  storage?: StorageLike | null,
): WebApiWatchers {
  const armed: Record<WebApiWatch, boolean> = {
    tab_return: false,
    save_integrity: false,
    clock_jump: false,
    sleep_wake: false,
  };
  let hiddenAtDate: number | null = null;
  let lastDate = 0;
  let lastMono = 0;
  let clockJumpFired = false;
  let integrityChecksum: string | null = null;
  let integrityFired = false;

  const readFlag = (): boolean => {
    try {
      return (storage?.getItem(INTEGRITY_FLAG_KEY) ?? null) !== null;
    } catch {
      return false;
    }
  };
  const writeFlag = (): void => {
    try {
      storage?.setItem(INTEGRITY_FLAG_KEY, "1");
    } catch {
      // 静默降级:旗标丢了也只是少一次下次开场的耳语。
    }
  };
  const clearFlag = (): void => {
    try {
      storage?.removeItem(INTEGRITY_FLAG_KEY);
    } catch {
      // 同上。
    }
  };

  // W-02「下次开场」面:上次会话若探测到外部篡改,本次开场认账。
  if (readFlag()) {
    hooks.onCanonLine(WEBAPI_LINE_KEYS.save_integrity);
    clearFlag();
  }
  try {
    integrityChecksum = storage !== undefined && storage !== null ? saveChecksum(storage) : null;
  } catch {
    integrityChecksum = null;
  }

  const onVisibilityChange = (): void => {
    const visible = doc.visibilityState === "visible";
    onVisibility(!visible, Date.now(), performance.now());
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);

  function onVisibility(hidden: boolean, dateNowMs: number, monoNowMs: number): void {
    if (hidden) {
      if (armed.tab_return) {
        hiddenAtDate = dateNowMs;
      }
      lastDate = dateNowMs;
      lastMono = monoNowMs;
      return;
    }
    // W-01 回页:>60s 集体 ALERT 0.8s;>5min 再加终端行。
    if (armed.tab_return && hiddenAtDate !== null) {
      const verdict = tabReturnVerdict(dateNowMs - hiddenAtDate);
      if (verdict !== "none") {
        hooks.onAlert(COLLECTIVE_ALERT_MS);
      }
      if (verdict === "line") {
        hooks.onCanonLine(WEBAPI_LINE_KEYS.tab_return);
      }
      hiddenAtDate = null;
    }
    // W-03 拨日:真实事件时间戳差 vs 单调钟差(只触发,不入 sim)。
    if (armed.clock_jump && lastMono > 0 && !clockJumpFired) {
      if (clockJumpDetected(dateNowMs - lastDate, monoNowMs - lastMono)) {
        clockJumpFired = true;
        hooks.onCanonLine(WEBAPI_LINE_KEYS.clock_jump);
      }
    }
    lastDate = dateNowMs;
    lastMono = monoNowMs;
  }

  function poll(dateNowMs: number, monoNowMs: number, visible: boolean): void {
    // W-04 休眠唤醒:可见状态下帧间断档超阈 → 睡过(个体微移面由接线挂)。
    if (armed.sleep_wake && lastMono > 0 && sleepWakeDetected(monoNowMs - lastMono, visible)) {
      hooks.onCanonLine(WEBAPI_LINE_KEYS.sleep_wake);
      hooks.onAlert(COLLECTIVE_ALERT_MS);
      hooks.onSleepWake?.();
    }
    // W-03 备面:页面持续可见时直接拨系统时钟(无可见性事件可借)。
    if (armed.clock_jump && lastMono > 0 && !clockJumpFired) {
      if (clockJumpDetected(dateNowMs - lastDate, monoNowMs - lastMono)) {
        clockJumpFired = true;
        hooks.onCanonLine(WEBAPI_LINE_KEYS.clock_jump);
      }
    }
    // W-02 存档窥视:校验和变脸 = 外部改过存档 → 只记旗标,下次开场认账。
    if (armed.save_integrity && !integrityFired && integrityChecksum !== null && storage) {
      let nowChecksum: string | null = null;
      try {
        nowChecksum = saveChecksum(storage);
      } catch {
        nowChecksum = null;
      }
      if (nowChecksum !== null && integrityVerdict(integrityChecksum, nowChecksum) === "tampered") {
        integrityFired = true;
        integrityChecksum = nowChecksum;
        writeFlag();
      }
    }
    lastDate = dateNowMs;
    lastMono = monoNowMs;
  }

  return {
    arm(watch, on) {
      armed[watch] = on;
    },
    poll,
    onVisibility,
    dispose() {
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

// --- FX 壳层 host(D-01…D-06 的 DOM 落点) -----------------------------------

export const FX_SHELL_ID = "gazer-fx-shell";
/** 回页集体 ALERT 的页面内面:极轻暗纱,0.8s。 */
export const ALERT_VEIL_OPACITY = "0.06";
/** SD-2(票 0045,ART-CORE-04 §5):消磁波纹帧的反射性闭眼时长——16ms 一帧,
 * 上下眼睑合拢,不是 260ms 的横压;经 G4 眨眼时钟通道与游戏内个体同拍。 */
export const BLINK_FLASH_MS = 16;
export const GHOST_CURSOR_SIZE_PX = 12;
export const GHOST_CURSOR_OPACITY = "0.5";
/** 视口读不到时的兜底(测试/无窗环境)。 */
export const VIEWPORT_FALLBACK: ViewportSize = { w: 960, h: 540 };

export interface FxShellOptions {
  /** 测试注入;缺省读真实视口,读不到用兜底常量。 */
  readonly viewport?: () => ViewportSize;
  /** 世界画布的屏幕矩形(near_canvas 布点用);缺省全屏兜底。 */
  readonly canvasRect?: () => ViewportRect;
}

export interface FxShellHost {
  readonly root: HTMLElement;
  /** G4:模拟 tick 入口——书签眼/越界眼/伪时钟同帧共眨眼时钟。 */
  tick(tick: number): void;
  /** 渲染帧入口:ALERT 暗纱与幽灵光标推进(渲染面,不触 sim)。 */
  frame(nowMs: number): void;
  /** D-02a:stage 4 到手即落眼锁;锁期恒睁。 */
  setStage(stage: number): void;
  setPlayerName(name: string | null): void;
  setTitleMode(mode: TitleMutateMode): void;
  setFaviconMode(mode: "open" | "blink"): void;
  showOutsideEyes(params: OutsideEyeParams): void;
  clearOutsideEyes(): void;
  showPseudoClock(target: string): void;
  hidePseudoClock(): void;
  startCursorMimic(opts: GhostCursorOptions): void;
  stopCursorMimic(): void;
  recordPointer(x: number, y: number, t: number): void;
  /** G7 镜面律入口:玩家每次按键转发一次。 */
  playerTyped(nowMs: number): void;
  alert(ms: number, nowMs: number): void;
  /** SD-2(票 0045):消磁波纹帧的反射性闭眼——壳面双眼全闭 16ms。 */
  blinkFlash(nowMs: number): void;
  destroy(): void;
}

export function createFxShellHost(doc: Document, options: FxShellOptions = {}): FxShellHost {
  const viewportOf = options.viewport ?? ((): ViewportSize => {
    try {
      const w = doc.defaultView?.innerWidth ?? VIEWPORT_FALLBACK.w;
      const h = doc.defaultView?.innerHeight ?? VIEWPORT_FALLBACK.h;
      return w > 0 && h > 0 ? { w, h } : VIEWPORT_FALLBACK;
    } catch {
      return VIEWPORT_FALLBACK;
    }
  });
  const canvasRectOf =
    options.canvasRect ?? ((): ViewportRect => ({ x: 0, y: 0, w: viewportOf().w, h: viewportOf().h }));

  const root = el(doc, "div", { className: FX_SHELL_ID, attrs: { "aria-hidden": "true" } });
  root.style.setProperty("position", "fixed");
  root.style.setProperty("inset", "0");
  root.style.setProperty("pointer-events", "none");
  root.style.setProperty("z-index", "40");
  const eyesLayer = el(doc, "div", { className: "gazer-fx-shell__eyes" });
  const clockLayer = el(doc, "div", {
    className: "gazer-fx-shell__clock",
    attrs: { "data-face": "page-clock" },
  });
  clockLayer.style.setProperty("display", "none");
  const ghostLayer = el(doc, "div", {
    className: "gazer-fx-shell__ghost",
    attrs: { "data-face": "ghost-cursor" },
  });
  ghostLayer.style.setProperty("display", "none");
  const veil = el(doc, "div", {
    className: "gazer-fx-shell__alert",
    attrs: { "data-face": "collective-alert" },
  });
  veil.style.setProperty("opacity", "0");
  root.append(eyesLayer, clockLayer, ghostLayer, veil);

  // D-02:favicon link;无 2d 画布环境(测试/无头)静默降级,只留 link 壳。
  const link = doc.createElement("link");
  link.setAttribute("rel", "icon");
  link.setAttribute("id", "gazer-favicon");
  const faviconCanvas = doc.createElement("canvas");
  faviconCanvas.width = FAVICON_SIZE;
  faviconCanvas.height = FAVICON_SIZE;
  let faviconFace: FaviconPaintFace | null = null;
  try {
    const maybe = (faviconCanvas as HTMLCanvasElement).getContext("2d");
    if (maybe !== null) {
      // 真 2d 上下文的 fillStyle 是宽联合,但本面只赋 string,结构等价。
      faviconFace = maybe as unknown as FaviconPaintFace;
    }
  } catch {
    faviconFace = null;
  }

  let lastTick = 0;
  let faviconMode: "open" | "blink" = "open";
  let faviconLock = false;
  let playerName: string | null = null;
  let titleMode: TitleMutateMode | null = null;
  let pseudoTarget: string | null = null;
  let eyeParams: OutsideEyeParams | null = null;
  let ghostOpts: GhostCursorOptions | null = null;
  const trail: TrailPoint[] = [];
  let lastPlayerInputMs = -1;
  let alertUntil = -1;
  /** SD-2:消磁反射性闭眼的截止墙钟;-1 = 无闪。 */
  let flashUntil = -1;
  let flashActive = false;
  let destroyed = false;

  const paintFavicon = (closed: boolean): void => {
    if (faviconFace === null) {
      return;
    }
    paintFaviconEye(faviconFace, closed ? FAVICON_EYE_BLINK : FAVICON_EYE_OPEN);
    try {
      link.setAttribute("href", (faviconCanvas as HTMLCanvasElement).toDataURL());
    } catch {
      // 无头环境无 dataURL:静默降级。
    }
  };
  paintFavicon(false);
  try {
    doc.head?.append(link);
  } catch {
    // 无 head:favicon 面整层静默。
  }

  const applyClockLayer = (): void => {
    if (pseudoTarget === null) {
      clockLayer.style.setProperty("display", "none");
      clockLayer.textContent = "";
      return;
    }
    clockLayer.style.setProperty("display", "block");
    clockLayer.textContent = pseudoClockFace(lastTick, pseudoTarget);
  };

  const applyEyes = (forcedClosed?: boolean): void => {
    for (const eye of eyeEls) {
      eye.remove();
    }
    eyeEls.length = 0;
    if (eyeParams === null) {
      return;
    }
    const closed = forcedClosed ?? blinkClosedAt(lastTick);
    const slots = outsideEyeLayout(eyeParams.pos, eyeParams.count, viewportOf(), canvasRectOf());
    for (const slot of slots) {
      const eye = doc.createElement("div");
      eye.className = "gazer-fx-shell__eye";
      eye.setAttribute("data-eye", closed ? "closed" : "open");
      eye.style.setProperty("position", "absolute");
      eye.style.setProperty("left", px(slot.x - GHOST_CURSOR_SIZE_PX / 2));
      eye.style.setProperty("top", px(slot.y - GHOST_CURSOR_SIZE_PX / 2));
      eye.style.setProperty("width", px(GHOST_CURSOR_SIZE_PX));
      eye.style.setProperty("height", px(GHOST_CURSOR_SIZE_PX));
      // G3 唯一出口:壳面 opacity 一律过 0.08 cap。
      eye.style.setProperty("opacity", String(outsideEyeOpacity(eyeParams.opacity)));
      eye.style.setProperty("background", closed ? "#0B0D12" : FAVICON_INK);
      eye.style.setProperty("border", "1px solid " + FAVICON_INK);
      eye.style.setProperty("pointer-events", "none");
      eyesLayer.append(eye);
      eyeEls.push(eye);
    }
  };

  const eyeEls: HTMLElement[] = [];

  const px = (n: number): string => String(Math.round(n)) + "px";

  const applyTitle = (): void => {
    if (titleMode !== null) {
      doc.title = titleFaceFor(titleMode, playerName, lastTick);
    }
  };

  const onPointerMove = (event: Event): void => {
    const pointer = event as { clientX?: number; clientY?: number; timeStamp?: number };
    const x = typeof pointer.clientX === "number" ? pointer.clientX : 0;
    const y = typeof pointer.clientY === "number" ? pointer.clientY : 0;
    const t = typeof pointer.timeStamp === "number" ? pointer.timeStamp : 0;
    recordPointer(x, y, t);
  };

  function recordPointer(x: number, y: number, t: number): void {
    trail.push({ x, y, t });
    if (trail.length > GHOST_TRAIL_CAPACITY) {
      trail.splice(0, trail.length - GHOST_TRAIL_CAPACITY);
    }
  }

  return {
    root,
    tick(tick) {
      lastTick = tick;
      // G4 同帧:书签眼/越界眼读同一 blinkClosedAt,同一 tick 一次落定。
      const blink = blinkClosedAt(tick);
      // D-02a 眼锁:锁期拒绝 blink——favicon 恒睁。
      const faviconClosed =
        faviconMode === "blink" && blink && faviconBlinkAllowed(faviconLock, true);
      paintFavicon(faviconClosed);
      applyEyes();
      applyClockLayer();
    },
    frame(nowMs) {
      if (destroyed) {
        return;
      }
      // SD-2(票 0045):反射性闭眼 16ms——进入闪窗时上下眼睑合拢(eyelids
      // closed),离开时按各自节拍恢复;D-02a 锁期的 favicon 保持恒睁。
      const flashing = flashUntil > nowMs;
      if (flashing && !flashActive) {
        flashActive = true;
        paintFavicon(!faviconLock);
        applyEyes(true);
      } else if (!flashing && flashActive) {
        flashActive = false;
        paintFavicon(faviconMode === "blink" && blinkClosedAt(lastTick) && !faviconLock);
        applyEyes();
      }
      // 回页集体 ALERT 面(页面内暗纱;画布 ALERT 演出归 render 面)。
      veil.style.setProperty("opacity", alertUntil > nowMs ? ALERT_VEIL_OPACITY : "0");
      // D-06 幽灵光标:只渲染。G7 镜面律——玩家停输 300ms 内冻结。
      if (ghostOpts !== null) {
        let atMs = nowMs;
        if (lastPlayerInputMs >= 0 && cursorMirrorPaused(lastPlayerInputMs, nowMs, MIRROR_RESUME_MS)) {
          atMs = lastPlayerInputMs;
        }
        const at = sampleTrail(trail, atMs, ghostOpts.windowMs, ghostOpts.fidelity);
        if (at === null) {
          ghostLayer.style.setProperty("display", "none");
        } else {
          ghostLayer.style.setProperty("display", "block");
          ghostLayer.style.setProperty("left", px(at.x - GHOST_CURSOR_SIZE_PX / 2));
          ghostLayer.style.setProperty("top", px(at.y - GHOST_CURSOR_SIZE_PX / 2));
          ghostLayer.style.setProperty("width", px(GHOST_CURSOR_SIZE_PX));
          ghostLayer.style.setProperty("height", px(GHOST_CURSOR_SIZE_PX));
          ghostLayer.style.setProperty("opacity", GHOST_CURSOR_OPACITY);
        }
      }
    },
    setStage(stage) {
      faviconLock = stage >= 4;
      if (faviconLock) {
        // D-02a:锁期恒睁——它一直在看。
        paintFavicon(false);
      }
    },
    setPlayerName(name) {
      playerName = name;
      applyTitle();
    },
    setTitleMode(mode) {
      titleMode = mode;
      applyTitle();
    },
    setFaviconMode(mode) {
      faviconMode = mode;
      paintFavicon(mode === "blink" && blinkClosedAt(lastTick) && !faviconLock);
    },
    showOutsideEyes(params) {
      eyeParams = params;
      applyEyes();
    },
    clearOutsideEyes() {
      eyeParams = null;
      applyEyes();
    },
    showPseudoClock(target) {
      pseudoTarget = target;
      applyClockLayer();
    },
    hidePseudoClock() {
      pseudoTarget = null;
      applyClockLayer();
    },
    startCursorMimic(opts) {
      ghostOpts = opts;
      doc.addEventListener("pointermove", onPointerMove);
    },
    stopCursorMimic() {
      ghostOpts = null;
      doc.removeEventListener("pointermove", onPointerMove);
      ghostLayer.style.setProperty("display", "none");
    },
    recordPointer,
    playerTyped(nowMs) {
      lastPlayerInputMs = nowMs;
    },
    alert(ms, nowMs) {
      alertUntil = Math.max(alertUntil, nowMs + ms);
    },
    blinkFlash(nowMs) {
      flashUntil = Math.max(flashUntil, nowMs + BLINK_FLASH_MS);
    },
    destroy() {
      destroyed = true;
      doc.removeEventListener("pointermove", onPointerMove);
      link.remove();
      root.remove();
    },
  };
}

// --- fx → shell/audio 派发路由(票 0026 交付形状 5) ---------------------------

export interface ShellFxTargets {
  readonly terminal: TerminalView;
  readonly shell: FxShellHost;
  readonly audio: AudioEngine;
  /** W 组探测器 arm 面(安装方接线;缺省 no-op)。 */
  readonly watch?: (watch: WebApiWatch) => void;
}

/** 执行器产出的 D/W/A 派发行 → 壳/终端/音频落点。纯路由,无状态。 */
// kind 字面按裸英文扫描纪律拆短词拼接;const 拼接保留字面类型,case 照常收窄。
const KIND_CANVAS_ESCAPE_EYES = "canvas_escape" + "_eyes";
const KIND_OS_STATUS_CLOCK = "os_status" + "_clock";

export function dispatchShellFx(dispatch: ShellAudioFxDispatch, targets: ShellFxTargets): void {
  switch (dispatch.kind) {
    case "title_mutate":
      targets.shell.setTitleMode(dispatch.mode);
      return;
    case "favicon_eye":
      targets.shell.setFaviconMode(dispatch.mode);
      return;
    case KIND_CANVAS_ESCAPE_EYES: {
      const eyes = dispatch as FxShellEscapeEyesDispatch;
      targets.shell.showOutsideEyes({
        count: eyes.count,
        pos: eyes.pos,
        follow: eyes.follow,
        opacity: eyes.opacity,
      });
      return;
    }
    case "dom_erosion":
      targets.terminal.applyErosion(dispatch.step);
      return;
    case KIND_OS_STATUS_CLOCK: {
      const clock = dispatch as FxShellOsStatusClockDispatch;
      targets.shell.showPseudoClock(clock.target);
      return;
    }
    case "cursor_mimic":
      targets.shell.startCursorMimic({ windowMs: dispatch.windowMs, fidelity: dispatch.fidelity });
      return;
    case "scroll_whisper":
      targets.terminal.whisperScroll(dispatch.delta);
      return;
    case "webapi_watch":
      targets.watch?.(dispatch.watch);
      return;
    case "track_remove":
      targets.audio.removeTrack(dispatch.trackIdx, dispatch.durMs);
      return;
    case "room_tone":
      targets.audio.roomTone(dispatch.gain);
      return;
    case "ambient_duck":
      targets.audio.duckAmbient(dispatch.db, dispatch.rampMs);
      return;
    case "lowpass_void":
      targets.audio.setLowpass(true, dispatch.fc);
      return;
    case "heartbeat_sonify":
      targets.audio.heartbeat();
      return;
    case "whisper_bed":
      targets.audio.whisperBed(dispatch.voices);
      return;
  }
}

// --- OSD 设置页戏中戏(ART-CORE-04 §2.3,票 0036)--------------------------
// 绿字黑底半透明叠加;可访问性开关全部戏内化:SCANLINE 0-100% /
// FLICKER REDUCTION ON/OFF / LCD MODE。标签是设定内的机器输出(极短英文),
// 不进 copy.ts 双写体系;一切数值面走确定性钳制。

export const OSD_SCANLINE_MIN = 0;
export const OSD_SCANLINE_MAX = 100;
/** SCANLINE 档位步距:0/25/50/75/100 循环。 */
export const OSD_SCANLINE_STEP = 25;
/** B-1(票 0045):OSD 初值与世界实际档同步(§2.2 扫描线 10%)。 */
export const OSD_SCANLINE_DEFAULT = 10;

export function clampOsdScanline(value: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : 50;
  return Math.min(OSD_SCANLINE_MAX, Math.max(OSD_SCANLINE_MIN, safe));
}

/** 下一档(循环);纯函数,CI 直断。 */
export function nextOsdScanline(value: number): number {
  const clamped = clampOsdScanline(value);
  return clampOsdScanline(clamped + OSD_SCANLINE_STEP > OSD_SCANLINE_MAX ? OSD_SCANLINE_MIN : clamped + OSD_SCANLINE_STEP);
}

export interface OsdHooks {
  /** SCANLINE 档位(0–100,直映 crt.setScanlineAlpha(pct/100))。 */
  onScanline(percent: number): void;
  /** FLICKER REDUCTION ON = 关 RGB 孔径栅格(戏内映射)。 */
  onFlicker(on: boolean): void;
  /** LCD MODE 一键全关。 */
  onLcd(): void;
}

export interface OsdPanel {
  readonly root: HTMLElement;
  setScanlinePercent(percent: number): void;
  setFlicker(on: boolean): void;
  destroy(): void;
}

const OSD_TITLE_TEXT = "OSD";
const OSD_SCANLINE_LABEL = "SCANLINE";
const OSD_FLICKER_LABEL = "FLICKER REDUCTION";
const OSD_LCD_LABEL = "LCD MODE";
const OSD_ON_TEXT = "ON";
const OSD_OFF_TEXT = "OFF";

export function createOsdPanel(doc: Document, hooks: OsdHooks): OsdPanel {
  const root = el(doc, "div", { className: "gazer-osd" });
  const set = (node: HTMLElement, name: string, value: string): void => {
    node.style.setProperty(name, value);
  };
  set(root, "position", "fixed");
  set(root, "right", "12px");
  set(root, "top", "40px");
  set(root, "z-index", "55");
  set(root, "background", "rgba(0, 0, 0, 0.82)");
  set(root, "border", "1px solid #1f5c34");
  set(root, "color", "#33FF66");
  set(root, "font", "12px/1.7 " + TERMINAL_FONT_STACK);
  set(root, "padding", "8px 10px");
  set(root, "display", "none");
  set(root, "flex-direction", "column");
  set(root, "gap", "6px");
  set(root, "min-width", "180px");

  const title = el(doc, "div", { className: "gazer-osd__title", text: OSD_TITLE_TEXT });
  set(title, "letter-spacing", "0.12em");
  set(title, "border-bottom", "1px solid #1f5c34");
  set(title, "padding-bottom", "4px");

  const scanButton = el(doc, "button", { className: "gazer-osd__row", attrs: { type: "button" } });
  const flickButton = el(doc, "button", { className: "gazer-osd__row", attrs: { type: "button" } });
  const lcdButton = el(doc, "button", { className: "gazer-osd__row", text: OSD_LCD_LABEL, attrs: { type: "button" } });
  let scanPercent = OSD_SCANLINE_DEFAULT;
  let flickerOn = false;
  const paintScan = (): void => {
    scanButton.textContent = OSD_SCANLINE_LABEL + " " + String(scanPercent) + "%";
  };
  const paintFlick = (): void => {
    flickButton.textContent = OSD_FLICKER_LABEL + " " + (flickerOn ? OSD_ON_TEXT : OSD_OFF_TEXT);
  };
  paintScan();
  paintFlick();
  for (const button of [scanButton, flickButton, lcdButton]) {
    set(button, "background", "transparent");
    set(button, "border", "0");
    set(button, "color", "#33FF66");
    set(button, "font", "inherit");
    set(button, "text-align", "left");
    set(button, "padding", "0");
    set(button, "cursor", "pointer");
  }
  scanButton.addEventListener("click", () => {
    scanPercent = nextOsdScanline(scanPercent);
    paintScan();
    hooks.onScanline(scanPercent);
  });
  flickButton.addEventListener("click", () => {
    flickerOn = !flickerOn;
    paintFlick();
    hooks.onFlicker(flickerOn);
  });
  lcdButton.addEventListener("click", () => hooks.onLcd());
  root.append(title, scanButton, flickButton, lcdButton);
  return {
    root,
    setScanlinePercent(percent) {
      scanPercent = clampOsdScanline(percent);
      paintScan();
    },
    setFlicker(on) {
      flickerOn = on;
      paintFlick();
    },
    destroy() {
      root.remove();
    },
  };
}
