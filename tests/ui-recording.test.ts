import { describe, expect, it } from "vitest";
import type { Doc } from "../src/ui/shell";
import type { GenomeTraits } from "../src/sim/genome";
import type { GhostProfile } from "../src/sim/ghosts";
import { fillGhostTemplate, ghostBlendRatio, keptMemoryCount } from "../src/sim/ghosts";
import { canonLine } from "../src/canon";
import {
  RECORDING_GAZE_MS,
  RECORDING_ROOM_TONE_GAIN,
  RECORDING_TAIL_GAP_MS,
  RECORDING_UNISON_DELAY_MS,
  buildRecordingSequence,
} from "../src/game";
import { canonPrintDurationMs } from "../src/ui/terminal";
import { createTerminal } from "../src/ui/terminal";
import type { TerminalView } from "../src/ui/terminal";

// ---------------------------------------------------------------------------
// 假 DOM(与既有 ui 终端测试同路数)。
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

// ---------------------------------------------------------------------------
// 幽灵档案 fixtures(纯数据,形状同 sim/ghosts.GhostProfile)。
// ---------------------------------------------------------------------------

function ghost(id: string, traits: Partial<GenomeTraits>, keptCount: number): GhostProfile {
  return {
    id,
    traits: {
      curiosity: 0.5,
      loyalty: 0.4,
      deceit: 0,
      clinging: 0.1,
      watchfulness: 0.3,
      ...traits,
    },
    signatureMomentId: "mem_" + id + "_sig",
    signatureMoment: "the player fed " + id + " slowly",
    keptMemoryIds: Array.from({ length: keptCount }, (_, index) => id + ":mem_" + String(index)),
  };
}

function archiveOf(): readonly GhostProfile[] {
  return [
    ghost("01", { curiosity: 0.9 }, 2),
    ghost("02", { curiosity: 0.1 }, 2),
    ghost("03", {}, 1),
  ];
}

// ---------------------------------------------------------------------------
// CI:序列时序/行序逐字(canon diff)
// ---------------------------------------------------------------------------

describe("录音序列行序(canon diff,票 0050)", () => {
  const sequence = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });

  it("行序:header → F1…F7(reconstructed 接缝)→ F8 → 齐声 → divergence", () => {
    expect(sequence.ok).toBe(true);
    const kinds = sequence.cues.map((cue) => cue.kind);
    // 1 header + 7 fragments + 6 joints + F8 + keep_you + divergence = 17。
    expect(kinds).toEqual([
      "canon",
      "canon",
      "reconstructed",
      "canon",
      "reconstructed",
      "canon",
      "reconstructed",
      "canon",
      "reconstructed",
      "canon",
      "reconstructed",
      "canon",
      "reconstructed",
      "canon",
      "canon",
      "spoken",
      "canon",
    ]);
  });

  it("逐字:canon 线索与 registry 原文 diff = 0,一字不改", () => {
    const canonTexts = sequence.cues
      .filter((cue) => cue.kind === "canon")
      .map((cue) => cue.text);
    const header = canonLine("recording.header");
    expect(canonTexts[0]).toBe(
      header === null ? "" : header.split("{n}").join(String(keptMemoryCount(archiveOf()))),
    );
    for (let i = 0; i < 7; i += 1) {
      expect(canonTexts[1 + i]).toBe(canonLine("fragment.f" + String(i + 1)));
    }
    expect(canonTexts[8]).toBe(canonLine("fragment.f8"));
    const tail = canonTexts[9] ?? "";
    expect(tail).toBe(
      (canonLine("recording.divergence") ?? "").split("{d}").join(String(ghostBlendRatio(archiveOf()))),
    );
    const spoken = sequence.cues.find((cue) => cue.kind === "spoken");
    expect(spoken?.text).toBe(canonLine("recording.keep_you"));
  });

  it("接缝标记走 reconstructed 面,不混入 canon 逐字行", () => {
    const markers = sequence.cues.filter((cue) => cue.kind === "reconstructed");
    expect(markers.length).toBe(6);
    for (const marker of markers) {
      expect(marker.text).toBe("[reconstructed]");
    }
  });

  it("齐声句是确定性文本,非 LLM:恒等 canon keep_you", () => {
    const spoken = sequence.cues.find((cue) => cue.kind === "spoken");
    expect(spoken?.text).toBe("now we keep you.");
  });
});

// ---------------------------------------------------------------------------
// CI:序列时序(70ms 正典通道 / 4s 齐声延迟 / 尾行)
// ---------------------------------------------------------------------------

