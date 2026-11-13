/**
 * ART-CORE-04 — the LS-97 CRT framing layer (ticket 0022, delivery step ①).
 *
 * The whole game lives inside one 1997 monitor. This module owns everything
 * outside the world canvas:
 *
 *   - the pre-baked static shell (beige body, darkened edges, nameplate,
 *     power button + LED, degauss button) — painted ONCE per session into a
 *     single composite canvas, never per frame (§9);
 *   - the static screen-effect layer (scanlines 2px/10%, RGB aperture 3%,
 *     8% vignette, 5% glare) — also baked once; only the aperture toggle
 *     re-bakes it;
 *   - the cold/warm boot sequence on a constant timeline (§3);
 *   - `LCD MODE`: one switch that turns every framing effect off.
 *
 * Split like the rest of the render layer: everything a test can assert is a
 * pure function or constant here; only `installCrtShell` touches the DOM.
 *
 * Red lines held by construction:
 *   - Zero dependency on game state: this module imports nothing from `sim/`
 *     or `game.ts` and no function reads world state — `LCD MODE` therefore
 *     cannot read a field even in principle (§9 断言, source-scanned in tests).
 *   - Integer scaling discipline: the shell and effect canvases are baked at
 *     native pixel sizes and CSS-scaled by the same integer scale as the
 *     world canvas, `image-rendering: pixelated` — the framing layer lives
 *     entirely outside the world canvas.
 *   - Zero external product names: the only brand is the in-canon fiction
 *     (`Lumen Soft LS-97`), straight from the spec.
 */

// ---------------------------------------------------------------------------
// Canonical colors (ART-CORE-04 §2)
// ---------------------------------------------------------------------------

/** 外壳米黄塑料。 */
export const SHELL_BEIGE = "#D8CBAF";
/** 边缘 4px 内压暗。 */
export const SHELL_EDGE = "#C4B79C";
/** 铭牌压印 1px 深刻字色。 */
export const NAMEPLATE_INK = "#B3A78F";
/** 电源 LED 双态(本票只预留,状态机归票 ②)。 */
export const LED_GREEN = "#5FD867";
export const LED_AMBER = "#E8A93C";
/** BIOS 文本磷光绿。 */
export const PHOSPHOR_GREEN = "#33FF66";
/** 按钮凹槽/底座的暗色(米黄的深化档,非新色系)。 */
export const SHELL_RECESS = "#B3A78F";
/** 按钮面板(比壳体略深一档)。 */
export const SHELL_FACE = "#CFC2A6";

/** 边框宽度:桌面 屏幕区四周 28px,顶部 34px 容纳铭牌位(§2.1)。 */
export const BORDER = { left: 28, right: 28, top: 34, bottom: 28 } as const;
/** 外壳边缘压暗宽度。 */
export const EDGE_DARKEN_PX = 4;
/** 框体在页面背景上的柔和落影。 */
export const DROP_SHADOW_PX = 8;

// 屏幕效果层参数(§2.2)。
export const SCANLINE_PERIOD_PX = 2;
export const SCANLINE_ALPHA = 0.1;
export const APERTURE_ALPHA = 0.03;
export const VIGNETTE_ALPHA = 0.08;
/** 玻璃眩光:45° 斜向亮带,恒定不动。 */
export const GLARE_ALPHA = 0.05;
/** 亮带宽,取 12–20px 区间的中值。 */
export const GLARE_BAND_PX = 16;

// ---------------------------------------------------------------------------
// Geometry. The shell canvas is baked at these native dimensions and CSS-
// scaled with the same integer scale as the world canvas.
// ---------------------------------------------------------------------------

export const LOGICAL_WIDTH = 320;
export const LOGICAL_HEIGHT = 180;
/** 原生像素下的框体尺寸。 */
export const FRAME_WIDTH = LOGICAL_WIDTH + BORDER.left + BORDER.right;
export const FRAME_HEIGHT = LOGICAL_HEIGHT + BORDER.top + BORDER.bottom;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** 屏幕矩形在框体原生坐标系中的位置(框内纯净的基准线)。 */
export function screenRect(): Rect {
  return { x: BORDER.left, y: BORDER.top, w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT };
}

// 硬件钮布局(框体原生坐标,均落在底部 28px 边框带内)。
export const POWER_BUTTON: Rect = {
  x: FRAME_WIDTH - BORDER.right - 4 - 18,
  y: FRAME_HEIGHT - BORDER.bottom + 5,
  w: 18,
  h: 18,
};
export const LED_SLOT: Rect = {
  x: POWER_BUTTON.x - 10,
  y: POWER_BUTTON.y + 6,
  w: 6,
  h: 6,
};
export const DEGAUSS_BUTTON: Rect = {
  x: LED_SLOT.x - 4 - 12,
  y: POWER_BUTTON.y + 3,
  w: 12,
  h: 12,
};

export const NAMEPLATE_TEXT = "Lumen Soft LS-97";
/** 移动端瘦身铭牌缩写(§8)。 */
export const NAMEPLATE_SHORT = "LS-97";

// ---------------------------------------------------------------------------
// Geometry sets: 桌面满配(§2.1)与移动端瘦身(§8)。The desktop set reproduces
// the module constants exactly (CI pins both against each other); the mobile
// set is the 12px-equivalent frame with the abbreviated nameplate.
// ---------------------------------------------------------------------------

export interface CrtGeometry {
  readonly mobile: boolean;
  readonly border: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly screen: Rect;
  readonly power: Rect;
  readonly led: Rect;
  readonly degauss: Rect;
  readonly nameplate: string;
  readonly edgeDarkenPx: number;
}

export const MOBILE_BORDER = { left: 12, right: 12, top: 16, bottom: 12 } as const;

export const DESKTOP_GEOMETRY: CrtGeometry = {
  mobile: false,
  border: BORDER,
  frameWidth: FRAME_WIDTH,
  frameHeight: FRAME_HEIGHT,
  screen: screenRect(),
  power: POWER_BUTTON,
  led: LED_SLOT,
  degauss: DEGAUSS_BUTTON,
  nameplate: NAMEPLATE_TEXT,
  edgeDarkenPx: EDGE_DARKEN_PX,
};

export const MOBILE_GEOMETRY: CrtGeometry = (() => {
  const w = LOGICAL_WIDTH + MOBILE_BORDER.left + MOBILE_BORDER.right;
  const h = LOGICAL_HEIGHT + MOBILE_BORDER.top + MOBILE_BORDER.bottom;
  // SD-1(票 0045,§8):移动端电源钮在屏幕左下角边缘(长按 800ms)。
  const power: Rect = { x: MOBILE_BORDER.left + 2, y: h - MOBILE_BORDER.bottom + 1, w: 14, h: 10 };
  const led: Rect = { x: w - MOBILE_BORDER.right - 2 - 5, y: power.y + 3, w: 5, h: 5 };
  const degauss: Rect = { x: led.x - 3 - 10, y: power.y + 2, w: 10, h: 8 };
  return {
    mobile: true,
    border: MOBILE_BORDER,
    frameWidth: w,
    frameHeight: h,
    screen: { x: MOBILE_BORDER.left, y: MOBILE_BORDER.top, w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT },
    power,
    led,
    degauss,
    nameplate: NAMEPLATE_SHORT,
    edgeDarkenPx: 2,
  };
})();

export function geometryFor(mobile: boolean): CrtGeometry {
  return mobile ? MOBILE_GEOMETRY : DESKTOP_GEOMETRY;
}

/**
 * P5(票 0039):带框整数缩放档位。世界画布的整数缩放纪律不动——档位按
 * "视口减去框体边框带"重算,框体在最大可容纳的整数档下完整可见:
 *   s = floor(min((vw − 边框横带) / 320, (vh − 边框纵带) / 180)),下限 1。
 * 取舍:这会把满配视口的最大档位从"无框档"压低一档(1080p:6→5),换来
 * 外壳永不溢出——框是第四面墙,墙被裁掉比墙大一点更伤正典。视口小于
 * s=1 档的框体(桌面 376×242)时仍取 1 并裁切,声明为最小视口建议。
 */
export function fitScaleFor(viewportW: number, viewportH: number, geo: CrtGeometry): number {
  const vw = Number.isFinite(viewportW) ? Math.max(0, viewportW) : 0;
  const vh = Number.isFinite(viewportH) ? Math.max(0, viewportH) : 0;
  const bx = geo.border.left + geo.border.right;
  const by = geo.border.top + geo.border.bottom;
  const fit = Math.floor(Math.min((vw - bx) / LOGICAL_WIDTH, (vh - by) / LOGICAL_HEIGHT));
  return Math.max(1, fit);
}

// ---------------------------------------------------------------------------
// Static shell: pure paint-op planner (CI 验收 1 框内纯净 asserted on data).
// ---------------------------------------------------------------------------

export type ShellOp =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly color: string }
  | { readonly kind: "ink"; readonly x: number; readonly y: number; readonly text: string; readonly color: string; readonly size: number };

/** C 遗忘的积尘斑点:确定性 LCG,一粒一 rect,永不随机源。 */
export const SHELL_DUST_SPECKS = 24;

export interface ShellPaintOptions {
  /** C 遗忘老化进度 0..1:0 无老化,1 全黄变。 */
  readonly aged?: number;
  /** C 遗忘积尘:玻璃上静态斑点叠加。 */
  readonly dust?: boolean;
}

/**
 * The full shell as paint ops. Every op paints OUTSIDE the screen rect — the
 * screen area is never touched, so the baked composite cannot leak a shell
 * pixel into the picture (CI 1). Body bands are painted as four strips around
 * the screen, not as one body rect, which makes the invariant structural.
 * Defaults reproduce the desktop geometry byte-for-byte.
 */
