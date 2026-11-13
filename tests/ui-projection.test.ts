/**
 * Ticket 0058: the OSD reflection channel and the auxiliary-input arming of
 * the terminal's set-dressing button. The assertions are the spec's (SPEC
 * §10.4–10.6): nothing reachable before the unlock (the button has no
 * listener before arming), the OSD never becomes a third bloom point (no
 * glow, dim ink), and an open channel survives a locale switch.
 */
import { describe, expect, it } from "vitest";
import type { Doc } from "../src/ui/shell";
import { createReflectionChannel, type ReflectionSnapshot } from "../src/ui/projection";
import { createTerminal } from "../src/ui/terminal";
import type { PredictionClaim, Reflection } from "../src/sim/projection";

// ---------------------------------------------------------------------------
// 假 DOM:与 ui-terminal.test.ts 同路数。
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
  hidden = false;
  private readonly listeners = new Map<string, Set<(event: never) => void>>();

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

  replaceChildren(...nodes: FakeNode[]): void {
    this.children.length = 0;
    for (const node of nodes) this.appendChild(node);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: never) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  click(): void {
    const event = { stopPropagation(): void {}, preventDefault(): void {} };
    for (const listener of [...(this.listeners.get("click") ?? [])]) listener(event as never);
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
  return (node as { children: unknown[] }).children[index] as FakeNode;
}

function node(nodeLike: unknown): FakeNode {
  return nodeLike as FakeNode;
}

function fixtureSnapshot(locale: "en" | "zh" = "en"): ReflectionSnapshot {
  const node = (
    topic: Reflection["nodes"][number]["topic"],
    claimEn: string,
    confidence: number,
    traceChain: readonly string[],
  ): Reflection["nodes"][number] => ({
    topic,
    claimEn,
    claimZh: claimEn,
    heldBy: ["gazer_01"],
    confidence,
    meanValence: 0,
    traceChain,
    divergence: 0.5,
  });
  const reflection: Reflection = {
    day: 3,
    nodes: [
      node("sky", "the sky elsewhere burned orange until noon", 0.6, ["out_sky_d3"]),
      node("market", "no outside events to report", 0, []),
      node("crowd", "a crowd gathered and could not say why", 0.4, ["out_crowd_d2"]),
      node("player", "the hand is warm", 0.3, ["mem_feed_01"]),
    ],
  };
  const predictions: readonly PredictionClaim[] = [
    { id: "pred_d4", topic: "market", resolvesOnDay: 4, resolvedTo: null, confidence: 0.6 },
  ];
  return { day: 3, reflection, predictions, locale };
}

describe("the OSD reflection channel (ui/projection.ts)", () => {
  it("starts hidden, opens with four rows, and closes on demand", () => {
    const channel = createReflectionChannel(doc);
    expect(channel.isOpen()).toBe(false);
    expect(node(channel.root).hidden).toBe(true);
    channel.open(fixtureSnapshot());
    expect(channel.isOpen()).toBe(true);
    expect(node(channel.root).hidden).toBe(false);
    const rows = childAt(channel.root, 2);
    expect(rows.children.length).toBe(4);
    channel.close();
    expect(channel.isOpen()).toBe(false);
    expect(node(channel.root).hidden).toBe(true);
  });

  it("never becomes a third bloom point: dim ink, no glow, no shadow", () => {
    const channel = createReflectionChannel(doc);
    const root = node(channel.root);
    channel.open(fixtureSnapshot());
    const rootStyle = root.style as unknown as { textShadow?: string; boxShadow?: string; color?: string };
    expect(rootStyle.textShadow).toBe("none");
    expect(rootStyle.boxShadow).toBe("none");
    // The OSD ink is dimmer than the terminal cursor's canonical brightness.
    expect(rootStyle.color).toBe("#2f9e58");
  });

  it("the player row carries the local-room marker tone, not the outside tone", () => {
    const channel = createReflectionChannel(doc);
    channel.open(fixtureSnapshot());
    const rows = childAt(channel.root, 2);
    const playerRow = node(rows.children[3]);
    expect(playerRow.textContent).toContain("THIS ROOM");
  });

  it("a row click expands its trace chain; a second click folds it", () => {
    const channel = createReflectionChannel(doc);
    channel.open(fixtureSnapshot());
    const rows = childAt(channel.root, 2);
    const skyRow = node(rows.children[0]);
    expect(skyRow.textContent).not.toContain("out_sky_d3");
    skyRow.click();
    // Rerender replaces the rows container's children.
    const expanded = childAt(channel.root, 2).children[0] as FakeNode;
    expect(expanded.textContent).toContain("out_sky_d3");
    expanded.click();
    const folded = childAt(channel.root, 2).children[0] as FakeNode;
    expect(folded.textContent).not.toContain("out_sky_d3");
  });

  it("an open channel re-renders in place on a locale switch", () => {
    const channel = createReflectionChannel(doc);
    channel.open(fixtureSnapshot("en"));
    const title = childAt(channel.root, 0);
    expect(title.textContent).toContain("SIGNAL: AUX INPUT");
    channel.refresh(fixtureSnapshot("zh"));
    expect(node(channel.root).hidden).toBe(false);
    expect(childAt(channel.root, 0).textContent).toContain("辅助输入");
    expect(childAt(channel.root, 0).textContent).not.toContain("SIGNAL");
  });

  it("the open prediction reads as a guess, never as a promise", () => {
    const channel = createReflectionChannel(doc);
    channel.open(fixtureSnapshot("en"));
    const prediction = childAt(channel.root, 3);
    expect(prediction.textContent).toContain("they guess tomorrow");
    expect(prediction.textContent).toContain("60%");
  });
});

describe("the auxiliary-input arming (ui/terminal.ts)", () => {
  it("the set-dressing button has no listener until armed, and arms exactly once", () => {
    const terminal = createTerminal(doc, { stage: 3, path: "C:\\GAZERLING\\THRESHOLD.EXE" });
    // Before arming: the fake button is inert (SPEC §10.4 mainline guard).
    const titleBar = childAt(terminal.root, 0);
    const fakeButton = childAt(titleBar, 1);
    let opened = 0;
    node(fakeButton).click();
    expect(opened).toBe(0);
    expect(terminal.armAuxiliary(() => {
      opened += 1;
    })).toBe(true);
    expect(terminal.armAuxiliary(() => {
      opened += 10;
    })).toBe(false);
    node(fakeButton).click();
    expect(opened).toBe(1);
  });
});
