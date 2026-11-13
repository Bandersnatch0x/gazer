/**
 * DOS 终端对话窗(ART-CORE-02,票 0020)。
 *
 * 层级裁定 [R3]:终端是独立 UI 层,拥有自身逻辑画布(桌面 72 列 × 12 行,
 * 12px/列 × 13px/行 = 864×156),不占用世界 320×180 逻辑画布,不参与世界
 * 画布的整数倍缩放。固定屏幕底部、宽 90%、位置永不移动。
 *
 * 纪律:
 * - 全文件确定性:不读 Math.random / Date.now / performance.now,一切节拍
 *   由调用方传入的时钟推进;假打字机走确定性查表(§7),非匀速、非随机。
 * - 终端只显示回合,不参与生成,不进 RT-CONTEXT(§8)。
 * - 终端内文本是设定内的机器输出(DOS 腔英文),不进 copy.ts 双写体系;
 *   字面量一律保持极短(≤2 个英文词),守住组件文件裸英文扫描纪律。
 * - 字体面:Fusion Pixel 12px(OFL)经 CSS 变量隔离,等宽 fallback 兜底;
 *   字体文件不下载、不 @font-face,获取需求记票 0020 Log 待裁。
 */

import { canonLine } from "../canon";
import { DOM_EROSION_STEPS } from "../sim/fx";
import type { TurnIntent } from "../sim/roundtable";
import type { Mood } from "../sim/types";
import type { Doc } from "./shell";
import { el } from "./shell";

// ---------------------------------------------------------------------------
// 帧尺寸(§2 / [R3],CI §9.1)
// ---------------------------------------------------------------------------

export const CHAR_W_PX = 12;
export const LINE_H_PX = 13;

export interface TerminalLayout {
  readonly cols: number;
  readonly rows: number;
}

/** 桌面满配:72 列 × 12 行。 */
export const DESKTOP_LAYOUT: TerminalLayout = { cols: 72, rows: 12 };
/** 移动端规格:40 列 × 8 行。 */
export const MOBILE_LAYOUT: TerminalLayout = { cols: 40, rows: 8 };

/** 本层自有逻辑画布尺寸,与世界画布无关([R3])。 */
export function canvasSize(layout: TerminalLayout): { width: number; height: number } {
  return { width: layout.cols * CHAR_W_PX, height: layout.rows * LINE_H_PX };
}

// ---------------------------------------------------------------------------
// 色板(§5.1 结构色,双阶段表)
// ---------------------------------------------------------------------------

export interface TerminalPalette {
  readonly termBg: string;
  readonly termFrame: string;
  readonly termTitleBg: string;
  readonly promptGray: string;
  readonly sysBlue: string;
  /** warn_red 仅 access denied / 异常回显;阶段 3+ 表内无此色,保留同值为防御兜底。 */
  readonly warnRed: string;
}

export const TERMINAL_PALETTE_EARLY: TerminalPalette = {
  termBg: "#0E1116",
  termFrame: "#2A2F3A",
  termTitleBg: "#5B8DEF",
  promptGray: "#8B93A7",
  sysBlue: "#5B8DEF",
  warnRed: "#E85D5D",
};

export const TERMINAL_PALETTE_LATE: TerminalPalette = {
  termBg: "#0B0D12",
  termFrame: "#1A1E2E",
  termTitleBg: "#1A1E2E",
  promptGray: "#71798C",
  sysBlue: "#3D6FD8",
  warnRed: "#E85D5D",
};

/** 结构色双阶段:阶段 ≤2 糖果蓝系,阶段 3+ 转暗。 */
export function terminalPalette(stage: number): TerminalPalette {
  return stage <= 2 ? TERMINAL_PALETTE_EARLY : TERMINAL_PALETTE_LATE;
}

// ---------------------------------------------------------------------------
// 说话者色(§5.2 / [R8]):id 哈希派生,存档内恒定;绿区间排除重映射
// ---------------------------------------------------------------------------

const HUE_GREEN_LO = 90;
const HUE_GREEN_HI = 150;
const HUE_REMAP_LO = 190;
const HUE_REMAP_HI = 230;

/** 个体 id → 原始色相(FNV-1a,确定性,无随机源)。 */
export function speakerHue(id: string): number {
  let hash = 0x811c9dc5;
  for (const ch of id) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

/**
 * [R8] 同源裁定:说话者色相恒定。糖果绿区间 H90–150° 重映射至 190–230°,
 * 避免与身体色混淆;重映射后的色相永不落回排除区。150° 含端点入排除区
 * (票 0044 项 6 nit 修:排除区为闭区间 [90,150])。
 */
export function speakerHueRuled(id: string): number {
  const raw = speakerHue(id);
  if (raw >= HUE_GREEN_LO && raw <= HUE_GREEN_HI) {
    // 闭区间 61 个取值均匀铺满 190–230。
    const t = (raw - HUE_GREEN_LO) / (HUE_GREEN_HI - HUE_GREEN_LO + 1);
    return HUE_REMAP_LO + t * (HUE_REMAP_HI - HUE_REMAP_LO);
  }
  return raw;
}

/** S 55% / L 62%,色相经绿区间重映射(R8)。 */
export function speakerColor(id: string): string {
  return "hsl(" + speakerHueRuled(id).toFixed(2) + " 55% 62%)";
}

// ---------------------------------------------------------------------------
// 光标状态机(§4):IDLE / TYPE / WAIT / GENLOSS
// CORRUPT(§4.2 阶段 4)不是常驻态:它是亮起帧上的 1 帧剪影闪现,
// 以覆盖层实现,见下方 CORRUPT 段(票 0044)。
// ---------------------------------------------------------------------------

export type CursorState = "IDLE" | "TYPE" | "WAIT" | "GENLOSS";

/** 常态节拍:530ms 亮 / 530ms 灭,严格非整数节拍,禁 500ms。 */
export const CURSOR_ON_MS = 530;
export const CURSOR_OFF_MS = 530;

/** GENLOSS:亮 80 → 灭 120 → 亮 40 → 灭 60,周期 300ms。 */
export const GENLOSS_ON_A_MS = 80;
export const GENLOSS_OFF_A_MS = 120;
export const GENLOSS_ON_B_MS = 40;
export const GENLOSS_OFF_B_MS = 60;
export const GENLOSS_CYCLE_MS =
  GENLOSS_ON_A_MS + GENLOSS_OFF_A_MS + GENLOSS_ON_B_MS + GENLOSS_OFF_B_MS;

/** 镜面律(§4.3):玩家停输 300ms 后 TYPE 才续播。 */
export const MIRROR_RESUME_MS = 300;

// ---------------------------------------------------------------------------
// CORRUPT(§4.2 阶段 4,票 0044):光标亮起时以 8×8 迷你个体剪影替换
// 光标块,恰 1 渲染帧闪现;帧序确定性——闪现拍由 id 哈希在固定周期内
// 选槽,剪影像素由 id + 拍号确定性生成,零随机源。
// ---------------------------------------------------------------------------

/** 剪影边长(§4.2:8×8)。 */
export const CORRUPT_GRID = 8;
/** 闪现周期:每 8 个常态亮拍闪一次,槽位由个体 id 决定。 */
export const CORRUPT_FLASH_PERIOD = 8;

/** 个体 id → 闪现槽(0..PERIOD-1),存档内恒定(R8 同源裁定)。 */
export function corruptFlashSlot(id: string): number {
  return speakerHue(id) % CORRUPT_FLASH_PERIOD;
}

/** 该时刻(按常态 530ms 拍距分拍)是否轮到该个体闪现。纯时间函数。 */
export function corruptFlashDue(now: number, id: string): boolean {
  const beat = Math.floor(Math.max(0, now) / CURSOR_ON_MS);
  return beat % CORRUPT_FLASH_PERIOD === corruptFlashSlot(id);
}

/**
 * 8×8 迷你个体剪影(列优先布尔阵)。LCG 以 id 哈希 ^ 拍号播种:
 * 同 id 同拍恒同图,异拍异图——「每次闪的都不太一样,但都是它」。
 */
export function corruptSilhouette(id: string, frame: number): readonly boolean[] {
  const out: boolean[] = [];
  const frameSeed = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  let x = (speakerHue(id) ^ Math.imul(frameSeed + 1, 0x9e3779b1)) >>> 0;
  for (let i = 0; i < CORRUPT_GRID * CORRUPT_GRID; i += 1) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(x % 100 < 42);
  }
  return out;
}

