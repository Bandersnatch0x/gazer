import { describe, expect, it } from "vitest";
import { familyTreePanel, pupilPanel, type FamilyTreeNode } from "../src/ui/panels";
import type { Doc } from "../src/ui/shell";

class FakeNode {
  className = "";
  private ownText = "";
  readonly style = { paddingLeft: "", cssText: "" };
  readonly children: FakeNode[] = [];
  parent: FakeNode | null = null;
  readonly attributes = new Map<string, string>();
  width = 0;
  height = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(readonly tagName: string) {}

  // textContent 与真 DOM 同语义:读时递归拼接子节点,写时落在自身。
  get textContent(): string {
    if (this.children.length === 0) {
      return this.ownText;
    }
    return (
      this.ownText + this.children.map((child) => child.textContent).join("")
    );
  }

  set textContent(value: string) {
    this.ownText = value;
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

  getContext(): null {
    return null;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeNode {
    return new FakeNode(tagName);
  }
}

const doc = new FakeDocument() as unknown as Doc;

describe("pupilPanel 画与文同轨 (C7)", () => {
  function captionOf(stage: number): string {
    const panel = pupilPanel(doc, "zh", stage);
    const caption = panel.root.children[1];
    return caption?.textContent ?? "";
  }

  it("stage 0 still talks about grass and the caretaker", () => {
    expect(captionOf(0)).toBe("瞳孔里：草地，和一个饲养员的轮廓。");
  });

  it("stage 1-2 talk about the cursor, matching the drawn green dot", () => {
    expect(captionOf(1)).toBe("瞳孔里：一个绿点。昨天还没有。");
    expect(captionOf(2)).toBe("瞳孔里：一个绿点。昨天还没有。");
  });

  it("stage 3+ talk about the cursor that has become an eye", () => {
    expect(captionOf(3)).toBe("瞳孔里：你的光标。它在那里已经有一会儿了。");
    expect(captionOf(4)).toBe("瞳孔里：你的光标。它在那里已经有一会儿了。");
  });
});

describe("familyTreePanel (§10.5-6)", () => {
  const nodes: readonly FamilyTreeNode[] = [
    { id: "01", name: "铃", alive: true },
    { id: "02", name: null, alive: false, traitsInherited: true },
    {
      id: "03",
      name: "三",
      alive: false,
      parentLinks: { parentA: "01", parentB: "02" },
    },
    {
      id: "04",
      name: null,
      alive: true,
      parentLinks: { parentA: "03" },
      traitsInherited: true,
    },
  ];

  function itemsOf(root: FakeNode): FakeNode[] {
    const list = root.children.find((child) => child.tagName === "ul");
    return list?.children ?? [];
  }

  function itemFor(root: FakeNode, id: string): FakeNode | undefined {
    return itemsOf(root).find((item) => item.attributes.get("data-creature-id") === id);
  }

  it("renders every creature as a node labelled by name, falling back to id", () => {
    const panel = familyTreePanel(doc, "zh", nodes, () => undefined);
    const root = panel.root as unknown as FakeNode;
    expect(itemsOf(root).length).toBe(4);
    const first = itemFor(root, "01");
    expect(first?.textContent).toContain("铃");
    const second = itemFor(root, "02");
    expect(second?.textContent).toContain("02");
  });

  it("indents children under their parents following the frozen parentLinks shape", () => {
    const panel = familyTreePanel(doc, "zh", nodes, () => undefined);
    const root = panel.root as unknown as FakeNode;
    const child = itemFor(root, "03");
    expect(child?.attributes.get("data-parents")).toBe("01 02");
    expect(child?.style.paddingLeft).toBe("16px");
    const grandchild = itemFor(root, "04");
    expect(grandchild?.style.paddingLeft).toBe("32px");
    const root1 = itemFor(root, "01");
    expect(root1?.style.paddingLeft).toBe("");
  });

  it("marks dead nodes whose learned traits survive in descendants", () => {
    const panel = familyTreePanel(doc, "zh", nodes, () => undefined);
    const root = panel.root as unknown as FakeNode;
    expect(itemFor(root, "02")?.textContent).toContain("学到的已传下去");
    expect(itemFor(root, "03")?.textContent).not.toContain("学到的已传下去");
    // 活着的节点不需要这个标记。
    expect(itemFor(root, "04")?.textContent).not.toContain("学到的已传下去");
  });

  it("emits the creature id on pick so node detail can reuse the album entry", () => {
    const picked: string[] = [];
    const panel = familyTreePanel(doc, "zh", nodes, (id) => picked.push(id));
    const root = panel.root as unknown as FakeNode;
    const button = itemFor(root, "04")?.children[0];
    button?.click();
    expect(picked).toEqual(["04"]);
    panel.destroy();
  });

  it("accepts the C-stream node primitive through the documented signature", () => {
    const calls: string[] = [];
    const panel = familyTreePanel(doc, "zh", nodes, () => undefined, {
      renderNode: (innerDoc, node) => {
        calls.push(node.id);
        const span = innerDoc.createElement("span");
        span.className = "c-node";
        span.textContent = `prim:${node.id}`;
        return span;
      },
    });
    const root = panel.root as unknown as FakeNode;
    expect(calls).toEqual(["01", "02", "03", "04"]);
    expect(itemFor(root, "03")?.textContent).toContain("prim:03");
    panel.destroy();
  });

  it("survives unknown parents and cyclic parentLinks without hanging", () => {
    const weird: readonly FamilyTreeNode[] = [
      { id: "x", name: null, alive: true, parentLinks: { parentA: "ghost" } },
      { id: "y", name: null, alive: true, parentLinks: { parentA: "z", parentB: "x" } },
      { id: "z", name: null, alive: true, parentLinks: { parentA: "y" } },
    ];
    const panel = familyTreePanel(doc, "zh", weird, () => undefined);
    const root = panel.root as unknown as FakeNode;
    expect(itemsOf(root).length).toBe(3);
    // ghost 不在名单里:按深度 0 画。
    expect(itemFor(root, "x")?.style.paddingLeft).toBe("");
    panel.destroy();
  });
});
