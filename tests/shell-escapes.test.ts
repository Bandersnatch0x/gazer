import { describe, expect, it } from "vitest";
import { mutateTitle, onVisibilityReturn, setFaviconEye, showOutsideEyes } from "../src/shell/escapes";

class FakeNode {
  readonly attributes = new Map<string, string>();
  readonly style = { cssText: "" };
  textContent = "";
  readonly children: FakeNode[] = [];
  parent: FakeNode | null = null;

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  appendChild(child: FakeNode): void {
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }
}

class FakeCanvas extends FakeNode {
  width = 0;
  height = 0;
  private readonly context = {
    fillStyle: "black",
    clearRect(): void {},
    fillRect(): void {},
    beginPath(): void {},
    ellipse(): void {},
    arc(): void {},
    fill(): void {},
  };

  constructor() {
    super("canvas");
  }

  getContext(kind: string): typeof this.context | null {
    return kind === "2d" ? this.context : null;
  }

  toDataURL(): string {
    return "data:image/png;base64,c3R1Yg==";
  }
}

function isIconLink(node: FakeNode): boolean {
  return node.tagName === "link" && (node.getAttribute("rel") ?? "").split(/\s+/).includes("icon");
}

class FakeDocument {
  title = "GAZER";
  visibilityState: "visible" | "hidden" = "visible";
  readonly head = new FakeNode("head");
  readonly body = new FakeNode("body");
  private readonly listeners = new Set<() => void>();

  createElement(tagName: string): FakeNode {
    return tagName === "canvas" ? new FakeCanvas() : new FakeNode(tagName);
  }

  querySelector(selector: string): FakeNode | null {
    if (!selector.includes('rel~="icon"')) return null;
    return this.collect(this.head).find(isIconLink) ?? null;
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener);
  }

  setVisibility(state: "visible" | "hidden"): void {
    this.visibilityState = state;
    for (const listener of [...this.listeners]) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private collect(root: FakeNode): FakeNode[] {
    return root.children.flatMap((child) => [child, ...this.collect(child)]);
  }
}

function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document;
}

function iconLinks(fake: FakeDocument): FakeNode[] {
  return fake.head.children.filter(isIconLink);
}

describe("setFaviconEye", () => {
  it("installs exactly one icon link and cleanup removes it", () => {
    const fake = new FakeDocument();
    const cleanup = setFaviconEye(0.7, asDocument(fake));
    const links = iconLinks(fake);
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toMatch(/^data:image\/png/);
    cleanup();
    expect(iconLinks(fake)).toHaveLength(0);
  });

  it("replaces the existing icon link instead of adding a second", () => {
    const fake = new FakeDocument();
    const original = new FakeNode("link");
    original.setAttribute("rel", "icon");
    original.setAttribute("href", "old.png");
    fake.head.appendChild(original);

    const cleanup = setFaviconEye(0.2, asDocument(fake));
    expect(iconLinks(fake)).toHaveLength(1);
    expect(iconLinks(fake)[0]).toBe(original);
    expect(original.getAttribute("href")).toMatch(/^data:image\/png/);

    cleanup();
    expect(iconLinks(fake)).toHaveLength(1);
    expect(original.getAttribute("href")).toBe("old.png");
  });

  it("does nothing when the document has no canvas context", () => {
    class BlindCanvas extends FakeCanvas {
      override getContext(): null {
        return null;
      }
    }
    const fake = new FakeDocument();
    fake.createElement = (tagName: string): FakeNode =>
      tagName === "canvas" ? new BlindCanvas() : new FakeNode(tagName);
    const cleanup = setFaviconEye(1, asDocument(fake));
    expect(iconLinks(fake)).toHaveLength(0);
    cleanup();
  });
});

describe("mutateTitle", () => {
  it("sets exactly the given text and restores the previous title on cleanup", () => {
    const fake = new FakeDocument();
    fake.title = "GAZER";
    const cleanup = mutateTitle("they are looking", asDocument(fake));
    expect(fake.title).toBe("they are looking");
    cleanup();
    expect(fake.title).toBe("GAZER");
  });
});

describe("onVisibilityReturn", () => {
  it("reports the hidden duration when the tab returns", () => {
    const fake = new FakeDocument();
    let clock = 1000;
    const seen: number[] = [];
    const cleanup = onVisibilityReturn((hiddenMs) => seen.push(hiddenMs), asDocument(fake), () => clock);

    fake.setVisibility("hidden");
    clock = 4500;
    fake.setVisibility("visible");

    expect(seen).toEqual([3500]);
    cleanup();
  });

  it("reports a non-negative duration when the clock runs backwards", () => {
    const fake = new FakeDocument();
    let clock = 8000;
    const seen: number[] = [];
    const cleanup = onVisibilityReturn((hiddenMs) => seen.push(hiddenMs), asDocument(fake), () => clock);

    fake.setVisibility("hidden");
    clock = 2000;
    fake.setVisibility("visible");

    expect(seen).toEqual([0]);
    cleanup();
  });

  it("counts a hidden tab from subscription time", () => {
    const fake = new FakeDocument();
    fake.visibilityState = "hidden";
    let clock = 100;
    const seen: number[] = [];
    const cleanup = onVisibilityReturn((hiddenMs) => seen.push(hiddenMs), asDocument(fake), () => clock);

    clock = 700;
    fake.setVisibility("visible");
    expect(seen).toEqual([600]);
    cleanup();
  });

  it("does not fire without a hidden period and removes its listener on cleanup", () => {
    const fake = new FakeDocument();
    const seen: number[] = [];
    const cleanup = onVisibilityReturn((hiddenMs) => seen.push(hiddenMs), asDocument(fake), () => 0);

    fake.setVisibility("visible");
    expect(seen).toHaveLength(0);
    expect(fake.listenerCount).toBe(1);

    cleanup();
    expect(fake.listenerCount).toBe(0);
    fake.setVisibility("hidden");
    fake.setVisibility("visible");
    expect(seen).toHaveLength(0);
  });
});

describe("showOutsideEyes", () => {
  it("appends eyes to the page outside the canvas and removes every node on cleanup", () => {
    const fake = new FakeDocument();
    expect(fake.body.children).toHaveLength(0);

    const cleanup = showOutsideEyes(0.4, asDocument(fake));
    expect(fake.body.children).toHaveLength(1);
    const layer = fake.body.children[0];
    expect(layer?.tagName).toBe("div");
    expect(layer?.style.cssText).toContain("position:fixed");
    expect(layer?.style.cssText).toContain("opacity:0.4");
    expect(layer?.children.length).toBeGreaterThan(0);

    cleanup();
    expect(fake.body.children).toHaveLength(0);
  });

  it("clamps opacity above one", () => {
    const fake = new FakeDocument();
    const cleanup = showOutsideEyes(9, asDocument(fake));
    expect(fake.body.children[0]?.style.cssText).toContain("opacity:1");
    cleanup();
  });
});