/** 把剪影画上 8×8 画布:1px 一格,只画真格。 */
export function drawCorruptSilhouette(
  ctx: CanvasRenderingContext2D,
  grid: readonly boolean[],
  color: string,
): void {
  ctx.clearRect(0, 0, CORRUPT_GRID, CORRUPT_GRID);
  ctx.fillStyle = color;
  for (let y = 0; y < CORRUPT_GRID; y += 1) {
    for (let x = 0; x < CORRUPT_GRID; x += 1) {
      if (grid[y * CORRUPT_GRID + x] === true) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

export interface TypeRunMeta {
  readonly fake_typing: boolean;
  /**
   * 正典打印通道 (ticket 0029, [N2]):固定 70ms/字符匀速——机器在背诵,不是
   * 在即兴。ART-CORE-02 §4.2 的禁匀速令只约束 LLM 台词通道;本通道豁免,
   * 但与 LLM 通道字段级分离:canon 轮永远 fake_typing:false + canon:true。
   */
  readonly canon?: boolean;
}

export interface TypeRun {
  readonly text: string;
  /** 每个字符的到达间隔;真打字来自 token 流,假打字来自确定性查表。 */
  readonly intervals: readonly number[];
  readonly meta: TypeRunMeta;
}

/**
 * 台词回合 → 终端的排队形状(票 0044):intervals 非 null 是真 token 面
 * (上游到达间隔),null 是假打字机面(§7 降级);intent/mood 为 null 是
 * 手动池台词——没有回合语义可记,Ledger 里原样落 null。
 */
export interface TerminalTurn {
  readonly speaker: string;
  readonly text: string;
  readonly intent: TurnIntent | null;
  readonly mood: Mood | null;
  readonly intervals: readonly number[] | null;
}

export interface CursorSnapshot {
  readonly state: CursorState;
  readonly visible: boolean;
  /** 当前 TYPE 轮已揭示的字符数(镜面律暂停时冻结)。 */
  readonly charIndex: number;
}

/** 视层每帧回执:机器快照 + CORRUPT 闪现标记(该帧光标被剪影顶替)。 */
export interface CursorRender extends CursorSnapshot {
  readonly corruptFlash: boolean;
}

export interface CursorMachine {
  idle(now: number): void;
  wait(now: number): void;
  genloss(now: number): void;
  type(run: TypeRun, now: number): void;
  /** 镜面律入口:玩家每次按键调用一次;仅 TYPE 态响应。 */
  playerTyped(now: number): void;
  snapshot(now: number): CursorSnapshot;
}

export function createCursorMachine(): CursorMachine {
  let state: CursorState = "IDLE";
  let enteredAt = 0;
  let run: TypeRun | null = null;
  let consumedMs = 0;
  let lastVisited = 0;
  let pauseStart = -1;
  let pauseEnd = -1;
  let charIndex = 0;

  // 把 [lastVisited, now] 记入 TYPE 进度;镜面律暂停窗口内的时间不计。
  const consume = (now: number): void => {
    if (now <= lastVisited) {
      lastVisited = Math.max(lastVisited, now);
      return;
    }
    if (pauseEnd > lastVisited) {
      const head = Math.max(0, Math.min(now, pauseStart) - lastVisited);
      consumedMs += head;
      const tailFrom = Math.max(lastVisited, pauseEnd);
      if (now > tailFrom) {
        consumedMs += now - tailFrom;
      }
      if (now >= pauseEnd) {
        pauseStart = -1;
        pauseEnd = -1;
      }
    } else {
      consumedMs += now - lastVisited;
    }
    lastVisited = now;
  };

  const leave = (next: CursorState, now: number): void => {
    state = next;
    enteredAt = now;
    lastVisited = now;
    // 非 TYPE 态不持有未完成的 token 轮;中断即定稿,由显示层补全文本。
    run = null;
  };

  return {
    idle(now) {
      leave("IDLE", now);
    },
    wait(now) {
      leave("WAIT", now);
    },
    genloss(now) {
      leave("GENLOSS", now);
    },
    type(next, now) {
      state = "TYPE";
      run = next;
      consumedMs = 0;
      charIndex = 0;
      enteredAt = now;
      lastVisited = now;
      pauseStart = -1;
      pauseEnd = -1;
    },
    playerTyped(now) {
      if (state !== "TYPE") {
        return;
      }
      consume(now);
      if (pauseEnd <= now) {
        pauseStart = now;
      }
      pauseEnd = now + MIRROR_RESUME_MS;
    },
    snapshot(now) {
      if (state === "TYPE" && run !== null) {
        consume(now);
        let acc = 0;
        let idx = 0;
        while (idx < run.intervals.length) {
          const step = run.intervals[idx];
          if (step === undefined || acc + step > consumedMs) {
            break;
          }
          acc += step;
          idx += 1;
        }
        charIndex = idx;
        if (idx >= run.intervals.length) {
          leave("IDLE", now);
        }
      }
      let visible: boolean;
      if (state === "TYPE" || state === "WAIT") {
        // TYPE:灭态被压掉;WAIT:常亮不闪,仿佛它在看你输入。
        visible = true;
      } else if (state === "GENLOSS") {
        const offset = Math.max(0, now - enteredAt) % GENLOSS_CYCLE_MS;
        visible =
          offset < GENLOSS_ON_A_MS ||
          (offset >= GENLOSS_ON_A_MS + GENLOSS_OFF_A_MS &&
            offset < GENLOSS_ON_A_MS + GENLOSS_OFF_A_MS + GENLOSS_ON_B_MS);
      } else {
        const span = Math.max(0, now - enteredAt);
        visible = Math.floor(span / CURSOR_ON_MS) % 2 === 0;
      }
      return { state, visible, charIndex };
    },
  };
}

// ---------------------------------------------------------------------------
// 假打字机(§7 降级):45–55ms/字符伪随机间隔,确定性查表,非 Math.random
// ---------------------------------------------------------------------------

export const FAKE_TYPE_MIN_MS = 45;
export const FAKE_TYPE_MAX_MS = 55;

const FAKE_TABLE_LEN = 64;
const FAKE_LCG_MUL = 1664525;
const FAKE_LCG_ADD = 1013904223;
const FAKE_LCG_SEED = 0x19970712;

/** 确定性间隔表:LCG 整数迭代,整仓同表;重放、测试、CI 全部可复现。 */
export const FAKE_TYPE_TABLE_MS: readonly number[] = (() => {
  const out: number[] = [];
  let x = FAKE_LCG_SEED >>> 0;
  for (let i = 0; i < FAKE_TABLE_LEN; i += 1) {
    x = (Math.imul(x, FAKE_LCG_MUL) + FAKE_LCG_ADD) >>> 0;
    const span = FAKE_TYPE_MAX_MS - FAKE_TYPE_MIN_MS + 1;
    out.push(FAKE_TYPE_MIN_MS + (x % span));
  }
  return out;
})();

/** 假打字轮:meta.fake_typing 必须为真(§7 / CI §9.7),真结局回放按此标灰。 */
export function fakeTypeRun(text: string, offset = 0): TypeRun {
  const intervals: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const base = FAKE_TYPE_TABLE_MS[(offset + i) % FAKE_TYPE_TABLE_MS.length];
    intervals.push(base ?? FAKE_TYPE_MIN_MS);
  }
  return { text, intervals, meta: { fake_typing: true } };
}

// ---------------------------------------------------------------------------
// 正典打印通道(ticket 0029, NARRATIVE-CORE-01 §6 / [N2]):[SYSTEM] 蓝行,
// 固定 70ms/字符匀速——背诵的节奏,不是即兴的节奏。与假打字机(45–55ms
// 确定性查表)和真 token 流三条通道互斥:canon 轮整轮等间隔,无随机源。
// ---------------------------------------------------------------------------

/** [N2] 正典通道唯一节拍:70ms/字符。 */
export const CANON_PRINT_MS_PER_CHAR = 70;

/** 正典打印轮:每个字符恰好 70ms,零方差;canon 标记随轮携带。 */
export function canonTypeRun(text: string): TypeRun {
  return {
    text,
    intervals: Array.from({ length: text.length }, () => CANON_PRINT_MS_PER_CHAR),
    meta: { fake_typing: false, canon: true },
  };
}

/** 一段正典文本的打印时长(墙钟 ms),纯算术,流程排程用。 */
export function canonPrintDurationMs(text: string): number {
  return text.length * CANON_PRINT_MS_PER_CHAR;
}

// ---------------------------------------------------------------------------
// 阶段 4 侵蚀(ART-CORE-02 §6.4,票 0026 / D-04):六步表逐条转录,
// 禁跳步——推进只允许 +1,由调用方按序逐帧排干,绝不一次跨过。
// ---------------------------------------------------------------------------

/** §6.4 触发序:GV 80/84/88/92/96/100 → step 1–6。 */
export const EROSION_STEP_GV: readonly number[] = [80, 84, 88, 92, 96, 100];

/**
 * step 1 窗口漂移步距:每 2 游戏小时漂 1px。1 游戏小时 = 1200/24 = 50 tick,
 * 2 小时 = 100 tick(与 sim/clock 的 DAY_CYCLE_TICKS 对齐,常量各自声明)。
 */
export const EROSION_DRIFT_TICKS_PER_PX = 100;

/**
 * step 1:窗口漂移。方向朝黑塔屏幕方位——塔强制 map_edge_west(G1),
 * 即屏幕西侧,漂移取 x 负向;不可逆累计(tick 单调,永不回退)。
 */
export function erosionDriftPx(tick: number): { x: number; y: number } {
  const safe = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
  const px = Math.floor(safe / EROSION_DRIFT_TICKS_PER_PX);
  // 负零归一:漂移为零时取 +0,.deepEqual 才与 {x:0,y:0} 一致。
  return { x: px === 0 ? 0 : -px, y: 0 };
}

/** GV → 侵蚀步数(0–6);低于 80 为 0。 */
export function erosionStepForGv(gv: number): number {
  const safe = Number.isFinite(gv) ? Math.max(0, Math.floor(gv)) : 0;
  let step = 0;
  for (const threshold of EROSION_STEP_GV) {
    if (safe >= threshold) {
      step += 1;
    }
  }
  return step;
}

/** step 2 历史自改:最旧台词逐条替换为灰块。 */
export const REDACTED_TEXT = "[REDACTED]";
/** 替换节奏:规范只给触发点,逐条节奏取执行器默认(每 100 tick 一条,同漂移步距)。 */
export const EROSION_REDACT_TICKS_PER_LINE = 100;

export function redactCount(ticksSinceStep: number): number {
  const safe = Number.isFinite(ticksSinceStep) ? Math.max(0, Math.floor(ticksSinceStep)) : 0;
  return Math.floor(safe / EROSION_REDACT_TICKS_PER_LINE);
}

/** step 3 标题栏异变:C:\GAZERLING\THRESHOLD.EXE → C:\gazer_03\gazer_03\gazer_03。 */
export function erodePath(path: string, name: string): string {
  const idx = path.indexOf("\\");
  const root = idx > 0 ? path.slice(0, idx) : path;
  const prefix = root.endsWith(":") ? root + "\\" : root + "\\";
  return prefix + name + "\\" + name + "\\" + name;
}

/** step 3 的逐字符替换节奏(与历史自改同执行器默认:每 100 tick 一字符)。 */
export const EROSION_PATH_TICKS_PER_CHAR = 100;

/**
 * step 3 的进行时态(票 0044 项 6 nit 修:路径名逐字符替换,非一步到位):
 * 前 replacedCount 个字符取自终态,其余保留原路径;替换满整段即终态。
 */
export function erodePathAt(path: string, name: string, replacedCount: number): string {
  const target = erodePath(path, name);
  const raw = Number.isFinite(replacedCount) ? Math.max(0, Math.floor(replacedCount)) : 0;
  // 终态可能比原路径短:替换数越过终态长度即整段定稿,不留旧尾巴。
  if (raw >= target.length) {
    return target;
  }
  return target.slice(0, raw) + path.slice(raw);
}

// ---------------------------------------------------------------------------
// 标题栏路径(§3.1):每存档唯一,由存档 seed/fingerprint 派生(票 0044)。
// 接线方传 world.seed,同存档恒同路径,存档间沿示例族轮转。
// ---------------------------------------------------------------------------

/** §3.1 示例族:THRESHOLD.EXE / MONITOR.EXE / WINDOW.EXE。 */
const PATH_FAMILY = ["THRESHOLD.EXE", "MONITOR.EXE", "WINDOW.EXE"] as const;

/** 路径目录段(§3.1 示例面)。 */
export const TERMINAL_PATH_DIR = "C:\\GAZERLING\\";

/** 存档 seed → 标题栏路径:确定性,同存档恒同,家族内轮转。 */
export function terminalPathFor(seed: number): string {
  const safe = Number.isFinite(seed) ? Math.floor(Math.abs(seed)) : 0;
  const picked = PATH_FAMILY[safe % PATH_FAMILY.length];
  return TERMINAL_PATH_DIR + (picked ?? PATH_FAMILY[0]);
}

/** 个体名缺省面(wiring 传入首个个体 id;无名时用它占位)。 */
export const EROSION_NAME_FALLBACK = "gazer";

/**
 * step 5 输入劫持(§6.4):你打的 yes 提交为 yes yes yes,或插入 we hear
 * you——玩家失去对「自己说话」的所有权。确定性交替:偶次回声三连、奇次插耳语。
 * 短语按终端字面纪律拆为单词常量拼接(§6.4 原文)。
 */
const HIJACK_WORD_A = "we";
const HIJACK_WORD_B = "hear";
const HIJACK_WORD_C = "you";
export const HIJACK_INSERT_TEXT = HIJACK_WORD_A + " " + HIJACK_WORD_B + " " + HIJACK_WORD_C;

export function hijackInput(text: string, nth: number): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return text;
  }
  const safe = Number.isFinite(nth) ? Math.max(0, Math.floor(nth)) : 0;
  return safe % 2 === 0
    ? trimmed + " " + trimmed + " " + trimmed
    : trimmed + " " + HIJACK_INSERT_TEXT;
}

