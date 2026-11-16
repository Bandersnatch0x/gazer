import { describe, expect, it } from "vitest";
import type { MemorySlice } from "../src/sim/memory";
import type { AlbumCreature } from "../src/ui/album";
import { createAlbum, decodePlayerRecord } from "../src/ui/album";
import { createDialogue } from "../src/ui/dialogue";
import { HELP_SECTIONS, createHelp } from "../src/ui/help";

/**
 * 极简 DOM 桩：只实现 shell.ts 实际用到的那几个成员。
 * 目的是让装配函数真的跑一遍，而不是只靠类型检查。
 */
class StubNode {
  readonly tag: string;
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (() => void)[]>();
  readonly children: StubNode[] = [];
  readonly style = {
    properties: new Map<string, string>(),
    setProperty: (name: string, value: string): void => {
      this.style.properties.set(name, value);
    },
  };
  className = "";
  id = "";
  type = "";
  private ownText = "";

  constructor(tag: string) {
    this.tag = tag;
  }

  get firstChild(): StubNode | null {
    return this.children[0] ?? null;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children.length = 0;
  }

  append(...nodes: StubNode[]): void {
    this.children.push(...nodes);
  }

  removeChild(node: StubNode): void {
    const index = this.children.indexOf(node);
    if (index !== -1) {
      this.children.splice(index, 1);
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, handler: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  walk(): readonly StubNode[] {
    return [this, ...this.children.flatMap((child) => child.walk())];
  }
}

class StubDocument {
  readonly head = new StubNode("head");
  readonly created: StubNode[] = [];

  createElement(tag: string): StubNode {
    const node = new StubNode(tag);
    this.created.push(node);
    return node;
  }

  createTextNode(value: string): StubNode {
    const node = new StubNode("#text");
    node.textContent = value;
    return node;
  }

  getElementById(): StubNode | null {
    return null;
  }
}

function doc(): Document {
  return new StubDocument() as unknown as Document;
}

function asStub(node: unknown): StubNode {
  return node as StubNode;
}

function slice(): MemorySlice {
  return {
    working: [
      {
        id: "mem_1",
        atTick: 4,
        wallClock: "02:14",
        fact: "02 starved while you watched",
        witnessed: "witnessed",
        source: null,
        distortion: null,
        salience: 0.8,
        valence: -0.9,
      },
      {
        id: "mem_2",
        atTick: 5,
        wallClock: "02:15",
        fact: "the keeper counts our breaths",
        witnessed: "heard",
        source: "01",
        distortion: null,
        salience: 0.5,
        valence: -0.4,
      },
      {
        id: "mem_3",
        atTick: 6,
        wallClock: "02:16",
        fact: "the tower grew in the dark",
        witnessed: "witnessed",
        source: null,
        distortion: "invent_detail",
        salience: 0.4,
        valence: -0.2,
      },
    ],
    consolidated: [
      {
        id: "cons_031",
        content: "your human once lied to you about 02",
        derivedFrom: ["mem_1"],
        consolidatedAt: "02:30",
        perspectiveNote: null,
      },
    ],
  };
}

describe("dialogue box", () => {
  it("assembles a terminal window with a title bar and a fake path", () => {
    const view = createDialogue(doc(), "en");
    const root = asStub(view.root);
    expect(root.className).toBe("gazer-dialogue");
    const bar = root.children.find((child) => child.className === "gazer-dialogue__bar");
    expect(bar?.textContent).toContain("C:\\GAZER\\1997\\LIVE\\roundtable.exe");
  });

  it("gives every rendered line a witness mark with a full aria label", () => {
    const view = createDialogue(doc(), "en");
    view.showLine({ speaker: "01", text: "it was already dead", status: "heard" }, "en");
    const marks = asStub(view.root)
      .walk()
      .filter((node) => node.className === "gazer-witness");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.getAttribute("aria-label")).toContain("Told");
    expect(marks[0]?.getAttribute("data-status")).toBe("heard");
  });

  it("shows the empty-script line only when there is no script", () => {
    const view = createDialogue(doc(), "zh");
    view.showLines([], "zh");
    expect(asStub(view.root).textContent).toContain("信道开着");
  });
});

describe("album panel", () => {
  const creature: AlbumCreature = {
    id: "01",
    generation: 2,
    impression: -0.3,
    behavior: "hungry",
    traits: {
      curiosity: 0.8,
      loyalty: 0.6,
      deceit: 0.1,
      clinging: 0.4,
      watchfulness: 0.9,
    },
    memory: slice(),
  };
  const memorial = {
    day: 1,
    clock: "12:00",
    everLived: 3,
    gone: 0,
    maxGeneration: 2,
    feeds: 5,
    cleans: 2,
    deaths: 0,
    names: ["铃"],
    gazeSeconds: 30,
    shellClock: null,
    news: null,
    factions: 2,
    glyphsRead: 0,
    stage: 2,
    seed: 1997,
  };

  it("renders the creature fields the player needs", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], memorial, "en");
    const rows = asStub(view.root).walk().filter((node) => node.className === "gazer-album__row");
    expect(rows).toHaveLength(1);
    const text = rows[0]?.textContent ?? "";
    expect(text).toContain("01");
    expect(text).toContain("gen 2");
    expect(text).toContain("-0.30");
    // The care state is a word, not a dial (ticket 0089): the registry
    // reports what it observed — hungry is hungry, in both voices.
    expect(text).toContain("condition");
    expect(text).toContain("hungry");
    expect(text).toContain("watchfulness");
    expect(text).toContain("curiosity");
    expect(text).toContain("3 of 60");
    expect(text).toContain("1 of 12");
    expect(text).toContain("your human once lied to you about 02");
  });

  it("names the care state in the reader's language, dead included", () => {
    const view = createAlbum(doc(), "zh");
    view.render([creature], memorial, "zh");
    const text = asStub(view.root).textContent ?? "";
    expect(text).toContain("状态");
    expect(text).toContain("饿着");
    const gone: AlbumCreature = { ...creature, id: "02", behavior: "dead" };
    const second = createAlbum(doc(), "zh");
    second.render([gone], memorial, "zh");
    expect(asStub(second.root).textContent ?? "").toContain("不在了");
  });

  it("distinguishes witnessed from heard, including a distorted memory shown as fabricated", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], memorial, "en");
    const statuses = asStub(view.root)
      .walk()
      .filter((node) => node.className === "gazer-album__memory")
      .map((node) => node.getAttribute("data-status"));
    expect(statuses).toEqual(["witnessed", "heard", "fabricated"]);
    expect(asStub(view.root).textContent).toContain(
      "seen 1 / told 1 / guessed 0 / made up 1",
    );
  });

  it("renders the empty state in both languages", () => {
    const en = createAlbum(doc(), "en");
    en.render([], memorial, "en");
    expect(asStub(en.root).textContent).toContain("Nothing hatched yet.");

    const zh = createAlbum(doc(), "zh");
    zh.render([], memorial, "zh");
    expect(asStub(zh.root).textContent).toContain("还没有孵出任何一只。");
  });

  it("carries the world memorial section after the creatures (ticket 0011)", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], memorial, "en");
    const memorialNodes = asStub(view.root)
      .walk()
      .filter((node) => node.className === "gazer-album__memorial");
    expect(memorialNodes).toHaveLength(1);
    const text = memorialNodes[0]?.textContent ?? "";
    expect(text).toContain("WORLD RECORD");
    expect(text).toContain("DAY 1");
    expect(text).toContain("12:00");
    expect(text).toContain("ever lived");
    expect(text).toContain("highest generation");
    expect(text).toContain("fed 5 · cleaned 2 · died 0");
    expect(text).toContain("铃");
    expect(text).toContain("30s");
    expect(text).toContain("has not confessed yet");
    expect(text).toContain("quiet");
  });

  it("the memorial speaks both languages", () => {
    const zh = createAlbum(doc(), "zh");
    zh.render([], { ...memorial, names: [], shellClock: "00:32", news: "第 1 日。单元普查。" }, "zh");
    const text = asStub(zh.root)
      .walk()
      .filter((node) => node.className === "gazer-album__memorial")[0]?.textContent ?? "";
    expect(text).toContain("世界纪念");
    expect(text).toContain("第 1 日");
    expect(text).toContain("来过的");
    expect(text).toContain("养护账");
    expect(text).toContain("喂 5 · 清洁 2 · 死亡 0");
    expect(text).toContain("还没有");
    expect(text).toContain("00:32");
    expect(text).toContain("第 1 日。单元普查。");
  });

  it("the tower entry and the faction line render only when earned (ticket 0017)", () => {
    // Two factions: the line and the always-empty tower entry both show.
    const both = createAlbum(doc(), "en");
    both.render([creature], memorial, "en");
    const withText = asStub(both.root).textContent;
    expect(withText).toContain("Right now, they are two factions.");
    expect(withText).toContain("THE TOWER");
    expect(withText).toContain("It has always been empty");

    // No factions: the line stays silent; the tower entry remains (it is the
    // one entry that is empty forever).
    const none = createAlbum(doc(), "en");
    none.render([], { ...memorial, factions: 0 }, "en");
    const text = asStub(none.root).textContent;
    expect(text).not.toContain("Right now, they are two factions.");
    expect(text).toContain("THE TOWER");
  });

  it("carries the player's own always-decoding entry after the memorial (§9.1-1)", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], memorial, "en");
    const entryNodes = asStub(view.root)
      .walk()
      .filter((node) => node.className === "gazer-album__player-entry");
    expect(entryNodes).toHaveLength(1);
    const entryText = entryNodes[0]?.textContent ?? "";
    // The record exists, it is titled, and it is never fully readable.
    expect(entryText).toContain("YOUR RECORD");
    expect(entryText).toContain("decoding. this entry is not yours to write.");
    // The record line itself is distorted (the note is the only readable
    // sentence on the entry; the blocks guarantee it).
    const recordNodes = asStub(view.root)
      .walk()
      .filter((node) => node.className === "gazer-album__player-record");
    expect(recordNodes).toHaveLength(1);
    const recordText = recordNodes[0]?.textContent ?? "";
    expect(recordText).toContain("█");
    expect(recordText).not.toBe("fed 5 · cleaned 2 · died 0 · gazed 30s · named 铃");
  });

  it("the player entry speaks both languages", () => {
    const zh = createAlbum(doc(), "zh");
    zh.render([creature], memorial, "zh");
    const text = asStub(zh.root).textContent ?? "";
    expect(text).toContain("你的条目");
    expect(text).toContain("解码中。这条记录不归你写。");
  });
});

