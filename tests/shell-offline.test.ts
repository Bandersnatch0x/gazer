import { describe, expect, expectTypeOf, it } from "vitest";
import {
  OFFLINE_NOTICE_TEXT,
  showOfflineNotice,
  watchConnection,
  type ConnectionWindow,
} from "../src/shell/offline";

class FakeWindow implements ConnectionWindow {
  readonly navigator = { onLine: true };
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: "online" | "offline", listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: "online" | "offline", listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: "online" | "offline"): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  get listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}

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

class FakeDocument {
  readonly body = new FakeNode("body");

  createElement(tagName: string): FakeNode {
    return new FakeNode(tagName);
  }
}

describe("watchConnection", () => {
  it("accepts a real Window without adaptation", () => {
    expectTypeOf<Window>().toMatchTypeOf<ConnectionWindow>();
  });

  it("reports each online and offline transition once", () => {
    const win = new FakeWindow();
    const seen: string[] = [];
    const cleanup = watchConnection((state) => seen.push(state), win);

    win.emit("offline");
    win.emit("offline");
    win.emit("online");
    win.emit("online");

    expect(seen).toEqual(["offline", "online"]);
    cleanup();
  });

  it("removes its listeners on cleanup", () => {
    const win = new FakeWindow();
    const cleanup = watchConnection(() => undefined, win);
    expect(win.listenerCount).toBe(2);
    cleanup();
    expect(win.listenerCount).toBe(0);
    win.emit("offline");
  });
});

describe("showOfflineNotice", () => {
  it("surfaces a quiet in-fiction line, not an error banner, and removes it on cleanup", () => {
    const fake = new FakeDocument();
    const cleanup = showOfflineNotice(fake as unknown as Document);

    expect(fake.body.children).toHaveLength(1);
    const notice = fake.body.children[0];
    expect(notice?.tagName).toBe("div");
    expect(notice?.textContent).toBe(OFFLINE_NOTICE_TEXT);
    expect(notice?.attributes.get("role")).toBe("status");
    expect(notice?.attributes.get("role")).not.toBe("alert");

    cleanup();
    expect(fake.body.children).toHaveLength(0);
  });
});