export function shellPaintOps(
  geo: CrtGeometry = DESKTOP_GEOMETRY,
  opts: ShellPaintOptions = {},
): readonly ShellOp[] {
  const s = geo.screen;
  const aged = Math.min(1, Math.max(0, opts.aged ?? 0));
  // 老化色:米黄向黄褐线性漂移(C 遗忘 §7)。
  const body = aged <= 0 ? SHELL_BEIGE : mixHex(SHELL_BEIGE, "#C9B183", aged);
  const edge = aged <= 0 ? SHELL_EDGE : mixHex(SHELL_EDGE, "#B5A070", aged);
  const ops: ShellOp[] = [
    // Body: four bands around the screen.
    { kind: "rect", x: 0, y: 0, w: geo.frameWidth, h: geo.border.top, color: body },
    { kind: "rect", x: 0, y: s.y + s.h, w: geo.frameWidth, h: geo.border.bottom, color: body },
    { kind: "rect", x: 0, y: geo.border.top, w: geo.border.left, h: s.h, color: body },
    { kind: "rect", x: s.x + s.w, y: geo.border.top, w: geo.border.right, h: s.h, color: body },
    // Edge darkening along the outer frame edges (§2.1).
    { kind: "rect", x: 0, y: 0, w: geo.frameWidth, h: geo.edgeDarkenPx, color: edge },
    { kind: "rect", x: 0, y: geo.frameHeight - geo.edgeDarkenPx, w: geo.frameWidth, h: geo.edgeDarkenPx, color: edge },
    { kind: "rect", x: 0, y: 0, w: geo.edgeDarkenPx, h: geo.frameHeight, color: edge },
    { kind: "rect", x: geo.frameWidth - geo.edgeDarkenPx, y: 0, w: geo.edgeDarkenPx, h: geo.frameHeight, color: edge },
    // Nameplate, pressed into the bottom band (§2.1 铭牌行;§8 缩写)。
    { kind: "ink", x: 4, y: geo.frameHeight - 5, text: geo.nameplate, color: NAMEPLATE_INK, size: 8 },
    // Power button: recessed socket + face (§2.1 右下角)。
    { kind: "rect", x: geo.power.x, y: geo.power.y, w: geo.power.w, h: geo.power.h, color: SHELL_RECESS },
    { kind: "rect", x: geo.power.x + 2, y: geo.power.y + 2, w: geo.power.w - 4, h: geo.power.h - 4, color: SHELL_FACE },
    // LED socket: the live LED is a tiny overlay painted by `setLed`.
    { kind: "rect", x: geo.led.x, y: geo.led.y, w: geo.led.w, h: geo.led.h, color: SHELL_RECESS },
    // Degauss button with a magnet-slash glyph (§2.1 电源钮左侧)。
    { kind: "rect", x: geo.degauss.x, y: geo.degauss.y, w: geo.degauss.w, h: geo.degauss.h, color: SHELL_RECESS },
    { kind: "rect", x: geo.degauss.x + 2, y: geo.degauss.y + 2, w: 2, h: 6, color: NAMEPLATE_INK },
    { kind: "rect", x: geo.degauss.x + 6, y: geo.degauss.y + 2, w: 2, h: 6, color: NAMEPLATE_INK },
    { kind: "ink", x: geo.degauss.x + 2, y: geo.degauss.y + 9, text: "\\", color: NAMEPLATE_INK, size: 8 },
  ];
  if (opts.dust === true) {
    // 积尘:确定性斑点,只落在外壳带上,永不进屏幕矩形。
    const rnd = noiseRandom(0x5e17);
    for (let i = 0; i < SHELL_DUST_SPECKS; i += 1) {
      const x = Math.floor(rnd() * geo.frameWidth);
      const y = Math.floor(rnd() * geo.frameHeight);
      if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) {
        continue;
      }
      ops.push({ kind: "rect", x, y, w: 1, h: 1, color: "rgba(120, 110, 90, 0.5)" });
    }
  }
  return ops;
}

/** 线性十六进制混色(老化曲线用;0..1 夹紧)。 */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 0xff;
    const cb = (pb >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k);
  };
  const r = ch(16);
  const g = ch(8);
  const bl = ch(0);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Screen-effect layer (§2.2). Also static: baked once at session start.
// ---------------------------------------------------------------------------

/** 2×2 平铺 pattern:每 2px 一条 1px 暗线 10%(CI 验收 2 的数据面)。 */
export function scanlineTile(): readonly (readonly [number, number])[] {
  return [
    [0, 0],
    [SCANLINE_ALPHA, SCANLINE_ALPHA],
  ];
}

/** RGB 孔径栅格:3 列 1px 纵条纹,3% 可关。 */
export function apertureColumns(): readonly { readonly color: string; readonly alpha: number }[] {
  return [
    { color: "#ff0000", alpha: APERTURE_ALPHA },
    { color: "#00ff00", alpha: APERTURE_ALPHA },
    { color: "#0000ff", alpha: APERTURE_ALPHA },
  ];
}

/**
 * R11 参数位(帧时间预算口径):桶形畸变与屏幕呼吸只留参数,本票不实现、
 * 不进 `fxPaintOps` 的配方 —— 接入时按预算验收(§9 ≤2ms GPU @1080p)。
 */
export interface ReservedFxParams {
  /** 桶形畸变:边缘 1.5% 外扩(合成期 shader,不改游戏内坐标)。 */
  readonly barrelDistortion: number;
  /** 屏幕呼吸:亮度 ±1.5% 正弦波动。 */
  readonly breathingAmplitude: number;
  /** 屏幕呼吸周期 12s。 */
  readonly breathingPeriodMs: number;
}

export const RESERVED_FX: ReservedFxParams = {
  barrelDistortion: 0.015,
  breathingAmplitude: 0.015,
  breathingPeriodMs: 12000,
};

export type FxOp =
  | { readonly kind: "scanlines"; readonly tile: readonly (readonly [number, number])[] }
  | { readonly kind: "rgbStripes"; readonly columns: readonly { readonly color: string; readonly alpha: number }[] }
  | { readonly kind: "vignette"; readonly alpha: number }
  | { readonly kind: "glare"; readonly alpha: number; readonly bandPx: number };

/** 效果层可调参数:缺省值即 §2.2 正典面(OSD 与阶段演变经此调档)。 */
export interface FxParams {
  /** 扫描线不透明度 0..0.5(OSD `SCANLINE 0-100%` 直映)。 */
  scanlineAlpha?: number | undefined;
  /** RGB 孔径栅格开关(性能档 / `FLICKER REDUCTION`)。 */
  aperture?: boolean | undefined;
  /** 眩光不透明度(阶段演变 GV96 消退 / 结局 B 12%)。 */
  glareAlpha?: number | undefined;
}

export interface FxParamsFull {
  scanlineAlpha: number;
  aperture: boolean;
  glareAlpha: number;
}

export function fxParamsDefault(): FxParamsFull {
  return { scanlineAlpha: SCANLINE_ALPHA, aperture: true, glareAlpha: GLARE_ALPHA };
}

/** 效果层的完整配方(§2.2;桶形畸变与屏幕呼吸留参数位,见 §R11)。 */
export function fxPaintOps(params: FxParams = {}): readonly FxOp[] {
  const d = fxParamsDefault();
  const p: FxParamsFull = {
    scanlineAlpha: params.scanlineAlpha ?? d.scanlineAlpha,
    aperture: params.aperture ?? d.aperture,
    glareAlpha: params.glareAlpha ?? d.glareAlpha,
  };
  return [
    { kind: "scanlines", tile: scanlineTileWithAlpha(p.scanlineAlpha) },
    { kind: "rgbStripes", columns: p.aperture ? apertureColumns() : [] },
    { kind: "vignette", alpha: VIGNETTE_ALPHA },
    { kind: "glare", alpha: p.glareAlpha, bandPx: GLARE_BAND_PX },
  ];
}

/** 2×2 tile 携带当前档位的不透明度;周期恒 2px(CI 2)。 */
export function scanlineTileWithAlpha(alpha: number): readonly (readonly [number, number])[] {
  return [
    [0, 0],
    [alpha, alpha],
  ];
}

// ---------------------------------------------------------------------------
// Boot timeline (§3). A constant axis, not ad-hoc timers: every beat is a
// named offset so the CI can assert durations on data (CI 验收 3).
// ---------------------------------------------------------------------------

export const COLD_TIMELINE = {
  /** 0.2s 白色水平线从中心展开。 */
  lineStartMs: 200,
  /** 1.4s 光栅稳定,雪花噪点。 */
  noiseStartMs: 1400,
  /** 2.2s BIOS 文本(黑底磷光绿)。 */
  biosStartMs: 2200,
  /** POST 蜂鸣落点(CI:2.2±0.05s)。 */
  beepMs: 2200,
  /** 4.0s 版权 splash。 */
  splashStartMs: 4000,
  /** 5.5s 方块进度条。 */
  progressStartMs: 5500,
  /** 6.5s 世界已在运转。 */
  endMs: 6500,
  /** 跳过规则:1.4s 后可跳(首次启动除外),跳到 5.5s 处。 */
  skipAfterMs: 1400,
  skipToMs: 5500,
  /** BIOS 文本逐行显出的步距。 */
  biosLineStepMs: 400,
} as const;

export const WARM_TIMELINE = {
  /** 暖启动保留蜂鸣。 */
  beepMs: 100,
  splashStartMs: 800,
  endMs: 2500,
} as const;

/**
 * 移动端缩减版(§8):冷启动 4.0s,保留白线展开 + 蜂鸣 + splash;暖启动 2.0s。
 */
export const MOBILE_COLD_TIMELINE = {
  lineStartMs: 200,
  noiseStartMs: 1200,
  /** 移动端省略 BIOS 明细;该槽与桌面同形,恒不进入移动相表。 */
  biosStartMs: 1200,
  beepMs: 1200,
  splashStartMs: 2400,
  progressStartMs: 2400,
  endMs: 4000,
  skipAfterMs: 1200,
  skipToMs: 2400,
  biosLineStepMs: 400,
} as const;

export const MOBILE_WARM_TIMELINE = {
  beepMs: 100,
  splashStartMs: 700,
  endMs: 2000,
} as const;

export const MOBILE_COLD_BOOT_TOTAL_MS = MOBILE_COLD_TIMELINE.endMs;
export const MOBILE_WARM_BOOT_TOTAL_MS = MOBILE_WARM_TIMELINE.endMs;