describe("decodePlayerRecord (§9.1-1): the entry that never finishes decoding", () => {
  const RAW = "fed 5 · cleaned 2 · died 0 · gazed 30s · named moss";

  it("is deterministic for the same (seed, day, stage)", () => {
    expect(decodePlayerRecord(RAW, 2, 1, 1997)).toBe(decodePlayerRecord(RAW, 2, 1, 1997));
  });

  it("never completes: even the final stage keeps part of the record blocked", () => {
    for (const stage of [0, 1, 2, 3, 4]) {
      const decoded = decodePlayerRecord(RAW, stage, 1, 1997);
      expect(decoded).toContain("█");
      expect(decoded.length).toBe(RAW.length);
    }
  });

  it("reveals more as the stage climbs, word shapes stay", () => {
    const blocked = (text: string): number => (text.match(/█/g) ?? []).length;
    const early = blocked(decodePlayerRecord(RAW, 0, 1, 1997));
    const late = blocked(decodePlayerRecord(RAW, 4, 1, 1997));
    expect(late).toBeLessThan(early);
    // 空格与分隔符不遮:词形保留,遮住一半比全遮更瘆人。
    const decoded = decodePlayerRecord(RAW, 1, 1, 1997);
    expect(decoded.split(" ").length).toBe(RAW.split(" ").length);
    for (let index = 0; index < RAW.length; index += 1) {
      const rawChar = RAW[index] ?? "";
      if (rawChar === " " || rawChar === "·") {
        expect(decoded[index]).toBe(rawChar);
      }
    }
  });

  it("the decoding drifts across days (逐字解码中), then holds within one day", () => {
    const day1 = decodePlayerRecord(RAW, 2, 1, 1997);
    const day2 = decodePlayerRecord(RAW, 2, 2, 1997);
    expect(day1).not.toBe(day2);
    expect(decodePlayerRecord(RAW, 2, 1, 1997)).toBe(day1);
  });

  it("clamps impossible stages and survives weird input", () => {
    expect(decodePlayerRecord(RAW, -3, 1, 1997)).toBe(decodePlayerRecord(RAW, 0, 1, 1997));
    expect(decodePlayerRecord(RAW, 9, 1, 1997)).toBe(decodePlayerRecord(RAW, 4, 1, 1997));
    expect(decodePlayerRecord("", 2, 1, 1997)).toBe("");
    expect(decodePlayerRecord(RAW, Number.NaN, 1, 1997)).toBe(decodePlayerRecord(RAW, 0, 1, 1997));
  });
});

describe("help panel", () => {
  it("renders exactly six sections in both languages", () => {
    expect(HELP_SECTIONS).toHaveLength(6);
    for (const locale of ["en", "zh"] as const) {
      const view = createHelp(doc(), locale);
      const sections = asStub(view.root)
        .walk()
        .filter((node) => node.className === "gazer-help__section");
      expect(sections).toHaveLength(6);
    }
  });

  it("names the six required subjects", () => {
    const ids = HELP_SECTIONS.map((entry) => entry.id);
    expect(ids).toEqual(["whatThisIs", "goal", "controls", "swarm", "ontology", "silentRun"]);
  });
});
