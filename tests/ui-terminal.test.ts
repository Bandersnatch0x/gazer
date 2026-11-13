import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Doc } from "../src/ui/shell";
import {
  CURSOR_OFF_MS,
  CURSOR_ON_MS,
  DENIED_ECHO,
  DESKTOP_LAYOUT,
  EROSION_DONE_LINE_KEY,
  EROSION_NAME_FALLBACK,
  EROSION_STEP_GV,
  FAKE_TYPE_MAX_MS,
  FAKE_TYPE_MIN_MS,
  FAKE_TYPE_TABLE_MS,
  GENLOSS_CYCLE_MS,
  GENLOSS_OFF_A_MS,
  GENLOSS_OFF_B_MS,
  GENLOSS_ON_A_MS,
  GENLOSS_ON_B_MS,
  HIJACK_INSERT_TEXT,
  MIRROR_RESUME_MS,
  MOBILE_LAYOUT,
  REDACTED_TEXT,
  TERMINAL_PALETTE_EARLY,
  TERMINAL_PALETTE_LATE,
  canvasSize,
  createCursorMachine,
  createTerminal,
  erodePath,
  erosionDriftPx,
  erosionStepForGv,
  fakeTypeRun,
  hijackInput,
  redactCount,
  resolveInput,
  speakerColor,
  speakerHue,
  speakerHueRuled,
  whisperScrollTop,
  wrapTerminalLine,
  CANON_PRINT_MS_PER_CHAR,
  canonTypeRun,
} from "../src/ui/terminal";
import { canonLine } from "../src/canon";
import type { TerminalView } from "../src/ui/terminal";

// ---------------------------------------------------------------------------
// 假 DOM:与 ui-panels.test.ts 同路数,补 style.setProperty / scrollTop / click。
// ---------------------------------------------------------------------------

class FakeNode {
  className = "";
  private ownText = "";
  readonly styles = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string): void => {
      this.styles.set(name, value);
    },
  };
  readonly children: FakeNode[] = [];
  parent: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  scrollTop = 0;
  scrollHeight = 0;

  constructor(readonly tagName: string) {}

  get textContent(): string {
    if (this.children.length === 0) {
      return this.ownText;
    }
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  get firstElementChild(): FakeNode | null {
    return this.children[0] ?? null;
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

  appendChild(child: FakeNode): FakeNode {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  click(): void {
    for (const listener of [...(this.listeners.get("click") ?? [])]) listener();
  }

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeNode {
    return new FakeNode(tagName);
  }
}

const doc = new FakeDocument() as unknown as Doc;

// HTMLElement 面向真 DOM,测试里经 unknown 收窄回 FakeNode 读内部状态。
function childAt(node: unknown, index: number): FakeNode {
  const container = node as { children: unknown[] };
  return container.children[index] as FakeNode;
}

function stylesOf(node: unknown): Map<string, string> {
  return (node as FakeNode).styles;
}

function attrsOf(node: unknown): Map<string, string> {
  return (node as FakeNode).attributes;
}

function lastLine(view: TerminalView): FakeNode {
  return childAt(view.body, view.body.children.length - 1);
}

function makeTerminal(stage: number): TerminalView {
  return createTerminal(doc, { stage, path: "C:\\GAZERLING\\THRESHOLD.EXE" });
}

function std(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// CI §9.1 帧尺寸:桌面 72 列 / 移动 40 列,自有逻辑画布([R3])
// ---------------------------------------------------------------------------

describe("帧尺寸(CI §9.1)", () => {
  it("桌面满配 72 列 × 12 行,逻辑画布 864×156", () => {
    expect(DESKTOP_LAYOUT.cols).toBe(72);
    expect(DESKTOP_LAYOUT.rows).toBe(12);
    expect(canvasSize(DESKTOP_LAYOUT)).toEqual({ width: 864, height: 156 });
  });

  it("移动端 40 列 × 8 行,逻辑画布 480×104", () => {
    expect(MOBILE_LAYOUT.cols).toBe(40);
    expect(MOBILE_LAYOUT.rows).toBe(8);
    expect(canvasSize(MOBILE_LAYOUT)).toEqual({ width: 480, height: 104 });
  });

  it("画布恒为 12px/列 × 13px/行,与世界画布无关", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 120 }),
        fc.integer({ min: 4, max: 40 }),
        (cols, rows) => {
          const size = canvasSize({ cols, rows });
          expect(size.width).toBe(cols * 12);
          expect(size.height).toBe(rows * 13);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// 色板 §5.1:结构色双阶段表
// ---------------------------------------------------------------------------

describe("结构色双阶段表(§5.1)", () => {
  it("阶段 ≤2 用糖果蓝系", () => {
    for (const stage of [0, 1, 2]) {
      const view = makeTerminal(stage);
      expect(stylesOf(view.root).get("background")).toBe(TERMINAL_PALETTE_EARLY.termBg);
      view.destroy();
    }
    expect(TERMINAL_PALETTE_EARLY.termBg).toBe("#0E1116");
    expect(TERMINAL_PALETTE_EARLY.termFrame).toBe("#2A2F3A");
    expect(TERMINAL_PALETTE_EARLY.termTitleBg).toBe("#5B8DEF");
    expect(TERMINAL_PALETTE_EARLY.promptGray).toBe("#8B93A7");
    expect(TERMINAL_PALETTE_EARLY.sysBlue).toBe("#5B8DEF");
    expect(TERMINAL_PALETTE_EARLY.warnRed).toBe("#E85D5D");
  });

  it("阶段 3+ 转暗", () => {
    for (const stage of [3, 4]) {
      const view = makeTerminal(stage);
      expect(stylesOf(view.root).get("background")).toBe(TERMINAL_PALETTE_LATE.termBg);
      view.destroy();
    }
    expect(TERMINAL_PALETTE_LATE.termBg).toBe("#0B0D12");
    expect(TERMINAL_PALETTE_LATE.termFrame).toBe("#1A1E2E");
    expect(TERMINAL_PALETTE_LATE.termTitleBg).toBe("#1A1E2E");
    expect(TERMINAL_PALETTE_LATE.promptGray).toBe("#71798C");
    expect(TERMINAL_PALETTE_LATE.sysBlue).toBe("#3D6FD8");
  });
});

// ---------------------------------------------------------------------------
// 说话者色 §5.2 / [R8]:id 哈希恒定,绿区间重映射
// ---------------------------------------------------------------------------

describe("说话者色(R8)", () => {
  it("同 id 恒定:纯函数,无随机源", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        expect(speakerHue(id)).toBe(speakerHue(id));
        expect(speakerHueRuled(id)).toBe(speakerHueRuled(id));
        expect(speakerColor(id)).toBe(speakerColor(id));
      }),
      { numRuns: 500 },
    );
  });

  it("重映射后色相永不落回绿排除区 H90–150°(150 含端点,票 0044)", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        const hue = speakerHueRuled(id);
        expect(hue).toBeGreaterThanOrEqual(0);
        expect(hue).toBeLessThan(360);
        if (speakerHue(id) >= 90 && speakerHue(id) <= 150) {
          expect(hue).toBeGreaterThanOrEqual(190);
          expect(hue).toBeLessThanOrEqual(230);
        } else {
          expect(hue < 90 || hue > 150).toBe(true);
        }
      }),
      { numRuns: 800 },
    );
  });

  it("排除区命中时重映射值落在 190–230(含 150° 端点)", () => {
    let hits = 0;
    let endpoint = false;
    for (let i = 0; i < 20000; i += 1) {
      const id = "gazer_" + String(i);
      const raw = speakerHue(id);
      if (raw >= 90 && raw <= 150) {
        hits += 1;
        if (raw === 150) {
          endpoint = true;
        }
        const hue = speakerHueRuled(id);
        expect(hue).toBeGreaterThanOrEqual(190);
        expect(hue).toBeLessThanOrEqual(230);
      }
    }
    expect(hits).toBeGreaterThan(0);
    expect(endpoint).toBe(true);
  });

  it("说话者色为 HSL,S 55% L 62%", () => {
    expect(speakerColor("01")).toMatch(/^hsl\(\d+\.\d{2} 55% 62%\)$/);
  });
});