export const COLD_BOOT_TOTAL_MS = COLD_TIMELINE.endMs;
export const WARM_BOOT_TOTAL_MS = WARM_TIMELINE.endMs;

/** CI 容差:冷启动 6.5±0.3s,暖启动 2.5±0.2s,蜂鸣 2.2±0.05s。 */
export const COLD_BOOT_TOLERANCE_MS = 300;
export const WARM_BOOT_TOLERANCE_MS = 200;
export const BEEP_TOLERANCE_MS = 50;

/** 音频位(本票静默 stub,不实现声音;音频规范票后置)。 */
export interface AudioBeat {
  readonly name: string;
  readonly atMs: number;
}

export const COLD_AUDIO_BEATS: readonly AudioBeat[] = [
  { name: "power_switch", atMs: 0 },
  { name: "degauss_pop", atMs: COLD_TIMELINE.lineStartMs },
  { name: "static_burst", atMs: COLD_TIMELINE.lineStartMs },
  { name: "hum", atMs: COLD_TIMELINE.noiseStartMs },
  { name: "post_beep", atMs: COLD_TIMELINE.beepMs },
  { name: "disk_seek", atMs: COLD_TIMELINE.biosStartMs },
  { name: "floppy_read", atMs: COLD_TIMELINE.splashStartMs },
  { name: "floppy_read", atMs: COLD_TIMELINE.splashStartMs + 400 },
  { name: "floppy_fade", atMs: COLD_TIMELINE.progressStartMs },
  { name: "ambience", atMs: COLD_TIMELINE.endMs },
];

export const WARM_AUDIO_BEATS: readonly AudioBeat[] = [
  { name: "power_switch", atMs: 0 },
  { name: "post_beep", atMs: WARM_TIMELINE.beepMs },
  { name: "floppy_read", atMs: WARM_TIMELINE.splashStartMs },
  { name: "ambience", atMs: WARM_TIMELINE.endMs },
];

/** 纯函数:`(fromMs, toMs]` 开区间内跨过的音频拍名(时序驱动器据此 stub)。 */
export function beatsCrossed(
  beats: readonly AudioBeat[],
  fromMs: number,
  toMs: number,
): readonly string[] {
  return beats.filter((beat) => beat.atMs > fromMs && beat.atMs <= toMs).map((beat) => beat.name);
}

// ---------------------------------------------------------------------------
// BIOS text (§3 两暗线位):the two required lines are canon; the two hidden
// lines are parameter slots future tickets fill (settlement detection in v4,
// memory creep +1K per real day).
// ---------------------------------------------------------------------------

export const DEFAULT_BIOS_MEMORY_K = 640;

/**
 * BIOS 行装配(§3):本函数只产出正典三行 + settlement 槽;一切暗线行
 * (强退 / NG+ RESTORED)由调用方从 canon registry 取用后经 `extras` 追加
 * ——正文单一来源,消除 biosLines 双源分叉(票 0045 G-2)。
 */
export function biosLines(
  memoryK: number,
  settlementName: string | null,
  extras: readonly string[] = [],
): readonly string[] {
  const lines = [
    "Lumen Soft LS-97 BIOS v2.31",
    `Memory Test: ${memoryK}K OK`,
    "Detecting: THRESHOLD.EXE ... FOUND",
  ];
  // 暗线位 1(v4 追加):平行世界作为这台机器上的一块"外设"被检出。
  if (settlementName !== null) {
    lines.push(`Detecting: ${settlementName} ... FOUND`);
  }
  for (const extra of extras) {
    if (extra.length > 0) {
      lines.push(extra);
    }
  }
  return lines;
}

/** splash 的单眼像素 logo:8×8 ALERT 剪影(§3),与 sprite 层解耦的自有掩码。 */
export const SPLASH_LOGO_MASK: readonly string[] = [
  "........",
  "..oooo..",
  ".o....o.",
  "o..oo..o",
  "o..oo..o",
  ".o....o.",
  "..oooo..",
  "........",
];

export const SPLASH_TAGLINE = "Lumen Soft © 1997";

// ---------------------------------------------------------------------------
// Boot frame spec: pure mapping timeline→picture. The installer draws it.
// ---------------------------------------------------------------------------

export type BootPhase = "black" | "expand" | "noise" | "bios" | "splash" | "progress" | "done";

export interface BootFrame {
  readonly phase: BootPhase;
  /** expand 相:白色水平线已展开到的高度(原生 px);其余相为 0 或满高。 */
  readonly lineHeightPx: number;
  readonly noise: boolean;
  readonly bios: readonly string[];
  readonly splash: boolean;
  /** 方块进度条已亮起的段数(0..8)。 */
  readonly blocks: number;
}

export const PROGRESS_BLOCKS = 8;

export interface BootFrameOptions {
  /** BIOS 内存计数(蠕变,§3 暗线 2)。 */
  readonly memoryK?: number | undefined;
  /** 第二条 Detecting 暗线(v4 追加槽)。 */
  readonly settlementName?: string | null | undefined;
  /** 暗线行(强退 / NG+ RESTORED),调用方自 canon registry 取用后传入。 */
  readonly biosExtraLines?: readonly string[] | undefined;
  /** 移动端缩减时间轴(§8)。 */
  readonly mobile?: boolean | undefined;
}

function coldBootFrame(t: number, opts: BootFrameOptions = {}): BootFrame {
  const T = opts.mobile === true ? MOBILE_COLD_TIMELINE : COLD_TIMELINE;
  const full = LOGICAL_HEIGHT;
  if (t >= T.endMs) {
    return { phase: "done", lineHeightPx: full, noise: false, bios: [], splash: false, blocks: PROGRESS_BLOCKS };
  }
  // 移动端省略 BIOS 明细与进度条:白线 → 蜂鸣 → splash → 世界(§8)。
  if (opts.mobile !== true && t >= T.progressStartMs) {
    const blocks = Math.min(PROGRESS_BLOCKS, Math.floor((t - T.progressStartMs) / ((T.endMs - T.progressStartMs) / PROGRESS_BLOCKS)));
    return { phase: "progress", lineHeightPx: full, noise: false, bios: [], splash: false, blocks };
  }
  if (t >= T.splashStartMs) {
    return { phase: "splash", lineHeightPx: full, noise: false, bios: [], splash: true, blocks: 0 };
  }
  if (opts.mobile !== true && t >= T.biosStartMs) {
    const lines = biosLines(
      opts.memoryK ?? DEFAULT_BIOS_MEMORY_K,
      opts.settlementName ?? null,
      opts.biosExtraLines ?? [],
    );
    const shown = Math.min(lines.length, Math.floor((t - T.biosStartMs) / T.biosLineStepMs) + 1);
    return { phase: "bios", lineHeightPx: full, noise: false, bios: lines.slice(0, shown), splash: false, blocks: 0 };
  }
  if (t >= T.noiseStartMs) {
    return { phase: "noise", lineHeightPx: full, noise: true, bios: [], splash: false, blocks: 0 };
  }
  if (t >= T.lineStartMs) {
    const p = (t - T.lineStartMs) / (T.noiseStartMs - T.lineStartMs);
    return { phase: "expand", lineHeightPx: Math.max(1, Math.round(full * p)), noise: false, bios: [], splash: false, blocks: 0 };
  }
  return { phase: "black", lineHeightPx: 0, noise: false, bios: [], splash: false, blocks: 0 };
}

function warmBootFrame(t: number, mobile = false): BootFrame {
  const T = mobile ? MOBILE_WARM_TIMELINE : WARM_TIMELINE;
  if (t >= T.endMs) {
    return { phase: "done", lineHeightPx: LOGICAL_HEIGHT, noise: false, bios: [], splash: false, blocks: PROGRESS_BLOCKS };
  }
  if (t >= T.splashStartMs) {
    return { phase: "splash", lineHeightPx: LOGICAL_HEIGHT, noise: false, bios: [], splash: true, blocks: 0 };
  }
  return { phase: "black", lineHeightPx: 0, noise: false, bios: [], splash: false, blocks: 0 };
}

export function bootFrame(tMs: number, cold: boolean, opts: BootFrameOptions = {}): BootFrame {
  return cold ? coldBootFrame(tMs, opts) : warmBootFrame(tMs, opts.mobile === true);
}

/**
 * 跳过规则(§3):首次启动不可跳;冷启动 1.4s 后可跳,跳到 5.5s 处。
 * Returns the timeline position to jump to, or `null` when the skip is not
 * allowed at this moment.
 */
export function skipTarget(
  tMs: number,
  opts: { readonly cold: boolean; readonly firstBoot: boolean },
): number | null {
  if (!opts.cold || opts.firstBoot) {
    return null;
  }
  if (tMs < COLD_TIMELINE.skipAfterMs) {
    return null;
  }
  return COLD_TIMELINE.skipToMs;
}

/** 移动端音频拍表(§8 缩减版;移动端仅一条软盘读盘位)。 */
export const MOBILE_COLD_AUDIO_BEATS: readonly AudioBeat[] = [
  { name: "power_switch", atMs: 0 },
  { name: "degauss_pop", atMs: MOBILE_COLD_TIMELINE.lineStartMs },
  { name: "hum", atMs: MOBILE_COLD_TIMELINE.noiseStartMs },
  { name: "post_beep", atMs: MOBILE_COLD_TIMELINE.beepMs },
  { name: "floppy_read", atMs: MOBILE_COLD_TIMELINE.splashStartMs },
  { name: "ambience", atMs: MOBILE_COLD_TIMELINE.endMs },
];

export const MOBILE_WARM_AUDIO_BEATS: readonly AudioBeat[] = [
  { name: "power_switch", atMs: 0 },
  { name: "post_beep", atMs: MOBILE_WARM_TIMELINE.beepMs },
  { name: "ambience", atMs: MOBILE_WARM_TIMELINE.endMs },
];

// ---------------------------------------------------------------------------
// 电源三态(§4)。按钮的行为只由 (gv, 真结局后) 决定,纯函数,CI 项 4。
// ---------------------------------------------------------------------------