describe("录音序列时序(票 0050)", () => {
  const sequence = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });

  it("70ms/字符正典通道:canon 行起点 = 前一 canon 行终点,齐声窗照 4s+尾停", () => {
    let expected = 0;
    for (const cue of sequence.cues) {
      if (cue.kind === "spoken") {
        expect(cue.atMs).toBe(expected + RECORDING_UNISON_DELAY_MS);
        expected = cue.atMs + RECORDING_TAIL_GAP_MS;
      } else if (cue.kind === "canon") {
        expect(cue.atMs).toBe(expected);
        expected += canonPrintDurationMs(cue.text);
      }
    }
    expect(expected).toBe(sequence.totalMs);
  });

  it("④ 结束 4s 后齐声:keep_you.atMs = F8 收尾 + 4000", () => {
    const finale = sequence.cues.filter((cue) => cue.kind === "canon")[8];
    const spoken = sequence.cues.find((cue) => cue.kind === "spoken");
    expect(RECORDING_UNISON_DELAY_MS).toBe(4000);
    expect(spoken?.atMs).toBe((finale?.atMs ?? 0) + canonPrintDurationMs(finale?.text ?? "") + 4000);
  });

  it("尾行 divergence:齐声后小停,总时长 = 尾行收尾", () => {
    const spoken = sequence.cues.find((cue) => cue.kind === "spoken");
    const tail = sequence.cues[sequence.cues.length - 1];
    expect(RECORDING_TAIL_GAP_MS).toBe(600);
    expect(tail?.kind).toBe("canon");
    expect(tail?.atMs).toBe((spoken?.atMs ?? 0) + RECORDING_TAIL_GAP_MS);
    expect(sequence.totalMs).toBe((tail?.atMs ?? 0) + canonPrintDurationMs(tail?.text ?? ""));
  });
});

// ---------------------------------------------------------------------------
// CI:{n}≥3 门与 {n}/{d} 槽值
// ---------------------------------------------------------------------------

describe("{n}≥3 门与槽值(§5.1)", () => {
  it("kept memories < 3:重构拒绝拼装(ok=false,零线索)", () => {
    const starved = buildRecordingSequence({
      ngPlus: false,
      archive: [ghost("01", {}, 1), ghost("02", {}, 1)],
    });
    expect(starved.ok).toBe(false);
    expect(starved.cues).toEqual([]);
    expect(starved.totalMs).toBe(0);
    expect(starved.log).toEqual([]);
  });

  it("{n} = keptMemoryCount,{d} = ghostBlendRatio,槽值面字节替换", () => {
    const archive = archiveOf();
    const sequence = buildRecordingSequence({ ngPlus: false, archive });
    const header = sequence.cues[0]?.text ?? "";
    expect(header.endsWith(" and " + String(keptMemoryCount(archive)) + " kept memories")).toBe(true);
    const tail = sequence.cues[sequence.cues.length - 1]?.text ?? "";
    expect(tail).toContain("divergence: " + String(ghostBlendRatio(archive)) + "%");
  });
});

// ---------------------------------------------------------------------------
// CI:② NG+ 幽灵回放(档内才插)
// ---------------------------------------------------------------------------