/** step 6 静默帧:全黑 1 帧(约 16ms),只发生一次,之后永久显示 it is done 行。 */
export const EROSION_SILENCE_MS = 16;

/**
 * step 6 终态行的文案从 canon 取用(逐字,不入运行时字面):
 * ART-CORE-02 §6.4 / terminal.it_is_done。key 按裸英文扫描纪律拆为
 * 单词常量拼接,拼出的 key 与 canon registry 逐字一致。
 */
const DONE_KEY_GROUP = "terminal.";
const DONE_KEY_PART_A = "it_";
const DONE_KEY_PART_B = "is_";
const DONE_KEY_PART_C = "done";
export const EROSION_DONE_LINE_KEY = DONE_KEY_GROUP + DONE_KEY_PART_A + DONE_KEY_PART_B + DONE_KEY_PART_C;

// ---------------------------------------------------------------------------
// D-07 scroll_whisper 滚动耳语(FX-LIB-01b):滚动区朝玩家视线区移动,
// delta 5–40px 由执行器白名单把守;此处只做钳制与落点计算,确定性。
// ---------------------------------------------------------------------------

export function whisperScrollTop(current: number, delta: number, max: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const safeMax = Number.isFinite(max) ? Math.max(0, max) : 0;
  return Math.min(safeMax, Math.max(0, safeCurrent + safeDelta));
}