/** GV 60–79:压暗 15%,2s 后自行恢复。 */
export const POWER_DIM_AMOUNT = 0.15;
export const POWER_DIM_MS = 2000;
/** GV<60 全重启:白线收缩 → 黑 → 1s 后自动冷启动。 */
export const SHUTDOWN_SHRINK_MS = 300;
export const SHUTDOWN_BLACK_HOLD_MS = 1000;

export type PowerAction = "restart" | "rebound" | "denied";

export function powerActionFor(gv: number, postEnding: boolean): PowerAction {
  if (postEnding) {
    // 真结局后按钮可再次生效(§4 末行)。
    return "restart";
  }
  const safe = Number.isFinite(gv) ? gv : 0;
  if (safe < 60) {
    return "restart";
  }
  if (safe < 80) {
    return "rebound";
  }
  return "denied";
}

/** 移动端电源钮长按(§8):按满 800ms 才算按下。 */
export const POWER_HOLD_MS = 800;

export function powerHoldFires(heldMs: number): boolean {
  return Number.isFinite(heldMs) && heldMs >= POWER_HOLD_MS;
}

// ---------------------------------------------------------------------------
// 消磁(§5):0.8s 彩虹波纹 + 低频嘭;波纹帧全体眨眼一次(G4 内部通道,
// G8——不经 C-05);GV60 起自发消磁(30–60min,确定性派生,禁随机源)。
// ---------------------------------------------------------------------------

export const DEGAUSS_WAVE_MS = 800;
/** 自发消磁间隔 30–60min;tick 为 3s,即 600–1200 tick。 */
export const SPONT_DEGAUSS_MIN_TICKS = 600;
export const SPONT_DEGAUSS_MAX_TICKS = 1200;
/** 自发消磁的 GV 门槛。 */
export const SPONT_DEGAUSS_MIN_GV = 60;

