import { describe, expect, it } from "vitest";
import type { MemorySlice } from "../src/sim/memory";
import type { AlbumCreature } from "../src/ui/album";
import { createAlbum } from "../src/ui/album";
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
    traits: {
      curiosity: 0.8,
      loyalty: 0.6,
      deceit: 0.1,
      clinging: 0.4,
      watchfulness: 0.9,
    },
    memory: slice(),
  };

  it("renders the creature fields the player needs", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], "en");
    const rows = asStub(view.root).walk().filter((node) => node.className === "gazer-album__row");
    expect(rows).toHaveLength(1);
    const text = rows[0]?.textContent ?? "";
    expect(text).toContain("01");
    expect(text).toContain("gen 2");
    expect(text).toContain("-0.30");
    expect(text).toContain("watchfulness");
    expect(text).toContain("curiosity");
    expect(text).toContain("3 of 60");
    expect(text).toContain("1 of 12");
    expect(text).toContain("your human once lied to you about 02");
  });

  it("distinguishes witnessed from heard, including a distorted memory shown as fabricated", () => {
    const view = createAlbum(doc(), "en");
    view.render([creature], "en");
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
    en.render([], "en");
    expect(asStub(en.root).textContent).toContain("Nothing hatched yet.");

    const zh = createAlbum(doc(), "zh");
    zh.render([], "zh");
    expect(asStub(zh.root).textContent).toContain("还没有孵出任何一只。");
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