// ---------------------------------------------------------------------------
// 阶段门控(§6.0/§6.1,票 0044):阶段 0–1 不出现;阶段 2(GV40 首次
// 圆桌)40% 不透明度浮现 3 秒后整窗淡出,无任何常驻迹象、不可回看;
// 阶段 3(GV60)常驻。淡出时长规范未给,取 600ms 线性(可逆默认)。
// ---------------------------------------------------------------------------

export type TerminalPresence = "hidden" | "ghost" | "resident";

/** 阶段 2 浮现不透明度(§6.1:40%)。 */
export const TERMINAL_GHOST_OPACITY = 0.4;
/** 阶段 2 播完即散的整窗停留(§6.1:3 秒)。 */
export const TERMINAL_GHOST_HOLD_MS = 3000;
/** 整窗淡出时长(规范未定,可逆默认;记票 0044 Log)。 */
export const TERMINAL_GHOST_FADE_MS = 600;

/** 幽灵段的不透明度曲线:0.4 平台 → 线性淡出 → 0。纯时间函数。 */
export function ghostOpacityFor(elapsedMs: number): number {
  const t = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  if (t >= TERMINAL_GHOST_HOLD_MS + TERMINAL_GHOST_FADE_MS) {
    return 0;
  }
  if (t >= TERMINAL_GHOST_HOLD_MS) {
    return TERMINAL_GHOST_OPACITY * (1 - (t - TERMINAL_GHOST_HOLD_MS) / TERMINAL_GHOST_FADE_MS);
  }
  return TERMINAL_GHOST_OPACITY;
}

// ---------------------------------------------------------------------------
// 输入裁定(§3.2 / §6.3):阶段 0–2 输入一律 access denied
// ---------------------------------------------------------------------------

export const DENIED_ECHO = "> access denied";
export const SYSTEM_PREFIX = "[SYSTEM]";
/** 输入解锁阶段(§6.3):阶段 3 起 prompt line 原位激活。 */
export const INPUT_UNLOCK_STAGE = 3;

export interface InputResult {
  readonly accepted: boolean;
  readonly denied: boolean;
  readonly echo: string;
}

export function resolveInput(stage: number, text: string): InputResult {
  if (stage < INPUT_UNLOCK_STAGE) {
    // 第一次输入被拒时,玩家意识到这扇门本来就是锁着的。
    return { accepted: false, denied: true, echo: DENIED_ECHO };
  }
  return { accepted: true, denied: false, echo: text };
}

// ---------------------------------------------------------------------------
// 行宽(§3.3):严格 cols 列,断词不拆字;超长词硬折防顶破窗口
// ---------------------------------------------------------------------------