/** 确定性整数哈希(FNV-1a);自发面的"随机"全部由此派生。 */
export function fnv1a(inputs: readonly number[]): number {
  let hash = 0x811c9dc5;
  for (const value of inputs) {
    hash ^= Math.floor(Number.isFinite(value) ? value : 0) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 第 index 次自发消磁的间隔(600–1200 tick,种子定死,重放一致)。 */
export function spontaneousDegaussGapTicks(seed: number, index: number): number {
  const span = SPONT_DEGAUSS_MAX_TICKS - SPONT_DEGAUSS_MIN_TICKS + 1;
  return SPONT_DEGAUSS_MIN_TICKS + (fnv1a([seed, 0x5de9, index]) % span);
}

/**
 * 自发消磁时刻表:从 `afterTick` 之后第一次越线的 tick。纯、单调、重放逐字节
 * 一致(CI 项 7 的确定性面)。
 */
export function nextSpontaneousDegaussTick(seed: number, afterTick: number): number {
  const safe = Number.isFinite(afterTick) ? Math.max(0, Math.floor(afterTick)) : 0;
  let tick = 0;
  let index = 0;
  while (tick <= safe) {
    tick += spontaneousDegaussGapTicks(seed, index);
    index += 1;
  }
  return tick;
}

/** 波纹进度 0..1;窗口外返回 null(驱动器据此停止画)。 */
export function degaussWaveProgress(startMs: number, nowMs: number): number | null {
  const t = nowMs - startMs;
  if (!(t >= 0) || t > DEGAUSS_WAVE_MS) {
    return null;
  }
  return t / DEGAUSS_WAVE_MS;
}

// ---------------------------------------------------------------------------
// 阶段演变(§6)。
// ---------------------------------------------------------------------------

/** GV20–40 罕见水平失步:p≈1 次/小时 → 每 20 tick(h=1 游戏小时)至多 1 次。 */
export const DESYNC_TICKS_PER_HOUR = 20;
export const DESYNC_MIN_GV = 20;
export const DESYNC_MAX_GV = 40;

/** 该游戏小时内是否发生失步(种子+小时定死;p=1/20 ≈ 1 次/小时)。 */
export function desyncTickInHour(seed: number, hour: number): number | null {
  const h = Math.floor(Number.isFinite(hour) ? Math.max(0, hour) : 0);
  return fnv1a([seed, 0x4d3c, h]) % DESYNC_TICKS_PER_HOUR === 0
    ? h * DESYNC_TICKS_PER_HOUR
    : null;
}

/** GV80 起落影逐会话加深:8px 起,每会话 +2px,封顶 16px。 */
export const DROP_SHADOW_BASE_PX = 8;
export const DROP_SHADOW_STEP_PX = 2;
export const DROP_SHADOW_MAX_PX = 16;

export function dropShadowPxFor(sessions: number): number {
  const s = Number.isFinite(sessions) ? Math.max(0, Math.floor(sessions)) : 0;
  return Math.min(DROP_SHADOW_MAX_PX, DROP_SHADOW_BASE_PX + s * DROP_SHADOW_STEP_PX);
}

/**
 * 眩光曲线(§6 / CI 项 6):GV<96 恒 5%;96→100 线性降至 0;GV100 玻璃消失。
 * 与终端输入劫持(GV96,终端 EROSION_STEP_GV[4])同帧触发。
 */
export const GLARE_FADE_START_GV = 96;
/** 结局 B:眩光增强至 12%(§7)。 */
export const GLARE_JUDGMENT_ALPHA = 0.12;

export function glareAlphaForGv(gv: number): number {
  const safe = Number.isFinite(gv) ? gv : 0;
  if (safe < GLARE_FADE_START_GV) {
    return GLARE_ALPHA;
  }
  const t = Math.min(1, (safe - GLARE_FADE_START_GV) / (100 - GLARE_FADE_START_GV));
  return GLARE_ALPHA * (1 - t);
}

/**
 * LED 与终端光标同拍(§10.8):530ms 一拍,与 ui/terminal 的 CURSOR_ON_MS
 * 同值(测试跨模块断言 diff<5%,两处常量不互相 import)。
 */
export const LED_CURSOR_BEAT_MS = 530;

/** 结局 B 的 LED 以光标节拍闪烁:确定性方波。 */
export function ledBeatVisible(nowMs: number, phaseMs = 0): boolean {
  const t = nowMs - phaseMs;
  return Number.isFinite(t) && Math.floor(Math.max(0, t) / LED_CURSOR_BEAT_MS) % 2 === 0;
}

/** C 遗忘:LED 在第二次会话起彻底熄灭(§7「某次会话彻底熄灭」的确定性面)。 */
export const FORGETTING_LED_DEAD_SESSIONS = 2;

export function ledDeadFor(sessions: number): boolean {
  return Number.isFinite(sessions) && sessions >= FORGETTING_LED_DEAD_SESSIONS;
}

// ---------------------------------------------------------------------------
// 内存蠕变(§3 暗线 2):每跨一个现实日 +1K,存档持久、单调递增;真结局后
// 重启一次 -640K 归零。日序派生,零随机源;纯函数,存档面在 game 层。
// ---------------------------------------------------------------------------

export const MS_PER_REAL_DAY = 86_400_000;

/** 跨过的现实日数(整日,自 firstDayMs 起算)。 */
export function memoryCreepDays(firstDayMs: number, nowMs: number): number {
  const first = Number.isFinite(firstDayMs) ? firstDayMs : 0;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  if (now <= first) {
    return 0;
  }
  return Math.floor((now - first) / MS_PER_REAL_DAY);
}

/**
 * BIOS 内存计数:基线 640K + 蠕变日数;真结局后的那次重启把计数一次性
 * -640K 归零(resetDone 入存档,只发生一次,之后单调重新爬)。
 */
export function biosMemoryK(days: number, resetDone: boolean, baseK = DEFAULT_BIOS_MEMORY_K): number {
  const d = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  if (resetDone) {
    return d;
  }
  return baseK + d;
}

/**
 * G-2(票 0045):同现实日第二次起走暖启动——日序相等即暖;跨日即冷。
 * 纯函数,日序来自存档 firstDayMs 的整除派生(无随机源)。
 */
export function isWarmBoot(storedDay: number | null, today: number): boolean {
  return storedDay !== null && Number.isFinite(storedDay) && storedDay === Math.max(0, Math.floor(today));
}

/** C 遗忘老化步进:每会话 +25%,封顶 1(SD-4,票 0045;main 喂 setEnding)。 */
export const FORGETTING_AGING_STEP = 0.25;

export function forgettingAgingFor(sessions: number): number {
  const s = Number.isFinite(sessions) ? Math.max(0, Math.floor(sessions)) : 0;
  return Math.min(1, Math.max(0, (s - 1) * FORGETTING_AGING_STEP));
}

// ---------------------------------------------------------------------------
// 四结局的框体行为(§7)。frame 信号由 main 同步帧从世界结局信号 /
// 塔面判据派生后推给安装器;真·凝视 = 满屏无边框渲染(§10.10)。
// ---------------------------------------------------------------------------

export interface EndingFrame {
  readonly kind: string;
  /** 真·凝视:边框/扫描线/眩光/暗角全部溶解——游戏唯一一次满屏渲染。 */
  readonly fullbleed: boolean;
  /** A 融合:静态噪点溢出屏幕爬上外壳 → 全黑。 */
  readonly shellNoiseSpill: boolean;
  readonly blackout: boolean;
  /** B 审判:眩光增强至 12% + LED 以光标节拍闪烁。 */
  readonly glareAlpha: number | null;
  readonly ledBeat: boolean;
  /** C 遗忘:外壳黄变 / 积尘 / LED 熄灭。 */
  readonly aging: number;
  readonly dust: boolean;
  readonly ledDead: boolean;
}

export function endingFrameFor(kind: string, progress: number, sessions: number): EndingFrame {
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const s = Number.isFinite(sessions) ? Math.max(0, Math.floor(sessions)) : 0;
  const base: EndingFrame = {
    kind,
    fullbleed: false,
    shellNoiseSpill: false,
    blackout: false,
    glareAlpha: null,
    ledBeat: false,
    aging: 0,
    dust: false,
    ledDead: false,
  };
  switch (kind) {
    case "fusion":
      // 噪点先爬上外壳,溶解走完即全黑(框是最后一个消失的)。
      return { ...base, shellNoiseSpill: p > 0 && p < 1, blackout: p >= 1 };
    case "judgment":
      return { ...base, glareAlpha: GLARE_JUDGMENT_ALPHA, ledBeat: true };
    case "forgetting":
      return { ...base, aging: Math.min(1, p), dust: true, ledDead: ledDeadFor(s) };
    case "gaze":
      return { ...base, fullbleed: true };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// 渲染调用计数(§10.10 断言的落地):终局序列结束后,外壳/扫描线/眩光/暗角
// 的渲染调用次数 = 0。计数器纯态;满屏模式把计数清零并冻结,此后任何
// bake 调用都被拒绝 —— 断言在任何时刻都成立。
// ---------------------------------------------------------------------------

export type RenderCallKind = "shell" | "scanlines" | "aperture" | "vignette" | "glare" | "boot";

export type RenderCallSnapshot = Readonly<Record<RenderCallKind, number>>;

export interface RenderCallCounter {
  bump(kind: RenderCallKind): void;
  /** 真·凝视:清零并冻结;冻结后 bump 是空转。 */
  freeze(): void;
  frozen(): boolean;
  snapshot(): RenderCallSnapshot;
}

export function createRenderCallCounter(): RenderCallCounter {
  let frozen = false;
  const counts: Record<RenderCallKind, number> = {
    shell: 0,
    scanlines: 0,
    aperture: 0,
    vignette: 0,
    glare: 0,
    boot: 0,
  };
  return {
    bump(kind) {
      if (frozen) {
        return;
      }
      counts[kind] += 1;
    },
    freeze() {
      frozen = true;
      for (const key of Object.keys(counts) as RenderCallKind[]) {
        counts[key] = 0;
      }
    },
    frozen() {
      return frozen;
    },
    snapshot() {
      return { ...counts };
    },
  };
}

/** 满屏判定下安装器必须隐藏的全部图层(结构性断言面)。 */
export const FULLBLEED_HIDDEN_LAYERS: readonly string[] = [
  "gazer-crt-shell",
  "gazer-crt-glass",
];

/**
 * G-7(票 0045,§7 真·凝视):框体侧 1s 撤走序列——塔化黑 / it is done 落定
 * 后,边框与玻璃以 1s 线性溶解,替代瞬时切换;序列结束才冻结渲染计数
 * (§10.10 仍以"序列结束后 = 0"为准)。
 */
export const FULLBLEED_DISSOLVE_MS = 1000;

/** 撤走序列的透明度:1 → 0 线性;窗口外为终值。 */
export function dissolveAlphaAt(tMs: number): number {
  const t = Number.isFinite(tMs) ? tMs : 0;
  if (t <= 0) {
    return 1;
  }
  if (t >= FULLBLEED_DISSOLVE_MS) {
    return 0;
  }
  return 1 - t / FULLBLEED_DISSOLVE_MS;
}

// ---------------------------------------------------------------------------
// G-4(票 0045,§2.2 / G9):bloom 最小实现——两点辉光(G 高光与终端光标,
// 全游戏最亮的两样东西)。预烘焙径向渐变 sprite,按点位叠放一次成像;点位
// 由 main 同步帧从世界与终端 DOM 推入,世界依赖不进本模块。白名单外的
// 点位一律丢弃(G9);实机强度以磷光口径封顶,读作辉光而非光斑。
// ---------------------------------------------------------------------------

export type BloomKind = "g_highlight" | "terminal_cursor";

export const BLOOM_KINDS: readonly BloomKind[] = ["g_highlight", "terminal_cursor"];

export const BLOOM_RADIUS_PX = 14;

/** 辉光叠放峰值不透明度(远低于点亮)。 */
export const BLOOM_ALPHA = 0.16;

export interface BloomPoint {
  readonly kind: BloomKind;
  /** 逻辑屏坐标(320×180)。 */
  readonly x: number;
  readonly y: number;
}

/** G9:白名单外的点位丢弃;越界点位钳入屏内(光晕边缘允许贴边)。 */
export function bloomPaintOps(points: readonly BloomPoint[]): readonly BloomPoint[] {
  return points
    .filter((p) => BLOOM_KINDS.includes(p.kind))
    .map((p) => ({
      kind: p.kind,
      x: Math.min(LOGICAL_WIDTH, Math.max(0, Math.round(p.x))),
      y: Math.min(LOGICAL_HEIGHT, Math.max(0, Math.round(p.y))),
    }));
}

// ---------------------------------------------------------------------------
// DOM installer. The only impure part; driven entirely by the pure core.
// ---------------------------------------------------------------------------

export type LedState = "green" | "amber" | "cursor_beat" | "off";

export interface CrtShellOptions {
  readonly doc: Document;
  /** The world canvas; the frame aligns itself around it. */
  readonly canvas: HTMLCanvasElement;
  /** `false` 播放暖启动 2.5s(保留蜂鸣与 splash)。默认冷启动。 */
  readonly cold?: boolean;
  /** 首次启动不可跳(存档层落地前恒为 true)。 */
  readonly firstBoot?: boolean;
  /** BIOS 内存计数蠕变(§3 暗线 2);默认 640K。 */
  readonly memoryK?: number;
  /** BIOS 第二条 Detecting 暗线槽(v4 追加);null 省略该行。 */
  readonly settlementName?: string | null;
  /** 暗线行(强退 / NG+ RESTORED),调用方自 canon registry 取用后传入。 */
  readonly biosExtraLines?: readonly string[];
  /** 移动端瘦身(§8):12px 框、缩写铭牌、4.0s 冷启动、RGB 栅格关。 */
  readonly mobile?: boolean;
  /** 音频位:每跨一拍回调一次。默认静默 stub。 */
  readonly onAudioBeat?: (beat: string) => void;
  /** 消磁钮点击(接线归 game/main;安装器只发事件)。 */
  readonly onDegaussClick?: () => void;
  /** 电源钮点击(GV<60 重启 / 60–79 回弹 / ≥80 无反应;桌面单击、移动端长按)。 */
  readonly onPowerClick?: () => void;
}

export interface GlareLogEntry {
  readonly alpha: number;
  readonly atMs: number;
}

export interface CrtShellHandle {
  /** LED 四态:绿(<80)/琥珀(≥80)/结局 B 光标节拍/C 遗忘熄灭。 */
  readonly setLed: (state: LedState) => void;
  /** 结局 B 光标节拍帧推进(主同步帧每帧调用;其他态为空转)。 */
  readonly tickLed: (nowMs: number) => void;
  /** `LCD MODE` 一键全关:关掉全部框定效果;游戏逻辑零依赖(§9)。 */
  readonly setLcdMode: (on: boolean) => void;
  readonly isLcdMode: () => boolean;
  /** 孔径栅格性能档开关(§2.2;OSD `FLICKER REDUCTION` 的戏内映射)。 */
  readonly setAperture: (on: boolean) => void;
  /** OSD `SCANLINE 0-100%`:扫描线不透明度直映,周期恒 2px。 */
  readonly setScanlineAlpha: (alpha: number) => void;
  /** 阶段演变/结局的眩光档(GV96 消退、结局 B 12%)。 */
  readonly setGlare: (alpha: number, nowMs: number) => void;
  /** 眩光档历史(同帧触发断言的时间戳面)。 */
  readonly glareLog: () => readonly GlareLogEntry[];
  /** 落影逐会话加深(GV80 起,§6)。 */
  readonly setShadowDepth: (px: number) => void;
  /** 电源三态面之一:GV<60 / 真结局后——白线收缩 → 黑 → 1s 自动冷启动。 */
  readonly shutdown: () => void;
  /** 电源三态面之二:GV60–79——压暗 15% 2s 回弹。 */
  readonly dimRebound: () => void;
  /** 消磁波纹 0.8s(按下与自发同一条渲染路径)。 */
  readonly degauss: (nowMs: number) => void;
  /** 四结局框体(§7):由 main 同步帧自世界结局信号派生后推入。 */
  readonly setEnding: (kind: string | null, progress: number, sessions: number) => void;
  /** G-4 两点辉光(§2.2):main 同步帧推入,G9 白名单外丢弃;变位才重绘。 */
  readonly setBloom: (points: readonly BloomPoint[]) => void;
  /** 玩家跳过;返回是否真的跳了(受 跳过规则 约束)。 */
  readonly skip: () => boolean;
  readonly bootDone: () => boolean;
  /** §10.10:渲染调用计数(满屏模式清零并冻结)。 */
  readonly renderCalls: () => RenderCallSnapshot;
  readonly destroy: () => void;
}

const CRT_FONT = '"MS Gothic", "Fixedsys", "DotGothic16", ui-monospace, monospace';

/** Deterministic noise: a fixed LCG seeded per frame — replay-safe. */
function noiseRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(doc: Document, w: number, h: number, className: string): HTMLCanvasElement {
  const el = doc.createElement("canvas");
  el.className = className;
  el.width = w;
  el.height = h;
  return el;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("GAZER CRT layer needs a 2d canvas context");
  }
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Applies the pure shell ops to a 2d context (the shell baker). */
function paintShell(
  ctx: CanvasRenderingContext2D,
  geo: CrtGeometry,
  opts: ShellPaintOptions,
  counter: RenderCallCounter,
): void {
  counter.bump("shell");
  for (const op of shellPaintOps(geo, opts)) {
    if (op.kind === "rect") {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else {
      ctx.fillStyle = op.color;
      ctx.font = `${op.size}px ${CRT_FONT}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}

/** Applies the pure fx recipe to a 2d context (the effect-layer baker). */
function paintFx(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  params: FxParamsFull,
  counter: RenderCallCounter,
): void {
  ctx.clearRect(0, 0, w, h);
  // 扫描线:2×2 平铺 pattern,一次 fill(§9);周期恒 2px,档位只改不透明度。
  counter.bump("scanlines");
  const tile = document.createElement("canvas");
  tile.width = SCANLINE_PERIOD_PX;
  tile.height = SCANLINE_PERIOD_PX;
  const tileCtx = tile.getContext("2d");
  if (tileCtx !== null) {
    const rows = scanlineTileWithAlpha(params.scanlineAlpha);
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y] ?? [0, 0];
      const alpha = row[0] ?? 0;
      if (alpha > 0) {
        tileCtx.fillStyle = `rgba(4, 10, 6, ${alpha})`;
        tileCtx.fillRect(0, y, SCANLINE_PERIOD_PX, 1);
      }
    }
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern !== null) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
  }
  // 孔径栅格:3×1 RGB 纵条纹,一次 fill;性能档可关(B-2,票 0045:与
  // SCANLINE 档位解耦——0% 扫描线不连带关栅格)。
  if (params.aperture) {
    counter.bump("aperture");
    const stripes = document.createElement("canvas");
    stripes.width = apertureColumns().length;
    stripes.height = 1;
    const stripesCtx = stripes.getContext("2d");
    if (stripesCtx !== null) {
      apertureColumns().forEach((column, index) => {
        stripesCtx.globalAlpha = column.alpha;
        stripesCtx.fillStyle = column.color;
        stripesCtx.fillRect(index, 0, 1, 1);
      });
      stripesCtx.globalAlpha = 1;
      const pattern = ctx.createPattern(stripes, "repeat");
      if (pattern !== null) {
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
  // 四角暗角 8%:径向渐变,中心透明、四角 0.08。
  counter.bump("vignette");
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.45,
    w / 2,
    h / 2,
    Math.hypot(w / 2, h / 2),
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, `rgba(0, 0, 0, ${VIGNETTE_ALPHA})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  // 玻璃眩光:45° 斜向亮带,档位驱动(GV96 消退 / 结局 B 12%)。
  counter.bump("glare");
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(Math.PI / 4);
  const glareAlpha = Math.max(0, params.glareAlpha);
  const band = ctx.createLinearGradient(0, -GLARE_BAND_PX / 2, 0, GLARE_BAND_PX / 2);
  band.addColorStop(0, "rgba(255, 255, 255, 0)");
  band.addColorStop(0.5, `rgba(255, 255, 255, ${glareAlpha})`);
  band.addColorStop(1, "rgba(255, 255, 255, 0)");
  const diagonal = Math.hypot(w, h);
  ctx.fillStyle = band;
  ctx.fillRect(-diagonal, -GLARE_BAND_PX / 2, diagonal * 2, GLARE_BAND_PX);
  ctx.restore();
}

/**
 * Builds and mounts the LS-97 framing. Call before `createGame`: the boot
 * overlay runs while the world boots underneath, so at `endMs` the world is
 * already running (§3 — "世界已在运转").
 */
export function installCrtShell(options: CrtShellOptions): CrtShellHandle {
  const doc = options.doc;
  const canvas = options.canvas;
  const mobile = options.mobile === true;
  const geo = geometryFor(mobile);
  const cold = options.cold ?? true;
  const firstBoot = options.firstBoot ?? true;
  const onAudioBeat = options.onAudioBeat ?? ((): void => {});
  const renderCounter = createRenderCallCounter();
  let lcdMode = false;
  let destroyed = false;
  let bootFinished = false;
  let ledState: LedState = "green";
  let ledPhaseMs = 0;
  let glareAlpha = GLARE_ALPHA;
  const glareHistory: GlareLogEntry[] = [];
  const fxParams: FxParamsFull = {
    scanlineAlpha: SCANLINE_ALPHA,
    // 移动端 RGB 栅格关闭(§8)。
    aperture: !mobile,
    glareAlpha: GLARE_ALPHA,
  };
  // 电源三态的运行态。
  let reboundTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  // 结局运行态(§7)。
  let endingKind: string | null = null;
  let endingProgress = 0;
  let endingSessions = 0;
  /** 当前落影深度(溶解序列按比例淡出用)。 */
  let shadowPx = DROP_SHADOW_BASE_PX;
  /** G-7:真结局 1s 撤走序列的起点(墙钟);-1 = 未启动。 */
  let dissolveStart = -1;
  let spillFrame = 0;
  let waveStart = -1;
  let animRafId = 0;
  let shutdownAt = -1;

  const stage = canvas.parentElement;
  if (stage === null) {
    throw new Error("GAZER CRT frame needs the world canvas mounted in a stage element");
  }

  const stageEl: HTMLElement = stage;

  // P5(票 0039):the canvas moves into a fit layer that is exactly the world
  // canvas' CSS box at the viewport-fit integer scale. app.ts derives the
  // integer scale from `canvas.parentElement`'s client size, so sizing this
  // layer makes the framed monitor always fit the viewport without touching
  // the integer-scaling discipline (the canvas stays on whole multiples).
  const fitDiv = doc.createElement("div");
  fitDiv.className = "gazer-crt-fit";
  fitDiv.style.cssText = "display:grid;place-items:center;contain:paint;";
  fitDiv.append(canvas);
  stage.append(fitDiv);

  // Frame: shell canvas (baked once) + glass (fx/wave/LED/boot layers) +
  // the ending spill layer above everything the frame owns.
  const frame = doc.createElement("div");
  frame.className = "gazer-crt-frame";
  const shellCanvas = makeCanvas(doc, geo.frameWidth, geo.frameHeight, "gazer-crt-shell");
  const glass = doc.createElement("div");
  glass.className = "gazer-crt-glass";
  const fxCanvas = makeCanvas(doc, LOGICAL_WIDTH, LOGICAL_HEIGHT, "gazer-crt-fx");
  const waveCanvas = makeCanvas(doc, LOGICAL_WIDTH, LOGICAL_HEIGHT, "gazer-crt-wave");
  const ledCanvas = makeCanvas(doc, 8, 8, "gazer-crt-led");
  const bootCanvas = makeCanvas(doc, LOGICAL_WIDTH, LOGICAL_HEIGHT, "gazer-crt-boot");
  const bloomCanvas = makeCanvas(doc, LOGICAL_WIDTH, LOGICAL_HEIGHT, "gazer-crt-bloom");
  const spillCanvas = makeCanvas(doc, geo.frameWidth, geo.frameHeight, "gazer-crt-spill");
  const dimLayer = doc.createElement("div");
  dimLayer.className = "gazer-crt-dim";
  // 新图层自带内联定位面(index.html 不在本票所有权内):波纹与压暗层填满
  // 玻璃,溢出层填满整框,全部 pointer-events 透传。
  const fill = (el: HTMLElement, inset: boolean): void => {
    el.style.position = "absolute";
    if (inset) {
      el.style.inset = "0";
    }
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.pointerEvents = "none";
    if (el instanceof HTMLCanvasElement) {
      el.style.imageRendering = "pixelated";
    }
  };
  fill(waveCanvas, true);
  fill(spillCanvas, true);
  fill(dimLayer, true);
  glass.append(fxCanvas, bloomCanvas, waveCanvas, ledCanvas, bootCanvas, dimLayer);
  frame.append(shellCanvas, glass, spillCanvas);

  // Hardware hotspots: N1(票 0040)— mounted on <body> in the ROOT stacking
  // context (position:fixed) so no #stage contain:paint context can bury them
  // under #ui; align() projects the baked bezel slots onto the canvas rect.
  const powerButton = doc.createElement("button");
  powerButton.type = "button";
  powerButton.className = "gazer-crt-hotspot";
  powerButton.setAttribute("aria-label", "power");
  const degaussButton = doc.createElement("button");
  degaussButton.type = "button";
  degaussButton.className = "gazer-crt-hotspot";
  degaussButton.setAttribute("aria-label", "degauss");
  if (mobile) {
    powerButton.addEventListener("pointerdown", () => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        options.onPowerClick?.();
      }, POWER_HOLD_MS);
    });
    const cancelHold = (): void => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    powerButton.addEventListener("pointerup", cancelHold);
    powerButton.addEventListener("pointerleave", cancelHold);
    powerButton.addEventListener("pointercancel", cancelHold);
  } else {
    powerButton.addEventListener("click", () => options.onPowerClick?.());
  }
  degaussButton.addEventListener("click", () => options.onDegaussClick?.());
  doc.body.append(powerButton, degaussButton);
  stage.append(frame);

  // Bake the shell once per session (§9); endings re-bake it deliberately.
  const shellCtx = ctx2d(shellCanvas);
  function bakeShell(opts: ShellPaintOptions = {}): void {
    shellCtx.clearRect(0, 0, geo.frameWidth, geo.frameHeight);
    paintShell(shellCtx, geo, opts, renderCounter);
  }
  bakeShell();

  // Bake the effect layer (re-baked on OSD / glare / aperture changes only).
  const fxCtx = ctx2d(fxCanvas);
  function bakeFx(): void {
    if (renderCounter.frozen()) {
      return;
    }
    paintFx(fxCtx, LOGICAL_WIDTH, LOGICAL_HEIGHT, fxParams, renderCounter);
  }
  bakeFx();

  // Live LED over the baked socket (no shell re-bake on state change).
  const ledCtx = ctx2d(ledCanvas);
  function paintLed(on: boolean): void {
    ledCtx.clearRect(0, 0, 8, 8);
    if (!on) {
      return;
    }
    ledCtx.fillStyle =
      ledState === "green"
        ? LED_GREEN
        : ledState === "amber" || ledState === "cursor_beat"
          ? LED_AMBER
          : LED_GREEN;
    ledCtx.fillRect(2, 2, 4, 4);
  }
  paintLed(true);

  /** P5: sizes the fit layer to the viewport-fit integer scale (synchronous
   * on resize so app.ts' own listener reads the new box in the same event). */
  function fitToViewport(): void {
    const vw = doc.defaultView?.innerWidth ?? stageEl.clientWidth;
    const vh = doc.defaultView?.innerHeight ?? stageEl.clientHeight;
    const fit = fitScaleFor(vw, vh, geo);
    fitDiv.style.width = `${LOGICAL_WIDTH * fit}px`;
    fitDiv.style.height = `${LOGICAL_HEIGHT * fit}px`;
  }

  /** Aligns the frame and its layers onto the world canvas' CSS box. */
  function align(): void {
    if (destroyed) {
      return;
    }
    const stageRect = stageEl.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvasRect.width / LOGICAL_WIDTH;
    if (!(scale > 0) || stageRect.width <= 0) {
      return;
    }
    // P2(票 0039):inset:0 does not size a replaced element (canvas) — the
    // shell and spill canvases get explicit CSS boxes at the same scale.
    shellCanvas.style.width = `${geo.frameWidth * scale}px`;
    shellCanvas.style.height = `${geo.frameHeight * scale}px`;
    spillCanvas.style.width = `${geo.frameWidth * scale}px`;
    spillCanvas.style.height = `${geo.frameHeight * scale}px`;
    frame.style.width = `${geo.frameWidth * scale}px`;
    frame.style.height = `${geo.frameHeight * scale}px`;
    frame.style.left = `${canvasRect.left - stageRect.left - geo.border.left * scale}px`;
    frame.style.top = `${canvasRect.top - stageRect.top - geo.border.top * scale}px`;
    glass.style.left = `${geo.border.left * scale}px`;
    glass.style.top = `${geo.border.top * scale}px`;
    glass.style.width = `${LOGICAL_WIDTH * scale}px`;
    glass.style.height = `${LOGICAL_HEIGHT * scale}px`;
    const place = (el: HTMLElement, r: Rect): void => {
      el.style.left = `${r.x * scale}px`;
      el.style.top = `${r.y * scale}px`;
      el.style.width = `${r.w * scale}px`;
      el.style.height = `${r.h * scale}px`;
    };
    place(ledCanvas, { x: geo.led.x - 1, y: geo.led.y - 1, w: 8, h: 8 });
    // N1(票 0040):hotspots live on <body> position:fixed — project the bezel
    // slots from the canvas rect so they stay glued to the baked buttons at
    // every scale, above #ui in the root stacking context.
    const placeFixed = (el: HTMLElement, r: Rect): void => {
      el.style.left = `${canvasRect.left + (r.x - geo.border.left) * scale}px`;
      el.style.top = `${canvasRect.top + (r.y - geo.border.top) * scale}px`;
      el.style.width = `${r.w * scale}px`;
      el.style.height = `${r.h * scale}px`;
    };
    placeFixed(powerButton, geo.power);
    placeFixed(degaussButton, geo.degauss);
  }
  fitToViewport();
  align();
  // The world canvas gets its CSS size inside `createApp`; one rAF later the
  // geometry is real, so re-align once the first layout has landed.
  doc.defaultView?.requestAnimationFrame(align);
  // P3(票 0039):canvas CSS size changes do not fire window resize (LCD MODE
  // and any path that skips the per-frame align) — a ResizeObserver on the
  // world canvas covers every geometry change source.
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => {
      fitToViewport();
      align();
    });
    resizeObserver.observe(canvas);
  }
  // Debounced re-align: app.ts also listens to `resize` and resizes the canvas
  // first; the fit layer must be updated synchronously (before app.ts' own
  // listener reads it), the frame positioning may wait one frame.
  let alignPending = false;
  function onResize(): void {
    if (destroyed) {
      return;
    }
    fitToViewport();
    if (alignPending) {
      return;
    }
    alignPending = true;
    doc.defaultView?.requestAnimationFrame(() => {
      alignPending = false;
      align();
    });
  }
  doc.defaultView?.addEventListener("resize", onResize);

  // ---- Boot / shutdown sequence -------------------------------------------
  const audioBeats = mobile
    ? (cold ? MOBILE_COLD_AUDIO_BEATS : MOBILE_WARM_AUDIO_BEATS)
    : (cold ? COLD_AUDIO_BEATS : WARM_AUDIO_BEATS);
  const bootCtx = ctx2d(bootCanvas);
  const waveCtx = ctx2d(waveCanvas);
  const spillCtx = ctx2d(spillCanvas);
  const reducedMotion = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)")?.matches ?? false;
  let bootStart = performance.now();
  let lastT = -1;
  let rafId = 0;

  function drawBoot(frame: BootFrame, frameIndex: number): void {
    const w = LOGICAL_WIDTH;
    const h = LOGICAL_HEIGHT;
    bootCtx.fillStyle = "#000000";
    bootCtx.fillRect(0, 0, w, h);
    if (frame.phase === "expand") {
      bootCtx.fillStyle = "#ffffff";
      bootCtx.fillRect(0, Math.round((h - frame.lineHeightPx) / 2), w, Math.max(1, frame.lineHeightPx));
      return;
    }
    if (frame.noise) {
      const rnd = noiseRandom(frameIndex + 1);
      for (let i = 0; i < 1400; i += 1) {
        const v = Math.floor(rnd() * 4);
        bootCtx.fillStyle = ["#101010", "#3a3a3a", "#7a7a7a", "#c8c8c8"][v] ?? "#101010";
        bootCtx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
      }
      return;
    }
    if (frame.bios.length > 0) {
      bootCtx.fillStyle = PHOSPHOR_GREEN;
      bootCtx.font = `8px ${CRT_FONT}`;
      bootCtx.textBaseline = "top";
      frame.bios.forEach((line, index) => {
        bootCtx.fillText(line, 8, 8 + index * 12);
      });
      return;
    }
    if (frame.splash) {
      const cell = 4;
      const logoW = SPLASH_LOGO_MASK[0]?.length ?? 8;
      const logoH = SPLASH_LOGO_MASK.length;
      const ox = Math.round((w - logoW * cell) / 2);
      const oy = 56;
      bootCtx.fillStyle = PHOSPHOR_GREEN;
      SPLASH_LOGO_MASK.forEach((row, y) => {
        for (let x = 0; x < row.length; x += 1) {
          if (row[x] === "o") {
            bootCtx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
          }
        }
      });
      bootCtx.textBaseline = "top";
      const tagWidth = bootCtx.measureText(SPLASH_TAGLINE).width;
      bootCtx.fillText(SPLASH_TAGLINE, Math.round((w - tagWidth) / 2), oy + logoH * cell + 14);
      return;
    }
    if (frame.blocks > 0 || frame.phase === "progress") {
      const blockW = 18;
      const gap = 6;
      const total = PROGRESS_BLOCKS * blockW + (PROGRESS_BLOCKS - 1) * gap;
      const ox = Math.round((w - total) / 2);
      const oy = 120;
      for (let i = 0; i < PROGRESS_BLOCKS; i += 1) {
        if (i < frame.blocks) {
          bootCtx.fillStyle = PHOSPHOR_GREEN;
          bootCtx.fillRect(ox + i * (blockW + gap), oy, blockW, 12);
        } else {
          bootCtx.fillStyle = "#1a3320";
          bootCtx.fillRect(ox + i * (blockW + gap), oy, blockW, 12);
        }
      }
    }
  }

  function showBoot(): void {
    bootFinished = false;
    bootCanvas.style.display = "";
    lastT = -1;
  }

  function finishBoot(): void {
    bootFinished = true;
    bootCanvas.style.display = "none";
  }

  function tickBoot(): void {
    if (destroyed || bootFinished) {
      return;
    }
    const t = performance.now() - bootStart;
    align();
    // LCD MODE: everything off — the boot performance is not played at all.
    if (lcdMode || reducedMotion) {
      finishBoot();
      return;
    }
    if (lastT >= 0) {
      for (const beat of beatsCrossed(audioBeats, lastT, t)) {
        onAudioBeat(beat);
      }
    }
    const frame = bootFrame(t, cold, {
      ...(options.memoryK !== undefined ? { memoryK: options.memoryK } : {}),
      ...(options.settlementName !== undefined ? { settlementName: options.settlementName } : {}),
      ...(options.biosExtraLines !== undefined ? { biosExtraLines: options.biosExtraLines } : {}),
      ...(mobile ? { mobile: true } : {}),
    });
    if (frame.phase === "done") {
      finishBoot();
      return;
    }
    drawBoot(frame, Math.floor(t / 16.7));
    renderCounter.bump("boot");
    lastT = t;
    rafId = doc.defaultView?.requestAnimationFrame(tickBoot) ?? 0;
  }

  rafId = doc.defaultView?.requestAnimationFrame(tickBoot) ?? 0;

  // ---- Persistent animation loop: degauss wave + ending spill -------------
  // Runs always but only paints while a performance is active; the shell and
  // the effect layer are never re-baked here (§9).
  function drawWave(nowMs: number): void {
    const progress = degaussWaveProgress(waveStart, nowMs);
    if (progress === null) {
      waveCanvas.style.display = "none";
      return;
    }
    waveCanvas.style.display = "";
    waveCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    // 彩虹波纹:中心扩散的同心环,相位确定性推进,0.8s 后自熄。
    const cx = LOGICAL_WIDTH / 2;
    const cy = LOGICAL_HEIGHT / 2;
    const maxR = Math.hypot(cx, cy);
    const rings = 7;
    const colors = ["#ff8888", "#ffd488", "#f8ff88", "#88ff9a", "#88d8ff", "#a088ff", "#ff88e8"];
    for (let i = 0; i < rings; i += 1) {
      const p = Math.max(0, progress * (1 + i / rings) - i / (rings * 2));
      const r = p * maxR;
      if (r <= 0) {
        continue;
      }
      waveCtx.strokeStyle = colors[i % colors.length] ?? "#ffffff";
      waveCtx.globalAlpha = 0.6 * (1 - progress);
      waveCtx.lineWidth = 3;
      waveCtx.beginPath();
      waveCtx.arc(cx, cy, r, 0, Math.PI * 2);
      waveCtx.stroke();
    }
    waveCtx.globalAlpha = 1;
  }

  function drawSpill(nowMs: number): void {
    if (endingKind !== "fusion" || endingProgress <= 0) {
      spillCanvas.style.display = "none";
      return;
    }
    spillCanvas.style.display = "";
    const w = geo.frameWidth;
    const h = geo.frameHeight;
    spillCtx.clearRect(0, 0, w, h);
    if (endingProgress >= 1) {
      // 框是最后一个消失的:全黑。
      spillCtx.fillStyle = "#000000";
      spillCtx.fillRect(0, 0, w, h);
      return;
    }
    // 静态噪点溢出屏幕边界爬上外壳:覆盖面积随溶解进度扩张,确定性帧序。
    const rnd = noiseRandom(spillFrame + 0x5f17);
    spillFrame += 1;
    const s = geo.screen;
    const spill = Math.floor(28 * endingProgress);
    const count = Math.floor(400 * endingProgress) + 40;
    for (let i = 0; i < count; i += 1) {
      const x = Math.floor(rnd() * w);
      const y = Math.floor(rnd() * h);
      const insideScreen = x >= s.x - spill && x < s.x + s.w + spill && y >= s.y - spill && y < s.y + s.h + spill;
      if (insideScreen && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) {
        // 屏幕内部留给世界与效果层,噪点只爬边框。
        continue;
      }
      const v = Math.floor(rnd() * 4);
      spillCtx.fillStyle = ["#101010", "#3a3a3a", "#7a7a7a", "#c8c8c8"][v] ?? "#101010";
      spillCtx.fillRect(x, y, 1, 1);
    }
    void nowMs;
  }

  // G-4(票 0045):bloom 两点辉光。预烘焙径向渐变 sprite(磷光绿),按
  // 点位 drawImage 叠放;点位签名不变则零重绘(§9 禁逐帧)。
  const bloomCtx = ctx2d(bloomCanvas);
  const bloomSprite = doc.createElement("canvas");
  bloomSprite.width = BLOOM_RADIUS_PX * 2;
  bloomSprite.height = BLOOM_RADIUS_PX * 2;
  (function bakeBloomSprite(): void {
    const ctx = bloomSprite.getContext("2d");
    if (ctx === null) {
      return;
    }
    const gradient = ctx.createRadialGradient(
      BLOOM_RADIUS_PX,
      BLOOM_RADIUS_PX,
      1,
      BLOOM_RADIUS_PX,
      BLOOM_RADIUS_PX,
      BLOOM_RADIUS_PX,
    );
    gradient.addColorStop(0, `rgba(120, 255, 170, ${BLOOM_ALPHA})`);
    gradient.addColorStop(0.55, `rgba(80, 220, 140, ${BLOOM_ALPHA * 0.45})`);
    gradient.addColorStop(1, "rgba(60, 200, 130, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BLOOM_RADIUS_PX * 2, BLOOM_RADIUS_PX * 2);
  })();
  let bloomSignature = "";
  function drawBloom(points: readonly BloomPoint[]): void {
    const accepted = bloomPaintOps(points);
    const signature = accepted.map((p) => `${p.kind}:${p.x},${p.y}`).join("|");
    if (signature === bloomSignature) {
      return;
    }
    bloomSignature = signature;
    bloomCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    for (const point of accepted) {
      bloomCtx.drawImage(
        bloomSprite,
        point.x - BLOOM_RADIUS_PX,
        point.y - BLOOM_RADIUS_PX,
      );
    }
  }

  function animLoop(): void {
    if (destroyed) {
      return;
    }
    const nowMs = performance.now();
    drawWave(nowMs);
    drawSpill(nowMs);
    // G-7(票 0045):真结局 1s 撤走序列——边框与玻璃线性溶解,序列走完才
    // 隐藏图层并冻结渲染计数(§10.10 的"序列结束后 = 0")。
    if (dissolveStart >= 0 && !renderCounter.frozen()) {
      const alpha = dissolveAlphaAt(nowMs - dissolveStart);
      shellCanvas.style.opacity = String(alpha);
      fxCanvas.style.opacity = String(alpha);
      ledCanvas.style.opacity = String(alpha);
      frame.style.boxShadow = `0 ${shadowPx}px ${shadowPx}px rgba(0, 0, 0, ${0.55 * alpha})`;
      if (alpha <= 0) {
        dissolveStart = -1;
        shellCanvas.style.display = "none";
        glass.style.display = "none";
        spillCanvas.style.display = "none";
        frame.style.boxShadow = "none";
        renderCounter.freeze();
      }
    }
    if (shutdownAt >= 0) {
      const t = nowMs - shutdownAt;
      if (t < SHUTDOWN_SHRINK_MS) {
        // 白色横线收缩至中心(§4 正常关机)。
        showBoot();
        const p = 1 - t / SHUTDOWN_SHRINK_MS;
        bootCtx.fillStyle = "#000000";
        bootCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        bootCtx.fillStyle = "#ffffff";
        const hLine = Math.max(1, Math.round(LOGICAL_HEIGHT * p));
        bootCtx.fillRect(0, Math.round((LOGICAL_HEIGHT - hLine) / 2), LOGICAL_WIDTH, hLine);
      } else if (t < SHUTDOWN_SHRINK_MS + SHUTDOWN_BLACK_HOLD_MS) {
        bootCtx.fillStyle = "#000000";
        bootCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      } else {
        // 1s 后自动冷启动(玩家不会真退出游戏)。
        shutdownAt = -1;
        showBoot();
        bootStart = nowMs;
        rafId = doc.defaultView?.requestAnimationFrame(tickBoot) ?? 0;
      }
    }
    animRafId = doc.defaultView?.requestAnimationFrame(animLoop) ?? 0;
  }
  animRafId = doc.defaultView?.requestAnimationFrame(animLoop) ?? 0;

  const handle: CrtShellHandle = {
    setLed(state: LedState): void {
      ledState = state;
      paintLed(state !== "off");
    },
    tickLed(nowMs: number): void {
      if (ledState !== "cursor_beat") {
        return;
      }
      paintLed(ledBeatVisible(nowMs, ledPhaseMs));
    },
    setLcdMode(on: boolean): void {
      lcdMode = on;
      fxCanvas.style.display = on ? "none" : "";
      ledCanvas.style.display = on ? "none" : "";
      waveCanvas.style.display = on ? "none" : waveCanvas.style.display;
      if (on && !bootFinished) {
        finishBoot();
      }
    },
    isLcdMode(): boolean {
      return lcdMode;
    },
    setAperture(on: boolean): void {
      fxParams.aperture = on;
      bakeFx();
    },
    setScanlineAlpha(alpha: number): void {
      const safe = Number.isFinite(alpha) ? Math.min(0.5, Math.max(0, alpha)) : 0;
      fxParams.scanlineAlpha = safe;
      bakeFx();
    },
    setGlare(alpha: number, nowMs: number): void {
      const safe = Number.isFinite(alpha) ? Math.max(0, alpha) : 0;
      if (safe === glareAlpha) {
        return;
      }
      glareAlpha = safe;
      fxParams.glareAlpha = safe;
      glareHistory.push({ alpha: safe, atMs: nowMs });
      bakeFx();
    },
    glareLog(): readonly GlareLogEntry[] {
      return [...glareHistory];
    },
    setShadowDepth(px: number): void {
      const safe = Number.isFinite(px) ? Math.max(0, px) : DROP_SHADOW_BASE_PX;
      shadowPx = safe;
      frame.style.boxShadow = `0 ${safe}px ${safe}px rgba(0, 0, 0, 0.55)`;
    },
    shutdown(): void {
      if (destroyed || renderCounter.frozen()) {
        return;
      }
      shutdownAt = performance.now();
    },
    dimRebound(): void {
      if (destroyed || renderCounter.frozen()) {
        return;
      }
      dimLayer.style.background = `rgba(0, 0, 0, ${POWER_DIM_AMOUNT})`;
      if (reboundTimer !== null) {
        clearTimeout(reboundTimer);
      }
      reboundTimer = setTimeout(() => {
        reboundTimer = null;
        dimLayer.style.background = "transparent";
      }, POWER_DIM_MS);
    },
    degauss(nowMs: number): void {
      if (destroyed || renderCounter.frozen() || lcdMode) {
        return;
      }
      waveStart = nowMs;
    },
    setEnding(kind: string | null, progress: number, sessions: number): void {
      if (destroyed) {
        return;
      }
      endingKind = kind;
      endingProgress = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
      endingSessions = sessions;
      if (kind === null) {
        bakeShell();
        spillCanvas.style.display = "none";
        return;
      }
      const frameSpec = endingFrameFor(kind, endingProgress, endingSessions);
      if (frameSpec.fullbleed) {
        // 真·凝视(G-7,票 0045):1s 撤走序列——塔化黑 / it is done 落定
        // 后边框与玻璃线性溶解,序列走完才隐藏图层、清零并冻结渲染计数
        // (§10.10 的"序列结束后 = 0");替代此前的瞬时切换。
        if (dissolveStart < 0) {
          dissolveStart = performance.now();
        }
        return;
      }
      if (frameSpec.glareAlpha !== null) {
        handle.setGlare(frameSpec.glareAlpha, performance.now());
      }
      if (kind === "forgetting") {
        bakeShell({ aged: frameSpec.aging, dust: frameSpec.dust });
      }
    },
    setBloom(points: readonly BloomPoint[]): void {
      if (destroyed || renderCounter.frozen()) {
        return;
      }
      drawBloom(points);
    },
    skip(): boolean {
      if (bootFinished || destroyed) {
        return false;
      }
      const t = performance.now() - bootStart;
      const target = skipTarget(t, { cold, firstBoot });
      if (target === null) {
        return false;
      }
      bootStart = performance.now() - target;
      lastT = -1;
      return true;
    },
    bootDone(): boolean {
      return bootFinished;
    },
    renderCalls(): RenderCallSnapshot {
      return renderCounter.snapshot();
    },
    destroy(): void {
      destroyed = true;
      resizeObserver?.disconnect();
      for (const id of [rafId, animRafId]) {
        if (id !== 0) {
          doc.defaultView?.cancelAnimationFrame(id);
        }
      }
      if (reboundTimer !== null) {
        clearTimeout(reboundTimer);
      }
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
      }
      doc.defaultView?.removeEventListener("resize", onResize);
      // Hotspots live on <body> (root stacking context) — remove them too.
      powerButton.remove();
      degaussButton.remove();
      frame.remove();
    },
  };

  // Skip gesture: a click on the dark screen (after 1.4s, never first boot).
  bootCanvas.addEventListener("pointerdown", () => {
    handle.skip();
  });

  return handle;
}