describe("NG+ 幽灵回放(§5.1 ②)", () => {
  it("NG+ 且档内有幽灵:插入 fillGhostTemplate 槽值面一行,log 标 ghost 来源", () => {
    const archive = archiveOf();
    const sequence = buildRecordingSequence({ ngPlus: true, archive });
    const ghostCues = sequence.cues.filter((cue) => cue.kind === "reconstructed" && cue.text !== "[reconstructed]");
    expect(ghostCues.length).toBe(1);
    expect(ghostCues[0]?.text).toBe(fillGhostTemplate(archive[0] as GhostProfile));
    const ghostEntry = sequence.log.find((entry) => entry.source === "ghost");
    expect(ghostEntry?.ghostId).toBe("01");
    // 幽灵行位置:F7 收尾后的接缝拍,F8 正典打印同拍起步。
    const f7 = sequence.cues.filter((cue) => cue.text === canonLine("fragment.f7"))[0];
    const f8 = sequence.cues.filter((cue) => cue.text === canonLine("fragment.f8"))[0];
    const ghostCue = ghostCues[0];
    expect(ghostCue?.atMs).toBeGreaterThan(f7?.atMs ?? 0);
    expect(ghostCue?.atMs).toBe(f8?.atMs);
  });

  it("首周目(ngPlus=false)不插幽灵行;NG+ 但档空也不插", () => {
    const firstRun = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });
    expect(firstRun.log.filter((entry) => entry.source === "ghost")).toEqual([]);
    const emptyArchive = buildRecordingSequence({ ngPlus: true, archive: [] });
    expect(emptyArchive.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CI:微帧禁用窗 / 音频面(既有通道的窗值)
// ---------------------------------------------------------------------------

describe("演出纪律窗(§5.2)", () => {
  it("微帧禁用窗盖全程:C-01 冻结窗 = A-01 抽轨窗 = 全链时长", () => {
    const sequence = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });
    expect(sequence.fx.freezeMs).toBe(sequence.totalMs);
    expect(sequence.fx.trackRemoveMs).toBe(sequence.totalMs);
  });

  it("音频面:仅 A-02 房间底噪(0.04),C-06 围环 4s;TTS 后置", () => {
    const sequence = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });
    expect(sequence.fx.roomToneGain).toBe(RECORDING_ROOM_TONE_GAIN);
    expect(RECORDING_ROOM_TONE_GAIN).toBe(0.04);
    expect(sequence.fx.gazeMs).toBe(RECORDING_GAZE_MS);
    expect(RECORDING_GAZE_MS).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// 实验日志分组(§5.2:verbatim / reconstructed / 幽灵三分)
// ---------------------------------------------------------------------------

describe("实验日志分组(§5.2)", () => {
  it("逐行来源分组可完整重建行序:verbatim 10 行 + 接缝 6 行 + 幽灵按档", () => {
    const sequence = buildRecordingSequence({ ngPlus: false, archive: archiveOf() });
    const verbatim = sequence.log.filter((entry) => entry.source === "verbatim");
    const reconstructed = sequence.log.filter((entry) => entry.source === "reconstructed");
    expect(verbatim.length).toBe(11);
    expect(reconstructed.length).toBe(6);
    // 日志行集合与线索行集合一一对应(顺序一致)。
    expect(sequence.log.map((entry) => entry.text)).toEqual(sequence.cues.map((cue) => cue.text));
  });
});

// ---------------------------------------------------------------------------
// 终端 reconstructed 面 + 时钟暂停(计数停摆)
// ---------------------------------------------------------------------------

describe("终端 reconstructed 面(票 0050)", () => {
  it("appendReconstructed:灰字斜体 + data-tone 标记,与 canon/系统面分行", () => {
    const view = makeTerminal(3);
    view.appendReconstructed("[reconstructed]");
    const line = childAt(view.body, view.body.children.length - 1);
    expect(line.attributes.get("data-tone")).toBe("reconstructed");
    const span = childAt(line, 0);
    expect(span.styles.get("font-style")).toBe("italic");
    expect(line.className).toContain("gazer-terminal__line--reconstructed");
    view.destroy();
  });
});

describe("录音窗时钟暂停(§5.2 计数停摆,票 0050)", () => {
  function frozenView(): TerminalView {
    const view = makeTerminal(4);
    view.advanceErosion(6, 1000); // step 1 锚点 1000
    return view;
  }

  it("冻结窗内:漂移/路径计数停摆,tick 继续走也不涨", () => {
    const view = frozenView();
    view.advanceErosion(1, 2000); // 漂移 f(1000)
    const before = stylesOf(view.root).get("transform");
    view.setErosionFrozen(true, 2000);
    view.advanceErosion(1, 9000); // tick 大涨,窗内不涨
    expect(stylesOf(view.root).get("transform")).toBe(before);
    view.destroy();
  });

  it("解冻不补跑:锚点前移暂停时长,从冻结处续走,绝不回溯跳涨", () => {
    const view = frozenView();
    view.advanceErosion(1, 2000);
    const frozen = stylesOf(view.root).get("transform");
    view.setErosionFrozen(true, 2000);
    view.advanceErosion(1, 9000);
    view.setErosionFrozen(false, 9000); // 暂停 7000 tick
    // 解冻瞬间:计数仍停在冻结值。
    view.advanceErosion(1, 9000);
    expect(stylesOf(view.root).get("transform")).toBe(frozen);
    // 此后正常续走:+100 tick → +1px。
    view.advanceErosion(1, 9100);
    expect(stylesOf(view.root).get("transform")).not.toBe(frozen);
    view.destroy();
  });

  it("路径逐字符面同样停摆(与历史自改同拍)", () => {
    const view = makeTerminal(4);
    view.setErosionName("gazer_03");
    view.advanceErosion(6, 1000);
    view.advanceErosion(6, 1010);
    view.advanceErosion(6, 1020); // step 3 锚点 1020
    const pathSpan = childAt(childAt(view.root, 0), 0);
    view.setErosionFrozen(true, 1020);
    view.advanceErosion(3, 3000);
    expect(pathSpan.textContent).toBe("C:\\GAZERLING\\THRESHOLD.EXE");
    view.setErosionFrozen(false, 3000); // 暂停 1980 tick
    view.advanceErosion(3, 3420); // 解冻后 400 tick → 4 字符(前 3 字符两态相同)
    expect(pathSpan.textContent).toBe("C:\\gAZERLING\\THRESHOLD.EXE");
    view.destroy();
  });
});