// ---------------------------------------------------------------------------
// 光标常态节拍(CI §9.2):530ms 亮 / 530ms 灭,禁 500ms
// ---------------------------------------------------------------------------

describe("光标常态节拍(CI §9.2)", () => {
  it("节拍常量:530 亮 / 530 灭,不是 500", () => {
    expect(CURSOR_ON_MS).toBe(530);
    expect(CURSOR_OFF_MS).toBe(530);
    expect(CURSOR_ON_MS).not.toBe(500);
    expect(CURSOR_OFF_MS).not.toBe(500);
  });

  it("30 秒录帧:每次翻转间隔恰为 530ms,均值 530±5ms", () => {
    const machine = createCursorMachine();
    machine.idle(0);
    const toggles: number[] = [];
    let lastVisible = machine.snapshot(0).visible;
    for (let t = 1; t <= 30_000; t += 1) {
      const visible = machine.snapshot(t).visible;
      if (visible !== lastVisible) {
        toggles.push(t);
        lastVisible = visible;
      }
    }
    expect(toggles.length).toBeGreaterThan(40);
    const intervals: number[] = [];
    let previous = 0;
    for (const t of toggles) {
      intervals.push(t - previous);
      previous = t;
    }
    for (const interval of intervals) {
      expect(interval).toBe(530);
    }
    const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
    expect(mean).toBeGreaterThanOrEqual(525);
    expect(mean).toBeLessThanOrEqual(535);
  });

  it("IDLE 在窗口内亮灭交替:前 530ms 亮,其后 530ms 灭", () => {
    const machine = createCursorMachine();
    machine.idle(0);
    expect(machine.snapshot(0).visible).toBe(true);
    expect(machine.snapshot(529).visible).toBe(true);
    expect(machine.snapshot(530).visible).toBe(false);
    expect(machine.snapshot(1059).visible).toBe(false);
    expect(machine.snapshot(1060).visible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WAIT / GENLOSS(§4.2)
// ---------------------------------------------------------------------------

describe("WAIT 与 GENLOSS", () => {
  it("WAIT 常亮不闪:任意时刻都可见", () => {
    const machine = createCursorMachine();
    machine.wait(0);
    for (let t = 0; t <= 5000; t += 137) {
      const snap = machine.snapshot(t);
      expect(snap.state).toBe("WAIT");
      expect(snap.visible).toBe(true);
    }
  });

  it("GENLOSS 节奏:亮 80 → 灭 120 → 亮 40 → 灭 60,周期 300ms", () => {
    expect(GENLOSS_CYCLE_MS).toBe(
      GENLOSS_ON_A_MS + GENLOSS_OFF_A_MS + GENLOSS_ON_B_MS + GENLOSS_OFF_B_MS,
    );
    expect(GENLOSS_CYCLE_MS).toBe(300);
    const machine = createCursorMachine();
    machine.genloss(1000);
    expect(machine.snapshot(1000).visible).toBe(true);
    expect(machine.snapshot(1079).visible).toBe(true);
    expect(machine.snapshot(1080).visible).toBe(false);
    expect(machine.snapshot(1199).visible).toBe(false);
    expect(machine.snapshot(1200).visible).toBe(true);
    expect(machine.snapshot(1239).visible).toBe(true);
    expect(machine.snapshot(1240).visible).toBe(false);
    expect(machine.snapshot(1299).visible).toBe(false);
    // 周期回卷:再一个亮 80。
    expect(machine.snapshot(1300).visible).toBe(true);
    expect(machine.snapshot(1379).visible).toBe(true);
    expect(machine.snapshot(1380).visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TYPE:token 间隔逐字保真重放(CI §9.2:间隔标准差 > 8ms)
// ---------------------------------------------------------------------------

describe("TYPE 状态(CI §9.2)", () => {
  // 确定性 token 流:模拟真实到达间隔的大幅抖动。
  const TOKEN_INTERVALS = [40, 90, 55, 220, 60, 150, 45, 300, 80, 130, 47, 260];

  it("token 流间隔的 std 本身 > 8ms(测试前提)", () => {
    expect(std(TOKEN_INTERVALS)).toBeGreaterThan(8);
  });

  it("字符揭示间隔与 token 到达间隔逐字相等:std > 8ms 被原样保留", () => {
    const machine = createCursorMachine();
    const text = "x".repeat(TOKEN_INTERVALS.length);
    machine.type({ text, intervals: TOKEN_INTERVALS, meta: { fake_typing: false } }, 0);
    const revealTimes: number[] = [];
    let lastCount = 0;
    for (let t = 0; t <= 2000; t += 1) {
      const snap = machine.snapshot(t);
      if (snap.charIndex > lastCount) {
        revealTimes.push(t);
        lastCount = snap.charIndex;
      }
    }
    expect(revealTimes.length).toBe(TOKEN_INTERVALS.length);
    const gaps: number[] = [];
    let previous = 0;
    for (const t of revealTimes) {
      gaps.push(t - previous);
      previous = t;
    }
    expect(gaps).toEqual(TOKEN_INTERVALS);
    expect(std(gaps)).toBeGreaterThan(8);
  });

  it("TYPE 期间灭态被压掉:光标常亮", () => {
    const machine = createCursorMachine();
    machine.type({ text: "abc", intervals: [45, 55, 50], meta: { fake_typing: true } }, 0);
    // 150ms 处轮次收束,只在轮内采样。
    for (let t = 0; t < 150; t += 7) {
      const snap = machine.snapshot(t);
      expect(snap.state).toBe("TYPE");
      expect(snap.visible).toBe(true);
    }
  });

  it("轮次结束后回 IDLE", () => {
    const machine = createCursorMachine();
    machine.type({ text: "ab", intervals: [45, 55], meta: { fake_typing: true } }, 0);
    expect(machine.snapshot(99).state).toBe("TYPE");
    expect(machine.snapshot(100).charIndex).toBe(2);
    expect(machine.snapshot(100).state).toBe("IDLE");
  });
});

// ---------------------------------------------------------------------------
// 假打字机(§7):45–55ms 确定性查表,meta.fake_typing: true
// ---------------------------------------------------------------------------

describe("假打字机(§7)", () => {
  it("表内所有间隔落在 45–55ms 窗口且两端都有取值", () => {
    expect(FAKE_TYPE_TABLE_MS.length).toBeGreaterThan(0);
    for (const interval of FAKE_TYPE_TABLE_MS) {
      expect(interval).toBeGreaterThanOrEqual(FAKE_TYPE_MIN_MS);
      expect(interval).toBeLessThanOrEqual(FAKE_TYPE_MAX_MS);
    }
    expect(Math.min(...FAKE_TYPE_TABLE_MS)).toBe(FAKE_TYPE_MIN_MS);
    expect(Math.max(...FAKE_TYPE_TABLE_MS)).toBe(FAKE_TYPE_MAX_MS);
  });

  it("表非匀速:间隔不恒定(std > 0)", () => {
    expect(std(FAKE_TYPE_TABLE_MS)).toBeGreaterThan(0);
  });

  it("同文本同偏移完全确定:查表,非 Math.random", () => {
    const first = fakeTypeRun("we hear you", 3);
    const second = fakeTypeRun("we hear you", 3);
    expect(first.intervals).toEqual(second.intervals);
    expect(first.meta).toEqual({ fake_typing: true });
    expect(first.text).toBe("we hear you");
    expect(first.intervals.length).toBe(first.text.length);
  });

  it("不同偏移取到不同的表段(同表轮转)", () => {
    const a = fakeTypeRun("ab", 0);
    const b = fakeTypeRun("ab", 1);
    expect(a.intervals).not.toEqual(b.intervals);
  });
});

// ---------------------------------------------------------------------------
// 镜面律(CI §9.3):玩家输入时 TYPE 暂停,停输 300ms 后续播
// ---------------------------------------------------------------------------

describe("镜面律(CI §9.3)", () => {
  function typingMachine(): ReturnType<typeof createCursorMachine> {
    const machine = createCursorMachine();
    const intervals = Array.from({ length: 100 }, () => 50);
    machine.type(
      { text: "a".repeat(100), intervals, meta: { fake_typing: true } },
      0,
    );
    return machine;
  }

  it("连续输入 5s:TYPE 冻结在停输前进度,停输 300ms 后续播", () => {
    const machine = typingMachine();
    // 0–100ms 正常打出 2 个字符。
    expect(machine.snapshot(100).charIndex).toBe(2);
    // 玩家从 100ms 起连续打字到 5000ms。
    for (let t = 100; t <= 5000; t += 100) {
      machine.playerTyped(t);
    }
    // 暂停期间进度完全冻结。
    for (let t = 150; t <= 5000; t += 137) {
      expect(machine.snapshot(t).charIndex).toBe(2);
    }
    // 停输后恰 300ms 续播:5300ms 起恢复,5350ms 第 3 个字符。
    expect(machine.snapshot(5300).charIndex).toBe(2);
    expect(machine.snapshot(5350).charIndex).toBe(3);
    expect(machine.snapshot(5400).charIndex).toBe(4);
  });

  it("300ms 内不恢复,恰 300ms 后才续播", () => {
    const machine = typingMachine();
    expect(machine.snapshot(100).charIndex).toBe(2);
    machine.playerTyped(100);
    expect(machine.snapshot(399).charIndex).toBe(2);
    expect(machine.snapshot(400).charIndex).toBe(2);
    // 400ms 时恢复起点,50ms 后出第 3 个字符。
    expect(machine.snapshot(450).charIndex).toBe(3);
  });

  it("镜面律只在 TYPE 态生效:IDLE/WAIT 不受玩家输入影响", () => {
    const machine = createCursorMachine();
    machine.wait(0);
    machine.playerTyped(10);
    expect(machine.snapshot(20).state).toBe("WAIT");
    expect(machine.snapshot(20).visible).toBe(true);
    machine.idle(1000);
    machine.playerTyped(1100);
    expect(machine.snapshot(1200).state).toBe("IDLE");
  });
});

// ---------------------------------------------------------------------------
// 输入裁定(CI §9.6):阶段 0–2 输入 100% denied
// ---------------------------------------------------------------------------

describe("输入裁定(CI §9.6)", () => {
  const nonEmpty = fc
    .string({ minLength: 1 })
    .filter((s) => s.trim().length > 0);

  it("阶段 0–2 任意输入 100% 回显 access denied", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), nonEmpty, (stage, text) => {
        const result = resolveInput(stage, text);
        expect(result.accepted).toBe(false);
        expect(result.denied).toBe(true);
        expect(result.echo).toBe(DENIED_ECHO);
      }),
      { numRuns: 500 },
    );
  });

  it("阶段 3 起输入解锁,回显原文", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 8 }), nonEmpty, (stage, text) => {
        const result = resolveInput(stage, text);
        expect(result.accepted).toBe(true);
        expect(result.denied).toBe(false);
        expect(result.echo).toBe(text);
      }),
      { numRuns: 200 },
    );
  });

  it("DOM:阶段 0–2 提交只追加 denied 行,颜色为 warn_red,光标不动", () => {
    const view = makeTerminal(1);
    const before = view.body.children.length;
    const result = view.submitInput("  yes  ", 1000);
    expect(result).toEqual({ accepted: false, denied: true, echo: DENIED_ECHO });
    expect(view.body.children.length).toBe(before + 1);
    const line = lastLine(view);
    expect(line.textContent).toBe(DENIED_ECHO);
    expect(attrsOf(view.body).size).toBeGreaterThanOrEqual(0);
    expect(line.attributes.get("data-tone")).toBe("denied");
    expect(childAt(line, 0).styles.get("color")).toBe(TERMINAL_PALETTE_EARLY.warnRed);
    expect(view.render(1000).state).toBe("IDLE");
    view.destroy();
  });

  it("DOM:阶段 3 提交回显白并转 WAIT(§6.3)", () => {
    const view = makeTerminal(3);
    const result = view.submitInput("hello", 2000);
    expect(result).toEqual({ accepted: true, denied: false, echo: "hello" });
    const line = lastLine(view);
    expect(line.textContent).toBe("hello");
    expect(line.attributes.get("data-tone")).toBe("spoken");
    expect(childAt(line, 0).styles.get("color")).toBe("#FFFFFF");
    expect(view.render(2000).state).toBe("WAIT");
    view.destroy();
  });

  it("DOM:空输入不产生任何回显", () => {
    const view = makeTerminal(1);
    const before = view.body.children.length;
    expect(view.submitInput("   ", 100)).toBeNull();
    expect(view.body.children.length).toBe(before);
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 假按钮(§3.1):点击无反应
// ---------------------------------------------------------------------------

describe("标题栏伪按钮(§3.1)", () => {
  it("标题栏含存档路径文本与伪按钮 [ _ ]", () => {
    const view = makeTerminal(2);
    const titleBar = childAt(view.root, 0);
    expect(childAt(titleBar, 0).textContent).toBe("C:\\GAZERLING\\THRESHOLD.EXE");
    expect(childAt(titleBar, 1).textContent).toBe("[ _ ]");
    view.destroy();
  });

  it("点击伪按钮无任何反应:历史与光标状态不变", () => {
    const view = makeTerminal(2);
    view.appendSpeaker("01", "first words");
    const before = view.body.children.length;
    const beforeSnap = view.render(0);
    childAt(childAt(view.root, 0), 1).click();
    expect(view.body.children.length).toBe(before);
    expect(view.render(0)).toEqual(beforeSnap);
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// DOM 结构与布局([R3]:固定底部 90% 宽,永不移动)
// ---------------------------------------------------------------------------

describe("终端窗结构", () => {
  it("root 固定底部、宽 90%、逻辑画布定尺寸上限", () => {
    const view = makeTerminal(0);
    const styles = stylesOf(view.root);
    expect(styles.get("position")).toBe("fixed");
    expect(styles.get("bottom")).toBe("0");
    expect(styles.get("left")).toBe("5%");
    expect(styles.get("width")).toBe("90%");
    expect(styles.get("max-width")).toBe("864px");
    expect(styles.get("height")).toBe("156px");
    view.destroy();
  });

  it("结构顺序:标题栏 + 分隔线 + 可滚动内容区 + prompt 行", () => {
    const view = makeTerminal(0);
    expect(view.root.children.length).toBe(4);
    const separator = childAt(view.root, 1);
    expect(separator.styles.get("height")).toBe("1px");
    expect(view.body).toBe(childAt(view.root, 2));
    expect(stylesOf(view.body).get("overflow-y")).toBe("auto");
    const promptLine = childAt(view.root, 3);
    expect(childAt(promptLine, 0).textContent).toBe("C:\\>");
    expect(childAt(promptLine, 1).textContent).toBe("\u2588");
    view.destroy();
  });

  it("字体面走 CSS 变量,逻辑字号 12px / 行高 13px", () => {
    const view = makeTerminal(0);
    const styles = stylesOf(view.root);
    expect(styles.get("font-family")).toBe("var(--gazer-terminal-font)");
    expect(styles.get("font-size")).toBe("12px");
    expect(styles.get("line-height")).toBe("13px");
    view.destroy();
  });

  it("历史保留:多行追加不清空,逐行落在内容区", () => {
    const view = makeTerminal(2);
    view.appendSpeaker("01", "one");
    view.appendSpeaker("02", "two");
    view.appendSpeaker("01", "three");
    expect(view.body.children.length).toBe(3);
    expect(childAt(view.body, 0).textContent).toBe("01: one");
    expect(childAt(view.body, 2).textContent).toBe("01: three");
    view.destroy();
  });

  it("台词格式 speaker: text,说话者段着个体色", () => {
    const view = makeTerminal(2);
    view.appendSpeaker("03", "hello");
    const line = childAt(view.body, 0);
    const speakerSpan = childAt(line, 0);
    expect(speakerSpan.textContent).toBe("03: ");
    expect(speakerSpan.styles.get("color")).toBe(speakerColor("03"));
    view.destroy();
  });

  it("系统行带 [SYSTEM] 前缀并着 sys_blue", () => {
    const view = makeTerminal(3);
    view.appendSystem("ontology revised.");
    const line = childAt(view.body, 0);
    expect(line.textContent).toBe("[SYSTEM] ontology revised.");
    expect(childAt(line, 0).styles.get("color")).toBe(TERMINAL_PALETTE_LATE.sysBlue);
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 行宽 §3.3:严格 cols 列,断词不拆字
// ---------------------------------------------------------------------------

describe("行宽(§3.3)", () => {
  it("任何行都不超过列宽,且在词边界断行", () => {
    const rows = wrapTerminalLine("the quick brown fox jumps over the lazy dog", 12);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(12);
    }
    expect(rows[0]).toBe("the quick");
  });

  it("超长词硬折防顶破窗口", () => {
    const rows = wrapTerminalLine("aaaaaaaaaaaaaa", 6);
    expect(rows).toEqual(["aaaaaa", "aaaaaa", "aa"]);
  });

  it("多段落按换行分别折行", () => {
    const rows = wrapTerminalLine("one two\nthree", 8);
    expect(rows).toEqual(["one two", "three"]);
  });
});

// ---------------------------------------------------------------------------
// 假打字机 × DOM:字符按确定性表揭示,镜面律同步冻结显示
// ---------------------------------------------------------------------------

describe("假打字机揭示(显示层)", () => {
  it("render 按机器 charIndex 逐字揭示,完成后定稿回 IDLE", () => {
    const view = makeTerminal(2);
    const run = view.startFakeType("01", "hello", 100);
    const line = lastLine(view);
    const span = childAt(line, 1);
    expect(span.textContent).toBe("");
    const cum: number[] = [];
    let acc = 0;
    for (const interval of run.intervals) {
      acc += interval;
      cum.push(acc);
    }
    view.render(100 + cum[1]!);
    expect(span.textContent).toBe("he");
    view.render(100 + cum[2]!);
    expect(span.textContent).toBe("hel");
    view.render(100 + cum[4]!);
    expect(span.textContent).toBe("hello");
    expect(view.render(100 + cum[4]!).state).toBe("IDLE");
    view.destroy();
  });

  it("镜面律期间显示冻结,停输 300ms 后续播", () => {
    const view = makeTerminal(2);
    const run = view.startFakeType("01", "abcdefgh", 0);
    const line = lastLine(view);
    const span = childAt(line, 1);
    const firstTwo = run.intervals[0]! + run.intervals[1]!;
    view.render(firstTwo);
    expect(span.textContent).toBe("ab");
    // 玩家开始输入并持续 5s。
    for (let t = firstTwo; t <= firstTwo + 5000; t += 100) {
      view.playerTyped(t);
    }
    const resumeAt = firstTwo + 5000 + MIRROR_RESUME_MS;
    view.render(resumeAt - 1);
    expect(span.textContent).toBe("ab");
    view.render(resumeAt + run.intervals[2]!);
    expect(span.textContent).toBe("abc");
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 正典打印通道(票 0029,[N2]):70ms/字符匀速,与 LLM 台词通道分离
// ---------------------------------------------------------------------------

describe("正典打印通道(票 0029)", () => {
  it("canon 轮整轮等间隔 70ms,零方差,meta 双标记分离", () => {
    expect(CANON_PRINT_MS_PER_CHAR).toBe(70);
    const run = canonTypeRun("day 12. we gave them one eye each.");
    expect(run.intervals).toHaveLength(run.text.length);
    for (const interval of run.intervals) {
      expect(interval).toBe(70);
    }
    expect(std(run.intervals)).toBe(0);
    expect(run.meta.fake_typing).toBe(false);
    expect(run.meta.canon).toBe(true);
  });

  it("startCanonPrint 落 [SYSTEM] 蓝行,字符按匀速逐个揭示", () => {
    const view = makeTerminal(3);
    const text = canonLine("fragment.f1") ?? "";
    const run = view.startCanonPrint(text, 0);
    const line = lastLine(view);
    expect((line as unknown as { className: string }).className).toContain(
      "gazer-terminal__line--system",
    );
    const span = childAt(line, 0);
    expect(stylesOf(span).get("color")).toBe(TERMINAL_PALETTE_LATE.sysBlue);
    // 匀速:69ms 时零字符,210ms 时恰三字符——机器在背诵,不是在即兴。
    view.render(69);
    expect(span.textContent).toBe("");
    view.render(3 * CANON_PRINT_MS_PER_CHAR);
    expect(span.textContent).toBe(text.slice(0, 3));
    view.render(run.text.length * CANON_PRINT_MS_PER_CHAR);
    expect(span.textContent).toBe(text);
    expect(view.render(run.text.length * CANON_PRINT_MS_PER_CHAR).state).toBe("IDLE");
    view.destroy();
  });

  it("正典轮与假打字轮互斥:后到者 finishTyping 掉队者", () => {
    const view = makeTerminal(3);
    view.startCanonPrint("first", 0);
    view.startFakeType("01", "second", 10);
    // 光标机已切到假打字轮,正典行不再推进。
    const snap = view.render(10 + 60);
    expect(snap.state).toBe("TYPE");
    expect(snap.charIndex).toBeLessThanOrEqual(2);
    view.destroy();
  });

  it("F8 前置行与 F1 正文均为冻结 canon,逐字可打印", () => {
    expect(canonLine("terminal.last_one")).toBe("> last one. it is dated.");
    const f1 = canonLine("fragment.f1") ?? "";
    expect(f1).toBe(
      "day 12. we gave them one eye each. one is enough.\n" +
        "two eyes learn to look away. one eye learns to hold.",
    );
  });
});

// ---------------------------------------------------------------------------
// 阶段切换:色板双阶段表随 setStage 换轨
// ---------------------------------------------------------------------------

describe("setStage", () => {
  it("阶段 2→3:标题栏从糖果蓝转暗,输入随之解锁", () => {
    const view = makeTerminal(2);
    const titleBar = childAt(view.root, 0);
    expect(titleBar.styles.get("background")).toBe(TERMINAL_PALETTE_EARLY.termTitleBg);
    expect(titleBar.styles.get("color")).toBe("#FFFFFF");
    view.setStage(3);
    expect(titleBar.styles.get("background")).toBe(TERMINAL_PALETTE_LATE.termTitleBg);
    expect(titleBar.styles.get("color")).toBe(TERMINAL_PALETTE_LATE.promptGray);
    expect(view.submitInput("hi", 100)).toEqual({
      accepted: true,
      denied: false,
      echo: "hi",
    });
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 红线自检:确定性、不下载字体、不进 RT-CONTEXT
// ---------------------------------------------------------------------------

describe("红线自检", () => {
  // 去掉注释再查:红线针对代码行为,不针对说明文字里提到这些词本身。
  function stripComments(source: string): string {
    let out = "";
    let index = 0;
    while (index < source.length) {
      const two = source.slice(index, index + 2);
      if (two === "//") {
        const newline = source.indexOf("\n", index);
        index = newline === -1 ? source.length : newline;
        continue;
      }
      if (two === "/*") {
        const end = source.indexOf("*/", index + 2);
        index = end === -1 ? source.length : end + 2;
        continue;
      }
      out += source[index];
      index += 1;
    }
    return out;
  }

  const code = stripComments(
    readFileSync(join(process.cwd(), "src", "ui", "terminal.ts"), "utf8"),
  );

  it("零随机源、零系统时钟:全文件确定性", () => {
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/Date\.now/);
    expect(code).not.toMatch(/performance\.now/);
    expect(code).not.toMatch(/new Date\(/);
  });

  it("不下载字体文件:无 @font-face、无 url()、无 fetch", () => {
    expect(code).not.toMatch(/@font-face/);
    expect(code).not.toMatch(/url\(/);
    expect(code).not.toMatch(/\bfetch\(/);
  });

  it("终端不进 RT-CONTEXT:director 层零引用", () => {
    const dir = join(process.cwd(), "src", "director");
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      if (text.includes("ui/terminal")) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D-04 dom_erosion 六步(ART-CORE-02 §6.4,票 0026)+ D-07 scroll_whisper
// ---------------------------------------------------------------------------

describe("侵蚀纯面(§6.4)", () => {
  it("触发序:GV 80/84/88/92/96/100 → step 1–6,禁跳步的序表本身单调", () => {
    expect(EROSION_STEP_GV).toEqual([80, 84, 88, 92, 96, 100]);
    expect(erosionStepForGv(79)).toBe(0);
    expect(erosionStepForGv(80)).toBe(1);
    expect(erosionStepForGv(83)).toBe(1);
    expect(erosionStepForGv(84)).toBe(2);
    expect(erosionStepForGv(88)).toBe(3);
    expect(erosionStepForGv(92)).toBe(4);
    expect(erosionStepForGv(96)).toBe(5);
    expect(erosionStepForGv(100)).toBe(6);
    expect(erosionStepForGv(101)).toBe(6);
    expect(erosionStepForGv(Number.NaN)).toBe(0);
  });

  it("step 1 窗口漂移:每 100 tick(2 游戏小时)1px,朝西(x 负向),不可逆累计", () => {
    expect(erosionDriftPx(0)).toEqual({ x: 0, y: 0 });
    expect(erosionDriftPx(99)).toEqual({ x: 0, y: 0 });
    expect(erosionDriftPx(100)).toEqual({ x: -1, y: 0 });
    expect(erosionDriftPx(250)).toEqual({ x: -2, y: 0 });
    expect(erosionDriftPx(Number.NaN)).toEqual({ x: 0, y: 0 });
  });

  it("step 2 历史自改:节奏取每 100 tick 一条(执行器默认,规范只给触发点)", () => {
    expect(redactCount(0)).toBe(0);
    expect(redactCount(99)).toBe(0);
    expect(redactCount(100)).toBe(1);
    expect(redactCount(250)).toBe(2);
  });

  it("step 3 标题栏异变:路径逐字符替换为个体名", () => {
    expect(erodePath("C:\\GAZERLING\\THRESHOLD.EXE", "gazer_03")).toBe(
      "C:\\gazer_03\\gazer_03\\gazer_03",
    );
  });

  it("step 5 输入劫持:yes → yes yes yes,或插入 we hear you(确定性交替)", () => {
    expect(hijackInput("yes", 0)).toBe("yes yes yes");
    expect(hijackInput("yes", 1)).toBe("yes " + HIJACK_INSERT_TEXT);
    expect(HIJACK_INSERT_TEXT).toBe("we hear you");
    expect(hijackInput("  ", 0)).toBe("  ");
  });

  it("step 6 终态行 key 与 canon 逐字一致:it is done", () => {
    expect(EROSION_DONE_LINE_KEY).toBe("terminal.it_is_done");
    expect(canonLine(EROSION_DONE_LINE_KEY)).toBe("> it is done.");
  });

  it("D-07 滚动耳语:落点钳制在 [0, max]", () => {
    expect(whisperScrollTop(5, 10, 100)).toBe(15);
    expect(whisperScrollTop(0, -10, 100)).toBe(0);
    expect(whisperScrollTop(95, 10, 100)).toBe(100);
    expect(whisperScrollTop(Number.NaN, 10, 100)).toBe(10);
    expect(whisperScrollTop(5, Number.NaN, 100)).toBe(5);
  });
});

describe("侵蚀视层:禁跳步与六步落屏", () => {
  it("applyErosion 严格禁跳步:只接受恰为当前步 +1 的请求", () => {
    const view = makeTerminal(4);
    expect(view.applyErosion(3)).toBe(false);
    expect(view.applyErosion(0)).toBe(false);
    expect(view.applyErosion(1)).toBe(true);
    expect(view.applyErosion(1)).toBe(false);
    expect(view.applyErosion(3)).toBe(false);
    expect(view.applyErosion(2)).toBe(true);
    view.destroy();
  });

  it("advanceErosion 逐帧排干:目标可跨阈值,但每次只 +1", () => {
    const view = makeTerminal(4);
    expect(view.advanceErosion(6, 1000)).toBe(true);
    expect(view.advanceErosion(6, 1010)).toBe(true);
    expect(view.advanceErosion(6, 1020)).toBe(true);
    expect(view.advanceErosion(6, 1030)).toBe(true);
    expect(view.advanceErosion(6, 1040)).toBe(true);
    expect(view.advanceErosion(6, 1050)).toBe(true);
    expect(view.advanceErosion(6, 1060)).toBe(false);
    view.destroy();
  });

  it("step 2:最旧台词逐条替换为 [REDACTED] 灰块(确定性节奏)", () => {
    const view = makeTerminal(4);
    view.appendSpeaker("01", "old one");
    view.appendSpeaker("02", "old two");
    view.advanceErosion(6, 1000); // step 1
    view.advanceErosion(6, 1010); // step 2,锚点 1010
    expect(view.advanceErosion(2, 1015)).toBe(false);
    expect(childAt(view.body, 0).textContent).toBe("01: old one");
    view.advanceErosion(6, 1110); // 100 tick 后第一条
    expect(childAt(view.body, 0).textContent).toBe(REDACTED_TEXT);
    expect(childAt(view.body, 0).attributes.get("data-redacted")).toBe("1");
    expect(childAt(view.body, 1).textContent).toBe("02: old two");
    view.advanceErosion(6, 1210); // 200 tick 后第二条
    expect(childAt(view.body, 1).textContent).toBe(REDACTED_TEXT);
    view.destroy();
  });

  it("step 3:标题栏路径逐字符替换为个体名(票 0044 nit:非一步到位)", () => {
    const view = makeTerminal(4);
    view.setErosionName("gazer_03");
    view.advanceErosion(6, 1000);
    view.advanceErosion(6, 1010);
    view.advanceErosion(6, 1020); // step 3 锚点 1020
    const pathSpan = childAt(childAt(view.root, 0), 0);
    const original = "C:\\GAZERLING\\THRESHOLD.EXE";
    const target = erodePath(original, "gazer_03");
    // 锚点当帧:0 字符替换,仍是原路径。
    expect(pathSpan.textContent).toBe(original);
    // 每 100 tick 一字符(EROSION_PATH_TICKS_PER_CHAR);advanceErosion(3, t)
    // 只刷新持续性侵蚀面,不再推步。前 3 字符("C:\")两态相同,视觉未变。
    view.advanceErosion(3, 1400);
    expect(pathSpan.textContent).toBe(target.slice(0, 3) + original.slice(3));
    view.advanceErosion(3, 1500);
    expect(pathSpan.textContent).toBe(target.slice(0, 4) + original.slice(4));
    view.advanceErosion(3, 1600);
    expect(pathSpan.textContent).toBe(target.slice(0, 5) + original.slice(5));
    // 替换满整段即终态(target 长 29)。
    view.advanceErosion(3, 4000);
    expect(pathSpan.textContent).toBe(target);
    // 缺省面:未 setErosionName 的另一台终端落 EROSION_NAME_FALLBACK。
    const view2 = makeTerminal(4);
    view2.advanceErosion(6, 1000);
    view2.advanceErosion(6, 1010);
    view2.advanceErosion(6, 1020);
    view2.advanceErosion(3, 4000);
    expect(childAt(childAt(view2.root, 0), 0).textContent).toBe(
      erodePath(original, EROSION_NAME_FALLBACK),
    );
    view.destroy();
    view2.destroy();
  });

  it("step 4:光标脱离输入行在内容区漂移,个体名下划线", () => {
    const view = makeTerminal(4);
    view.appendSpeaker("01", "watch me");
    const promptLine = childAt(view.root, 3);
    expect(childAt(promptLine, 1).textContent).toBe("\u2588");
    view.advanceErosion(6, 1000);
    view.advanceErosion(6, 1010);
    view.advanceErosion(6, 1020);
    view.advanceErosion(6, 1030);
    // 光标已迁入内容区:prompt 行剩 prompt 文本与 CORRUPT 剪影画布(占位)。
    expect(promptLine.children).toHaveLength(2);
    expect(childAt(promptLine, 0).textContent).toBe("C:\\>");
    const cursorInBody = childAt(view.body, view.body.children.length - 1);
    expect(cursorInBody.textContent).toBe("\u2588");
    expect(cursorInBody.styles.get("position")).toBe("absolute");
    // 漂移轨迹确定性:同 tick 同位置。
    const x = cursorInBody.styles.get("left");
    view.advanceErosion(6, 1030);
    expect(cursorInBody.styles.get("left")).toBe(x);
    // 个体名下划线。
    const line = childAt(view.body, 0);
    expect(line.attributes.get("data-eroded")).toBe("1");
    expect(childAt(line, 0).styles.get("text-decoration")).toBe("underline");
    view.destroy();
  });

  it("step 5:提交前字符被替换,玩家失去对『自己说话』的所有权", () => {
    const view = makeTerminal(4);
    for (let i = 0; i < 5; i += 1) {
      view.advanceErosion(6, 1000 + i * 10);
    }
    const first = view.submitInput("yes", 2000);
    expect(first?.echo).toBe("yes yes yes");
    const second = view.submitInput("yes", 2100);
    expect(second?.echo).toBe("yes we hear you");
    view.destroy();
  });

  it("step 6:终端全黑 1 帧,之后永久显示 > it is done.(canon 逐字)", () => {
    const view = makeTerminal(4);
    for (let i = 0; i < 5; i += 1) {
      view.advanceErosion(6, 1000 + i * 10);
    }
    const before = view.body.children.length;
    view.advanceErosion(6, 1050); // step 6
    // 第 1 帧:全黑。
    view.render(0);
    expect(stylesOf(view.root).get("background")).toBe("#000000");
    expect(stylesOf(view.body).get("visibility")).toBe("hidden");
    // 第 2 帧:恢复并落终态行。
    view.render(16);
    expect(stylesOf(view.body).get("visibility")).toBe("visible");
    const doneLine = childAt(view.body, view.body.children.length - 1);
    expect(doneLine.textContent).toBe("> it is done.");
    expect(view.body.children.length).toBe(before + 1);
    // 终态行只发生一次。
    view.render(32);
    expect(view.body.children.length).toBe(before + 1);
    view.destroy();
  });
});
