import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Doc } from "../src/ui/shell";
import {
  CORRUPT_FLASH_PERIOD,
  CORRUPT_GRID,
  CURSOR_ON_MS,
  TERMINAL_GHOST_FADE_MS,
  TERMINAL_GHOST_HOLD_MS,
  TERMINAL_GHOST_OPACITY,
  TERMINAL_PATH_DIR,
  corruptFlashDue,
  corruptFlashSlot,
  corruptSilhouette,
  createTerminal,
  erodePath,
  erodePathAt,
  EROSION_PATH_TICKS_PER_CHAR,
  ghostOpacityFor,
  terminalPathFor,
} from "../src/ui/terminal";
import type { TerminalView } from "../src/ui/terminal";
import { gvDeltaFor } from "../src/sim/ledger";
import { terminalTypeIntervals } from "../src/game";

// ---------------------------------------------------------------------------
// 假 DOM(与 ui-terminal.test.ts 同路数;不实现 getContext → 画格跳过)。
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
  scrollTop = 0;
  scrollHeight = 0;

  constructor(readonly tagName: string) {}

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

  appendChild(child: FakeNode): FakeNode {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: FakeNode[]): void {
    for (const node of nodes) this.appendChild(node);
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

function childAt(node: unknown, index: number): FakeNode {
  const container = node as { children: unknown[] };
  return container.children[index] as FakeNode;
}

function stylesOf(node: unknown): Map<string, string> {
  return (node as FakeNode).styles;
}

function makeTerminal(stage: number): TerminalView {
  return createTerminal(doc, { stage, path: "C:\\GAZERLING\\THRESHOLD.EXE" });
}

function promptLineOf(view: TerminalView): FakeNode {
  return childAt(view.root, 3);
}

// ---------------------------------------------------------------------------
// 交付形状 1:阶段门控(§6.0/§6.1)
// ---------------------------------------------------------------------------

describe("阶段门控(§6.0/§6.1)", () => {
  it("幽灵曲线:40% 平台 3 秒 → 600ms 线性淡出 → 0", () => {
    expect(TERMINAL_GHOST_OPACITY).toBe(0.4);
    expect(TERMINAL_GHOST_HOLD_MS).toBe(3000);
    expect(TERMINAL_GHOST_FADE_MS).toBe(600);
    expect(ghostOpacityFor(0)).toBe(0.4);
    expect(ghostOpacityFor(2999)).toBeCloseTo(0.4);
    expect(ghostOpacityFor(3000)).toBeCloseTo(0.4);
    expect(ghostOpacityFor(3300)).toBeCloseTo(0.2);
    expect(ghostOpacityFor(3599)).toBeGreaterThan(0);
    expect(ghostOpacityFor(3600)).toBe(0);
    expect(ghostOpacityFor(-1)).toBe(0.4);
  });

  it("构造即落位:阶段 3+ 常驻,0–2 默认隐藏(无常驻迹象)", () => {
    const resident = makeTerminal(3);
    expect(stylesOf(resident.root).get("display")).toBe("flex");
    expect(stylesOf(resident.root).get("opacity")).toBe("1");
    resident.destroy();
    const hidden = makeTerminal(0);
    expect(stylesOf(hidden.root).get("display")).toBe("none");
    hidden.destroy();
  });

  it("ghost:浮现 40% 不透明度,3s 后整窗淡出,散场清历史(不可回看)", () => {
    const view = makeTerminal(0);
    view.setPresence("ghost", 100);
    expect(stylesOf(view.root).get("display")).toBe("flex");
    expect(stylesOf(view.root).get("opacity")).toBe("0.4");
    // 平台期不透明度恒 40%。
    view.render(2000);
    expect(stylesOf(view.root).get("opacity")).toBe("0.4");
    // 淡出段线性下降(elapsed 3300 → 0.2)。
    view.render(3400);
    expect(Number(stylesOf(view.root).get("opacity"))).toBeCloseTo(0.2);
    // 淡出完成:display 收起、历史清空、光标回 IDLE。
    view.appendSpeaker("01", "ghost words");
    view.render(4000);
    expect(stylesOf(view.root).get("display")).toBe("none");
    expect(view.body.children).toHaveLength(0);
    expect(view.render(4000).state).toBe("IDLE");
    view.destroy();
  });

  it("resident 与 hidden 显式切换,hidden 即无任何常驻迹象", () => {
    const view = makeTerminal(0);
    view.setPresence("resident", 0);
    expect(stylesOf(view.root).get("display")).toBe("flex");
    expect(stylesOf(view.root).get("opacity")).toBe("1");
    view.setPresence("hidden", 0);
    expect(stylesOf(view.root).get("display")).toBe("none");
    view.destroy();
  });

  it("幽灵期间窗口仍在底部 90% 固定位,位置永不移动", () => {
    const view = makeTerminal(0);
    view.setPresence("ghost", 0);
    const styles = stylesOf(view.root);
    expect(styles.get("position")).toBe("fixed");
    expect(styles.get("bottom")).toBe("0");
    expect(styles.get("width")).toBe("90%");
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 交付形状 3:fingerprint 派生标题栏
// ---------------------------------------------------------------------------

describe("标题栏路径派生(§3.1)", () => {
  it("同 seed 恒同路径,路径落在 §3.1 示例族内", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (seed) => {
        const path = terminalPathFor(seed);
        expect(path).toBe(terminalPathFor(seed));
        expect(path.startsWith(TERMINAL_PATH_DIR)).toBe(true);
        expect(["THRESHOLD.EXE", "MONITOR.EXE", "WINDOW.EXE"].some((name) => path.endsWith(name))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("家族内轮转:不同 seed 可落到不同族名", () => {
    const names = new Set<string>();
    for (let seed = 0; seed < 24; seed += 1) {
      names.add(terminalPathFor(seed));
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it("非法 seed 落到确定首族,不抛错", () => {
    expect(terminalPathFor(Number.NaN)).toBe(terminalPathFor(0));
  });
});

// ---------------------------------------------------------------------------
// 交付形状 4:CORRUPT 光标闪现(阶段 4)
// ---------------------------------------------------------------------------

describe("CORRUPT 剪影(§4.2 阶段 4)", () => {
  it("剪影确定性:同 id 同拍恒同图,异拍异图,恰 64 格且非空", () => {
    const a = corruptSilhouette("gazer_01", 3);
    expect(a).toEqual(corruptSilhouette("gazer_01", 3));
    expect(a).toHaveLength(CORRUPT_GRID * CORRUPT_GRID);
    expect(a.some((cell) => cell)).toBe(true);
    let differing = 0;
    for (let frame = 0; frame < CORRUPT_FLASH_PERIOD * 3; frame += 1) {
      if (JSON.stringify(corruptSilhouette("gazer_01", frame)) !== JSON.stringify(a)) {
        differing += 1;
      }
    }
    expect(differing).toBeGreaterThan(0);
  });

  it("闪现槽在周期内且确定性;到期判定按 530ms 拍距", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        const slot = corruptFlashSlot(id);
        expect(slot).toBe(corruptFlashSlot(id));
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(CORRUPT_FLASH_PERIOD);
      }),
      { numRuns: 200 },
    );
    const slot = corruptFlashSlot("01");
    const dueAt = slot * CURSOR_ON_MS;
    expect(corruptFlashDue(dueAt, "01")).toBe(true);
    // 拍内整段都算到期;下一拍才翻转。
    expect(corruptFlashDue(dueAt + CURSOR_ON_MS - 1, "01")).toBe(true);
    expect(corruptFlashDue(dueAt + CURSOR_ON_MS, "01")).toBe(false);
    expect(corruptFlashDue(dueAt + CURSOR_ON_MS * CORRUPT_FLASH_PERIOD, "01")).toBe(true);
  });

  function litDueNowFor(speaker: string): number {
    // 亮拍:beat 为偶;到期:beat ≡ slot (mod 8)。取最小同时满足的拍。
    const slot = corruptFlashSlot(speaker);
    const beat = slot % 2 === 0 ? slot : slot + CORRUPT_FLASH_PERIOD;
    return beat * CURSOR_ON_MS;
  }

  it("阶段 4 光标亮起:轮到拍剪影顶替光标块,恰 1 渲染帧", () => {
    const view = makeTerminal(4);
    view.appendSpeaker("01", "watch");
    const promptLine = promptLineOf(view);
    const now = litDueNowFor("01");
    // 第 1 帧:剪影上屏,光标块藏起。
    const first = view.render(now);
    expect(first.corruptFlash).toBe(true);
    expect(childAt(promptLine, 2).styles.get("display")).toBe("inline-block");
    expect(childAt(promptLine, 1).styles.get("visibility")).toBe("hidden");
    // 第 2 帧(同拍):回光标块——恰 1 帧闪现。
    const second = view.render(now + 16);
    expect(second.corruptFlash).toBe(false);
    expect(childAt(promptLine, 2).styles.get("display")).toBe("none");
    expect(childAt(promptLine, 1).styles.get("visibility")).toBe("visible");
    view.destroy();
  });

  it("阶段 <4 或光标灭帧:不闪", () => {
    const view = makeTerminal(3);
    view.appendSpeaker("01", "not yet");
    const now = litDueNowFor("01");
    expect(view.render(now).corruptFlash).toBe(false);
    view.destroy();
    // 灭帧(阶段 4,到期拍的下一拍必为灭态):不闪。
    const view4 = makeTerminal(4);
    view4.appendSpeaker("01", "watch");
    const darkNow = litDueNowFor("01") + CURSOR_ON_MS;
    expect(view4.render(darkNow).corruptFlash).toBe(false);
    view4.destroy();
  });
});

// ---------------------------------------------------------------------------
// 交付形状 2(终端侧):真 token 通道入口
// ---------------------------------------------------------------------------

describe("startTokenType(真 token 通道)", () => {
  it("轮按给定间隔逐字揭示,meta.fake_typing:false,说话者着个体色", () => {
    const view = makeTerminal(3);
    const run = view.startTokenType("01", "abc", [40, 90, 220], 500);
    expect(run.meta.fake_typing).toBe(false);
    expect(run.intervals).toEqual([40, 90, 220]);
    const line = childAt(view.body, view.body.children.length - 1);
    const span = childAt(line, 1);
    expect(span.textContent).toBe("");
    // 起点 500:intervals [40,90,220] → 字符 1 @540、字符 2 @630、字符 3 @850。
    view.render(540);
    expect(span.textContent).toBe("a");
    view.render(650); // 40+90 已过 → 2 字符
    expect(span.textContent).toBe("ab");
    view.render(860); // 全部揭示
    expect(span.textContent).toBe("abc");
    expect(view.render(860).state).toBe("IDLE");
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// 交付形状 2(game 侧):真实请求延迟 → 确定性抖动间隔
// ---------------------------------------------------------------------------

describe("terminalTypeIntervals(延迟摊布)", () => {
  it("总时长贴合真实延迟(±夹带容差),逐字非匀速", () => {
    const rolls = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.15];
    const intervals = terminalTypeIntervals(5000, 10, rolls);
    expect(intervals).toHaveLength(10);
    const total = intervals.reduce((sum, v) => sum + v, 0);
    // 抖动摊布后总和贴合延迟:500ms/字符均值上下抖,总差有界。
    expect(total).toBeGreaterThan(2500);
    expect(total).toBeLessThan(7500);
    expect(new Set(intervals).size).toBeGreaterThan(1);
  });

  it("确定性:同延迟同 roll 序列恒同轮;非正输入落最小拍", () => {
    const first = terminalTypeIntervals(1234, 5, [0.2, 0.4, 0.6, 0.8, 1]);
    const second = terminalTypeIntervals(1234, 5, [0.2, 0.4, 0.6, 0.8, 1]);
    expect(first).toEqual(second);
    for (const interval of terminalTypeIntervals(-5, 3, [0.5, 0.5, 0.5])) {
      expect(interval).toBeGreaterThanOrEqual(40);
    }
  });
});

// ---------------------------------------------------------------------------
// 交付形状 6(终端侧):erodePathAt 逐字符
// ---------------------------------------------------------------------------

describe("erodePathAt 逐字符替换(§6.4 step 3)", () => {
  const path = "C:\\GAZERLING\\THRESHOLD.EXE";
  const name = "gazer_03";

  it("0 字符 = 原路径;满段 = erodePath 终态;中段逐字对齐", () => {
    const target = erodePath(path, name);
    expect(erodePathAt(path, name, 0)).toBe(path);
    expect(erodePathAt(path, name, target.length)).toBe(target);
    expect(erodePathAt(path, name, target.length + 99)).toBe(target);
    const mid = erodePathAt(path, name, 6);
    expect(mid).toBe(target.slice(0, 6) + path.slice(6));
    expect(mid.startsWith(target.slice(0, 6))).toBe(true);
    expect(mid.endsWith(path.slice(6))).toBe(true);
  });

  it("节奏常量与历史自改同拍:每 100 tick 一字符", () => {
    expect(EROSION_PATH_TICKS_PER_CHAR).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 交付形状 5:Ledger terminal_line(0029 惯例:叙事流,不喂 GV)
// ---------------------------------------------------------------------------

describe("Ledger terminal_line(§8)", () => {
  it("权重 0:白天黑夜都不动 GV(叙事流,照 glyph_read 惯例)", () => {
    expect(gvDeltaFor({ kind: "terminal_line", speaker: "01", text: "we see you", intent: "observe", mood: "curious" }, 12)).toBe(0);
    expect(gvDeltaFor({ kind: "terminal_line", speaker: "01", text: "we see you", intent: "observe", mood: "curious" }, 3)).toBe(0);
  });

  it("正典打印行与手动池台词的 null 面:无谁在说、无回合意图", () => {
    expect(gvDeltaFor({ kind: "terminal_line", speaker: null, text: "> channel established.", intent: null, mood: null }, 12)).toBe(0);
  });
});