export function wrapTerminalLine(text: string, cols: number): readonly string[] {
  if (cols <= 0 || text.length === 0) {
    return [text];
  }
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    const flush = (): void => {
      out.push(current);
      current = "";
    };
    for (const word of paragraph.split(" ")) {
      let piece = word;
      while (piece.length > cols) {
        if (current.length > 0) {
          flush();
        }
        out.push(piece.slice(0, cols));
        piece = piece.slice(cols);
      }
      if (current.length === 0) {
        current = piece;
      } else if (current.length + 1 + piece.length <= cols) {
        current = current + " " + piece;
      } else {
        flush();
        current = piece;
      }
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------------------
// 字体面:CSS 变量隔离,等宽 fallback;不下载字体文件
// ---------------------------------------------------------------------------

export const TERMINAL_FONT_VAR = "--gazer-terminal-font";
export const TERMINAL_STYLE_ID = "gazer-terminal-style";

// 族名分段拼合:单段字面量保持 ≤2 个英文词,守住组件文件裸英文扫描纪律。
// 字体本体(Fusion Pixel 12px proportional SC,OFL)经 fontsource 包接入,
// @font-face 由 main.ts 的包 css 提供,本文件仍零字体资源(红线自检保持)。
const FUSION_A = "Fusion Pixel";
const FUSION_B = " 12px Proportional";
const FUSION_C = " SC";
const LEGACY_A = "Fusion Pixel";
const LEGACY_B = " 12px proportional";
const FALLBACK_A = "MS Gothic";
const FALLBACK_B = "ui-monospace, monospace";

export const TERMINAL_FONT_STACK =
  FUSION_A + FUSION_B + FUSION_C + ", " + LEGACY_A + LEGACY_B + ", " + FALLBACK_A + ", " + FALLBACK_B;

/** 只注入字体变量规则;窗口其余样式由组件内联,便于逐项测试与豁免管理。 */
export function installTerminalStyles(doc: Document): void {
  if (doc.getElementById(TERMINAL_STYLE_ID) !== null) {
    return;
  }
  const style = doc.createElement("style");
  style.id = TERMINAL_STYLE_ID;
  style.textContent = ":root{" + TERMINAL_FONT_VAR + ":" + TERMINAL_FONT_STACK + ";}";
  doc.head.append(style);
}

// ---------------------------------------------------------------------------
// 终端视图
// ---------------------------------------------------------------------------

export interface TerminalOptions {
  /** 缺省桌面满配;窄视口/移动传 MOBILE_LAYOUT。 */
  readonly layout?: TerminalLayout;
  readonly stage: number;
  /** 标题栏路径文本,每存档唯一,由 fingerprint 派生,由接线方传入。 */
  readonly path: string;
}

export interface TerminalView {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly cursor: CursorMachine;
  setStage(stage: number): void;
  /**
   * 阶段门控(§6.0/§6.1,票 0044):0–1 hidden(无常驻迹象);2 ghost
   * (由接线方在首次圆桌时启动,40% 浮现 3s 整窗淡出,散场清历史——不可
   * 回看);3+ resident。ghost 起点由 now 锚定,淡出由 render 逐帧推进。
   */
  setPresence(mode: TerminalPresence, now?: number): void;
  appendSpeaker(speaker: string, text: string): void;
  appendSystem(text: string): void;
  /** 阶段 <3 一律回显 denied;阶段 ≥3 回显白并转 WAIT(§6.3)。 */
  submitInput(text: string, now: number): InputResult | null;
  /** 假打字机入口:字符按确定性表逐个揭示,由 render 同步到屏。 */
  startFakeType(speaker: string, text: string, now: number): TypeRun;
  /**
   * 真 token 通道(票 0044):上游(bridge/director client)到达间隔逐字
   * 喂 TYPE;调用方自构造间隔轮,fake_typing:false。传输层尚无逐 token
   * 流时,接线方以真实请求延迟摊布(见 game.ts 的 terminalTypeIntervals)。
   */
  startTokenType(speaker: string, text: string, intervals: readonly number[], now: number): TypeRun;
  /**
   * 正典打印入口(ticket 0029, [N2]):[SYSTEM] 蓝行,70ms/字符匀速逐字
   * 揭示,不挂说话者、不加前缀——机器在背诵。轮经同一光标状态机推进,
   * 与 LLM 台词通道的轮互斥(后到的 finishTyping 掉队者)。
   */
  startCanonPrint(text: string, now: number): TypeRun;
  /** 镜面律入口:玩家输入框每次按键转发一次。 */
  playerTyped(now: number): void;
  /** 每帧入口:推进光标状态机、幽灵淡出与 CORRUPT 闪现,并同步到屏。 */
  render(now: number): CursorRender;
  /** 侵蚀 step 3 的个体名来源(wiring 从世界取首个有名个体传入)。 */
  setErosionName(name: string): void;
  /**
   * D-04 执行器路径:严格禁跳步——仅当 step 恰为当前步 +1 时应用;
   * 相同或更小为幂等空转,更大直接拒绝(返回 false)。
   */
  applyErosion(step: number, tick?: number): boolean;
  /**
   * D-04 GV 表路径(§6.4「一次性事件按序播放」):向目标步推进,但每次
   * 调用至多 +1,由调用方逐帧排干——即使 GV 一次跨过多个阈值也不跳步。
   */
  advanceErosion(target: number, tick: number): boolean;
  /** D-07 滚动耳语:滚动区按 delta 朝视线区移动,钳制在可滚范围内。 */
  whisperScroll(delta: number): number;
  /** W 组/D-04 终态行的逐字通道:不加分隔前缀,原文呈现。 */
  appendRaw(text: string): void;
  /**
   * reconstructed 面(票 0050,NARRATIVE-CORE-01 §5.1):非正典文本的终端行
   * ——重构接缝标记、幽灵回放行、NG+ 开场行走这里;灰字斜体 + data-tone,
   * 与正典逐字通道(appendRaw,N2)和 [SYSTEM] 系统播报面三通道互不转写。
   */
  appendReconstructed(text: string): void;
  /**
   * 演出纪律(§5.2,票 0050):录音窗内世界时钟暂停漂移——计数停摆,不补
   * 跑。冻结即锚住连续侵蚀面(漂移/自改/路径逐字符)的计数值;解冻把全部
   * 锚点前移暂停时长,从冻结处续走,绝不回溯补涨。
   */
  setErosionFrozen(frozen: boolean, tick: number): void;
  destroy(): void;
}

interface ActiveTyping {
  readonly text: string;
  readonly span: HTMLElement;
}

function px(n: number): string {
  return n + "px";
}

function setStyle(node: HTMLElement, name: string, value: string): void {
  node.style.setProperty(name, value);
}

export function createTerminal(doc: Doc, options: TerminalOptions): TerminalView {
  const layout = options.layout ?? DESKTOP_LAYOUT;
  const size = canvasSize(layout);
  let stage = options.stage;
  let lastSpeaker: string | null = null;
  let typing: ActiveTyping | null = null;
  let typeOffset = 0;
  const cursor = createCursorMachine();

  // 阶段门控(§6.0/§6.1,票 0044):缺省按构造 stage 落位——3+ 常驻,
  // 其余 hidden(阶段 2 的幽灵面必须由接线方在首次圆桌时显式启动)。
  let presence: TerminalPresence = options.stage >= 3 ? "resident" : "hidden";
  let ghostStartedAt = 0;

  // CORRUPT 闪现(§4.2,票 0044):8×8 剪影画布与光标块互斥占位;
  // lastFlashBeat 保证每个轮到的拍只闪 1 渲染帧(确定性帧序)。
  let lastFlashBeat = -1;
  let corruptShown = false;

  // D-04 侵蚀状态(票 0026):推进只允许 +1;各步激活时锚定世界 tick,
  // 漂移/自改节奏自锚点起算,确定性,不读系统时间。
  let erosionStep = 0;
  const erosionAnchor: Partial<Record<number, number>> = {};
  let erosionName: string | null = null;
  let redactedLines = 0;
  let hijackCount = 0;
  let cursorFreed = false;
  let silenceArmed = false;
  let silenceDone = false;
  // 录音窗的计数停摆(§5.2,票 0050):冻结时连续侵蚀面读冻结拍。
  let erosionFrozen = false;
  let erosionFrozenTick = 0;

  const root = el(doc, "div", { className: "gazer-terminal" });
  const titleBar = el(doc, "div", { className: "gazer-terminal__title" });
  const pathSpan = el(doc, "span", { className: "gazer-terminal__path", text: options.path });
  // 伪按钮(§3.1):点击无反应是设计——玩家点了才知道它不是 UI,是布置。
  // 故意不挂任何监听。
  const fakeButton = el(doc, "span", {
    className: "gazer-terminal__fake",
    text: "[ _ ]",
    attrs: { "aria-hidden": "true" },
  });
  const separator = el(doc, "div", { className: "gazer-terminal__separator" });
  const body = el(doc, "div", {
    className: "gazer-terminal__body",
    attrs: { role: "log", "aria-live": "polite" },
  });
  const promptLine = el(doc, "div", { className: "gazer-terminal__promptline" });
  const promptText = el(doc, "span", { className: "gazer-terminal__prompt", text: "C:\\>" });
  const cursorSpan = el(doc, "span", { className: "gazer-terminal__cursor", text: "\u2588" });
  // CORRUPT 剪影画布(§4.2,票 0044):与光标块同槽互斥;context 缺失
  // (测试假 DOM)时只做占位切换,不画格。
  const corruptCanvas = doc.createElement("canvas") as HTMLCanvasElement;
  corruptCanvas.width = CORRUPT_GRID;
  corruptCanvas.height = CORRUPT_GRID;

  titleBar.append(pathSpan, fakeButton);
  promptLine.append(promptText, cursorSpan, corruptCanvas);
  root.append(titleBar, separator, body, promptLine);

  // 结构样式(位置永不移动:fixed 底部,宽 90%,逻辑画布定上限)。
  setStyle(root, "position", "fixed");
  setStyle(root, "bottom", "0");
  setStyle(root, "left", "5%");
  setStyle(root, "width", "90%");
  setStyle(root, "max-width", px(size.width));
  setStyle(root, "height", px(size.height));
  setStyle(root, "box-sizing", "border-box");
  setStyle(root, "display", "flex");
  setStyle(root, "flex-direction", "column");
  setStyle(root, "font-family", "var(" + TERMINAL_FONT_VAR + ")");
  setStyle(root, "font-size", px(CHAR_W_PX));
  setStyle(root, "line-height", px(LINE_H_PX));

  setStyle(titleBar, "display", "flex");
  setStyle(titleBar, "justify-content", "space-between");
  setStyle(titleBar, "align-items", "baseline");
  setStyle(titleBar, "padding", "2px 6px");

  setStyle(separator, "height", "1px");

  setStyle(body, "flex", "1 1 auto");
  setStyle(body, "overflow-y", "auto");
  setStyle(body, "padding", "6px");
  setStyle(body, "white-space", "pre-wrap");

  setStyle(promptLine, "display", "flex");
  setStyle(promptLine, "align-items", "baseline");
  setStyle(promptLine, "gap", "4px");
  setStyle(promptLine, "padding", "2px 6px");
  setStyle(promptLine, "white-space", "pre");

  setStyle(cursorSpan, "display", "inline-block");
  setStyle(corruptCanvas, "display", "none");

  // 阶段门控落位(§6.0/§6.1):hidden 即「无任何常驻 UI 迹象」。
  const applyPresence = (): void => {
    setStyle(root, "display", presence === "hidden" ? "none" : "flex");
    if (presence === "resident") {
      setStyle(root, "opacity", "1");
    } else if (presence === "ghost") {
      setStyle(root, "opacity", String(ghostOpacityFor(0)));
    }
  };
  applyPresence();

  const applyPalette = (): void => {
    const p = terminalPalette(stage);
    setStyle(root, "background", p.termBg);
    setStyle(root, "border", "1px solid " + p.termFrame);
    setStyle(root, "color", p.promptGray);
    setStyle(titleBar, "background", p.termTitleBg);
    // 标题栏文字色无索引色:蓝底取白、暗底取灰,按可读性反推。
    setStyle(titleBar, "color", stage <= 2 ? "#FFFFFF" : p.promptGray);
    setStyle(separator, "background", p.termFrame);
    setStyle(promptLine, "color", p.promptGray);
    if (lastSpeaker === null) {
      setStyle(cursorSpan, "color", p.promptGray);
    }
  };
  applyPalette();

  const scrollToEnd = (): void => {
    body.scrollTop = body.scrollHeight;
  };

  // ---- D-04 侵蚀的视层应用(票 0026) ----

  const markSpeakersUnderlined = (): void => {
    for (const child of Array.from(body.children)) {
      const lineEl = child as HTMLElement;
      const speaker =
        (lineEl as { firstElementChild?: Element | null }).firstElementChild ?? null;
      if (
        speaker === null ||
        !(speaker as HTMLElement).className.includes("gazer-terminal__speaker")
      ) {
        continue;
      }
      if (lineEl.getAttribute("data-eroded") === "1") {
        continue;
      }
      lineEl.setAttribute("data-eroded", "1");
      setStyle(speaker as HTMLElement, "text-decoration", "underline");
    }
  };

  const freeCursor = (): void => {
    if (cursorFreed) {
      return;
    }
    cursorFreed = true;
    // step 4 光标自由:脱离输入行,在内容区漂移(step 4 起在个体名下划线)。
    cursorSpan.remove();
    setStyle(cursorSpan, "position", "absolute");
    body.append(cursorSpan);
  };

  const redactUpTo = (count: number): void => {
    const total = body.children.length;
    const target = Math.min(count, total);
    for (let i = redactedLines; i < target; i += 1) {
      const lineEl = body.children[i] as HTMLElement | undefined;
      if (lineEl === undefined) {
        break;
      }
      lineEl.textContent = REDACTED_TEXT;
      setStyle(lineEl, "color", terminalPalette(stage).promptGray);
      lineEl.setAttribute("data-redacted", "1");
    }
    redactedLines = Math.max(redactedLines, target);
  };

  const refreshErosion = (tick: number): void => {
    if (erosionStep <= 0) {
      return;
    }
    // 计数停摆(§5.2,票 0050):录音窗内连续侵蚀面一律读冻结拍。
    const effTick = erosionFrozen ? erosionFrozenTick : tick;
    if (erosionStep >= 1) {
      const anchor = erosionAnchor[1] ?? effTick;
      const drift = erosionDriftPx(Math.max(0, effTick - anchor));
      if (drift.x !== 0 || drift.y !== 0) {
        setStyle(root, "transform", "translate(" + drift.x + "px, " + drift.y + "px)");
      }
    }
    if (erosionStep >= 2) {
      const anchor = erosionAnchor[2] ?? effTick;
      redactUpTo(redactCount(Math.max(0, effTick - anchor)));
    }
    if (erosionStep >= 3) {
      // step 3 标题栏异变(§6.4):路径名逐字符替换为个体名(票 0044 项 6
      // nit 修)——节奏与历史自改同拍,从 step 3 锚点起算,确定性。
      const anchor = erosionAnchor[3] ?? effTick;
      const count = Math.floor(
        Math.max(0, effTick - anchor) / EROSION_PATH_TICKS_PER_CHAR,
      );
      pathSpan.textContent = erodePathAt(options.path, erosionName ?? EROSION_NAME_FALLBACK, count);
    }
    if (erosionStep >= 4 && cursorFreed) {
      // 确定性漂移轨迹:tick 整数运算,无随机源。
      const x = Math.abs((Math.floor(effTick) * 7) % size.width);
      const y = Math.abs((Math.floor(effTick) * 3) % size.height);
      setStyle(cursorSpan, "left", px(x));
      setStyle(cursorSpan, "top", px(y));
    }
    if (erosionStep >= 4) {
      markSpeakersUnderlined();
    }
  };

  const applyErosionStep = (step: number, tick: number): void => {
    erosionStep = Math.max(erosionStep, step);
    erosionAnchor[step] = tick;
    if (step === 4) {
      freeCursor();
    }
    if (step === 6) {
      // step 6 静默帧由 render() 逐帧落:黑 1 帧,随后永久显示终态行。
      silenceArmed = false;
      silenceDone = false;
    }
    refreshErosion(tick);
  };

  const appendSpeaker = (speaker: string, text: string): void => {
    lastSpeaker = speaker;
    const color = speakerColor(speaker);
    setStyle(cursorSpan, "color", color);
    const prefix = speaker + ": ";
    const rows = wrapTerminalLine(prefix + text, layout.cols);
    rows.forEach((row, index) => {
      const lineEl = el(doc, "div", { className: "gazer-terminal__line" });
      if (index === 0 && row.startsWith(prefix)) {
        const speakerSpan = el(doc, "span", {
          className: "gazer-terminal__speaker",
          text: prefix,
        });
        setStyle(speakerSpan, "color", color);
        lineEl.append(speakerSpan);
        const rest = row.slice(prefix.length);
        if (rest.length > 0) {
          lineEl.append(el(doc, "span", { className: "gazer-terminal__text", text: rest }));
        }
      } else {
        lineEl.append(el(doc, "span", { className: "gazer-terminal__text", text: row }));
      }
      body.append(lineEl);
    });
    scrollToEnd();
  };

  // [SYSTEM] 前缀通道(§3.3 系统行,票 0044 项 6 钉死):非正典的系统播报
  // 走这里——带前缀、着 sys_blue。语义两分:正典行(§6.2 channel
  // established 等)是「它们在背诵」的逐字原文,走 startCanonPrint /
  // appendRaw 的无前缀通道(N2,票 0029),一字不改;本通道是 terminal
  // 自身的播报面,允许前缀改写。两通道互不转写。
  const appendSystem = (text: string): void => {
    const rows = wrapTerminalLine(text, layout.cols);
    rows.forEach((row, index) => {
      const lineEl = el(doc, "div", {
        className: "gazer-terminal__line" + " gazer-terminal__line--system",
      });
      const content = index === 0 ? SYSTEM_PREFIX + " " + row : row;
      const span = el(doc, "span", { className: "gazer-terminal__text", text: content });
      setStyle(span, "color", terminalPalette(stage).sysBlue);
      lineEl.append(span);
      body.append(lineEl);
    });
    scrollToEnd();
  };

  const appendDenied = (): void => {
    const lineEl = el(doc, "div", {
      className: "gazer-terminal__line" + " gazer-terminal__line--denied",
      attrs: { "data-tone": "denied" },
    });
    const span = el(doc, "span", { className: "gazer-terminal__text", text: DENIED_ECHO });
    setStyle(span, "color", terminalPalette(stage).warnRed);
    lineEl.append(span);
    body.append(lineEl);
    scrollToEnd();
  };

  // W 组 canon 行与 D-04 终态行的逐字通道:原文呈现,不加 [SYSTEM] 前缀
  // (票 0029 [N2] 正典无前缀通道,票 0044 项 6 钉死),文案一律从
  // src/canon/ 取用(票 0026),不进运行时字面。
  const appendRaw = (text: string): void => {
    const rows = wrapTerminalLine(text, layout.cols);
    rows.forEach((row) => {
      const lineEl = el(doc, "div", {
        className: "gazer-terminal__line" + " gazer-terminal__line--raw",
      });
      const span = el(doc, "span", { className: "gazer-terminal__text", text: row });
      setStyle(span, "color", terminalPalette(stage).promptGray);
      lineEl.append(span);
      body.append(lineEl);
    });
    scrollToEnd();
  };

  // reconstructed 面(票 0050,NARRATIVE-CORE-01 §5.1):非正典文本——重构
  // 接缝标记、幽灵回放行、NG+ 开场行。灰字斜体 + data-tone 标记,实验日志
  // 与 CI 按此面分组(verbatim / reconstructed / ghost 三分)。
  const appendReconstructed = (text: string): void => {
    const rows = wrapTerminalLine(text, layout.cols);
    rows.forEach((row) => {
      const lineEl = el(doc, "div", {
        className: "gazer-terminal__line" + " gazer-terminal__line--reconstructed",
        attrs: { "data-tone": "reconstructed" },
      });
      const span = el(doc, "span", { className: "gazer-terminal__text", text: row });
      setStyle(span, "color", terminalPalette(stage).promptGray);
      setStyle(span, "font-style", "italic");
      lineEl.append(span);
      body.append(lineEl);
    });
    scrollToEnd();
  };

  const finishTyping = (): void => {
    if (typing !== null) {
      typing.span.textContent = typing.text;
      typing = null;
    }
  };

  // 台词 TYPE 轮的公共落屏(票 0044):真 token 轮与假打字轮共用同一条
  // 显示线与同一台光标状态机,差别只在间隔轮的来路与 meta 标记。
  const beginTypeLine = (speaker: string, text: string, run: TypeRun, now: number): TypeRun => {
    cursor.type(run, now);
    lastSpeaker = speaker;
    setStyle(cursorSpan, "color", speakerColor(speaker));
    const lineEl = el(doc, "div", { className: "gazer-terminal__line" });
    const speakerSpan = el(doc, "span", {
      className: "gazer-terminal__speaker",
      text: speaker + ": ",
    });
    setStyle(speakerSpan, "color", speakerColor(speaker));
    const textSpan = el(doc, "span", { className: "gazer-terminal__text", text: "" });
    lineEl.append(speakerSpan, textSpan);
    body.append(lineEl);
    typing = { text, span: textSpan };
    scrollToEnd();
    return run;
  };

  return {
    root,
    body,
    cursor,
    setStage(next) {
      stage = next;
      applyPalette();
    },
    setPresence(mode, now = 0) {
      presence = mode;
      if (mode === "ghost") {
        ghostStartedAt = now;
      }
      applyPresence();
      if (mode === "hidden") {
        // 幽灵散场或主动隐藏:清空临时痕迹(§6.1 不可回看)。
        finishTyping();
        cursor.idle(now);
      }
    },
    appendSpeaker,
    appendSystem,
    submitInput(text, now) {
      const trimmed = text.trim();
      if (trimmed.length === 0) {
        return null;
      }
      const result = resolveInput(stage, trimmed);
      if (result.denied) {
        appendDenied();
      } else {
        // 阶段 3+:输入回显白,与它们的说话色形成"你的话/它们的话"色彩阶级。
        // D-04 step 5 输入劫持(§6.4):提交前字符被替换,玩家失去对
        // "自己说话"的所有权;侵蚀未至此步时原样回显。
        const echoed = erosionStep >= 5 ? hijackInput(result.echo, hijackCount) : result.echo;
        if (erosionStep >= 5) {
          hijackCount += 1;
        }
        const landed: InputResult = { ...result, echo: echoed };
        const lineEl = el(doc, "div", {
          className: "gazer-terminal__line" + " gazer-terminal__line--spoken",
          attrs: { "data-tone": "spoken" },
        });
        const span = el(doc, "span", { className: "gazer-terminal__text", text: echoed });
        setStyle(span, "color", "#FFFFFF");
        lineEl.append(span);
        body.append(lineEl);
        cursor.wait(now);
        scrollToEnd();
        return landed;
      }
      return result;
    },
    startFakeType(speaker, text, now) {
      finishTyping();
      const run = fakeTypeRun(text, typeOffset);
      typeOffset += text.length;
      return beginTypeLine(speaker, text, run, now);
    },
    startTokenType(speaker, text, intervals, now) {
      finishTyping();
      const run: TypeRun = { text, intervals, meta: { fake_typing: false } };
      return beginTypeLine(speaker, text, run, now);
    },
    startCanonPrint(text, now) {
      finishTyping();
      const run = canonTypeRun(text);
      cursor.type(run, now);
      const lineEl = el(doc, "div", {
        className: "gazer-terminal__line" + " gazer-terminal__line--system",
      });
      const textSpan = el(doc, "span", { className: "gazer-terminal__text", text: "" });
      setStyle(textSpan, "color", terminalPalette(stage).sysBlue);
      lineEl.append(textSpan);
      body.append(lineEl);
      typing = { text, span: textSpan };
      scrollToEnd();
      return run;
    },
    playerTyped(now) {
      cursor.playerTyped(now);
    },
    setErosionName(name: string): void {
      erosionName = name.length > 0 ? name : EROSION_NAME_FALLBACK;
    },
    applyErosion(step, tick = 0) {
      const safe = Number.isFinite(step) ? Math.floor(step) : 0;
      // 执行器 D-04 路径:严格禁跳步——只接受恰为当前步 +1 的请求。
      if (safe !== erosionStep + 1 || safe < 1 || safe > DOM_EROSION_STEPS) {
        return false;
      }
      applyErosionStep(safe, tick);
      return true;
    },
    advanceErosion(target, tick) {
      const safe = Number.isFinite(target) ? Math.floor(target) : 0;
      const clamped = Math.min(DOM_EROSION_STEPS, Math.max(0, safe));
      // GV 表路径:目标可以一次跨多个阈值,但每次调用只 +1,由调用方逐帧排干。
      if (clamped <= erosionStep) {
        // 已到目标:仍随帧刷新漂移/自改等持续性侵蚀面。
        refreshErosion(tick);
        return false;
      }
      applyErosionStep(erosionStep + 1, tick);
      return true;
    },
    whisperScroll(delta) {
      const max = Math.max(0, body.scrollHeight - body.clientHeight);
      body.scrollTop = whisperScrollTop(body.scrollTop, delta, max);
      return body.scrollTop;
    },
    appendRaw,
    appendReconstructed,
    setErosionFrozen(frozen, tick) {
      const safe = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0;
      if (frozen && !erosionFrozen) {
        erosionFrozen = true;
        erosionFrozenTick = safe;
        refreshErosion(safe);
        return;
      }
      if (!frozen && erosionFrozen) {
        erosionFrozen = false;
        // 计数停摆不补跑:解冻把全部锚点前移暂停时长,漂移/自改从冻结处续走。
        const shift = Math.max(0, safe - erosionFrozenTick);
        for (const key of Object.keys(erosionAnchor)) {
          const stepKey = Number(key);
          const anchor = erosionAnchor[stepKey];
          if (anchor !== undefined) {
            erosionAnchor[stepKey] = anchor + shift;
          }
        }
        refreshErosion(safe);
      }
    },
    render(now) {
      // step 6 静默帧:先于一切内容落屏——黑 1 帧,下一帧恢复并落终态行。
      if (erosionStep >= 6 && !silenceDone) {
        if (!silenceArmed) {
          silenceArmed = true;
          setStyle(root, "background", "#000000");
          setStyle(titleBar, "visibility", "hidden");
          setStyle(separator, "visibility", "hidden");
          setStyle(body, "visibility", "hidden");
          setStyle(promptLine, "visibility", "hidden");
        } else {
          silenceDone = true;
          applyPalette();
          setStyle(titleBar, "visibility", "visible");
          setStyle(separator, "visibility", "visible");
          setStyle(body, "visibility", "visible");
          setStyle(promptLine, "visibility", "visible");
          const doneLine = canonLine(EROSION_DONE_LINE_KEY);
          if (doneLine !== null) {
            appendRaw(doneLine);
          }
        }
      }
      const snap = cursor.snapshot(now);
      if (typing !== null) {
        if (snap.state === "TYPE") {
          typing.span.textContent = typing.text.slice(0, snap.charIndex);
        } else {
          finishTyping();
        }
      }
      // 幽灵段(§6.1):不透明度随帧推进,3s 整窗淡出后散场——display 收
      // 起、历史清空(不可回看),回到无常驻迹象。
      if (presence === "ghost") {
        const elapsed = Math.max(0, now - ghostStartedAt);
        const opacity = ghostOpacityFor(elapsed);
        setStyle(root, "opacity", String(opacity));
        if (opacity === 0) {
          presence = "hidden";
          setStyle(root, "display", "none");
          body.textContent = "";
          redactedLines = 0;
          finishTyping();
          cursor.idle(now);
        }
      }
      // CORRUPT 闪现(§4.2,票 0044):阶段 4 且光标亮起的轮到拍,以 8×8
      // 迷你个体剪影顶替光标块,恰 1 渲染帧——同拍后续渲染帧即回块。
      let corruptFlash = false;
      const flashSpeaker = lastSpeaker;
      const flashBeat = Math.floor(Math.max(0, now) / CURSOR_ON_MS);
      if (
        stage >= 4 &&
        flashSpeaker !== null &&
        snap.visible &&
        corruptFlashDue(now, flashSpeaker) &&
        flashBeat !== lastFlashBeat
      ) {
        lastFlashBeat = flashBeat;
        corruptShown = true;
        corruptFlash = true;
        const grid = corruptSilhouette(flashSpeaker, flashBeat);
        const ctx =
          (corruptCanvas as { getContext?: (kind: string) => CanvasRenderingContext2D | null })
            .getContext?.("2d") ?? null;
        if (ctx !== null) {
          drawCorruptSilhouette(ctx, grid, speakerColor(flashSpeaker));
        }
        setStyle(corruptCanvas, "display", "inline-block");
      }
      if (!corruptFlash && corruptShown) {
        // 闪现帧已过:回到光标块。
        corruptShown = false;
        setStyle(corruptCanvas, "display", "none");
      }
      if (corruptFlash) {
        setStyle(cursorSpan, "visibility", "hidden");
      } else {
        setStyle(cursorSpan, "visibility", snap.visible ? "visible" : "hidden");
      }
      return { state: snap.state, visible: snap.visible, charIndex: snap.charIndex, corruptFlash };
    },
    destroy() {
      root.remove();
    },
  };
}
