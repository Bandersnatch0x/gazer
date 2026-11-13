/**
 * Small modal panels: naming, hatch choice, and the pupil close-up.
 * They own layout only. The game decides what a choice means.
 */

import type { CreatureId } from "../sim/types";
import type { Locale, Text } from "./i18n";
import { t } from "./i18n";
import { COPY } from "./copy";
import type { Doc } from "./shell";
import { el } from "./shell";

export interface PanelChoice<T extends string> {
  readonly value: T;
  readonly label: Text;
  readonly note: Text;
}

export interface ChoicePanel {
  readonly root: HTMLElement;
  destroy(): void;
}

export function choicePanel<T extends string>(
  doc: Doc,
  locale: Locale,
  title: Text,
  choices: readonly PanelChoice<T>[],
  onPick: (value: T) => void,
): ChoicePanel {
  const heading = el(doc, "h2", { className: "gazer-panel__title", text: t(locale, title) });
  const buttons = choices.map((choice) => {
    const button = el(doc, "button", {
      className: "gazer-choice",
      attrs: { type: "button" },
    });
    button.append(
      el(doc, "span", { className: "gazer-choice__label", text: t(locale, choice.label) }),
      el(doc, "span", { className: "gazer-choice__note", text: t(locale, choice.note) }),
    );
    button.addEventListener("click", () => onPick(choice.value));
    return button;
  });
  const root = el(doc, "div", { className: "gazer-form", children: [heading, ...buttons] });
  return { root, destroy: () => root.remove() };
}

export interface NamePanel {
  readonly root: HTMLElement;
  focus(): void;
  destroy(): void;
}

export function namePanel(
  doc: Doc,
  locale: Locale,
  onSubmit: (name: string) => void,
): NamePanel {
  const heading = el(doc, "h2", {
    className: "gazer-panel__title",
    text: t(locale, COPY.panels.nameTitle),
  });
  const input = doc.createElement("input");
  input.className = "gazer-input";
  input.maxLength = 24;
  input.setAttribute("aria-label", t(locale, COPY.panels.namePlaceholder));
  input.placeholder = t(locale, COPY.panels.namePlaceholder);
  const button = el(doc, "button", {
    className: "gazer-choice",
    text: t(locale, COPY.panels.confirm),
    attrs: { type: "button" },
  });
  const submit = (): void => {
    const name = input.value.trim();
    if (name.length > 0) {
      onSubmit(name);
    }
  };
  button.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      submit();
    }
  });
  const root = el(doc, "div", { className: "gazer-form", children: [heading, input, button] });
  return {
    root,
    focus: () => input.focus(),
    destroy: () => root.remove(),
  };
}

export interface PupilPanel {
  readonly root: HTMLElement;
  destroy(): void;
}

/** The eye, magnified. Content by stage is the cheapest horror in the game. */
export function pupilPanel(doc: Doc, locale: Locale, stage: number): PupilPanel {
  const eye = doc.createElement("canvas");
  eye.width = 16;
  eye.height = 16;
  eye.className = "gazer-pupil";
  const ctx = eye.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#f2e6c9";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#1a2b1f";
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    // Stage 0 sees grass. Stages 1-2 see the player's cursor arrive. Stage 3+,
    // the cursor has become an eye. Caption and drawing must change together.
    if (stage >= 3) {
      ctx.fillStyle = "#7ef0a6";
      ctx.fillRect(6, 6, 4, 4);
    } else if (stage >= 1) {
      ctx.fillStyle = "#2b6b46";
      ctx.fillRect(7, 7, 2, 2);
    }
  }
  // 画与文同轨(GAME_REVIEW C7):0 草地与饲养员,1-2 光标初现,3+ 光标已成眼睛。
  const captionText = stage >= 3 ? COPY.panels.pupilWatched : stage >= 1 ? COPY.panels.pupilCursor : COPY.panels.pupilGrass;
  const caption = el(doc, "p", {
    className: "gazer-panel__note",
    text: t(locale, captionText),
  });
  const root = el(doc, "div", { className: "gazer-form", children: [eye, caption] });
  return { root, destroy: () => root.remove() };
}

/**
 * 家谱树视图(GAME_REVIEW §10.5-6)。
 *
 * 「会借后代活下去」唯一可见的地方:节点按对玩家的 kind 上色、死亡节点变灰;
 * 死亡节点若其习得特质已在后代身上延续,带传承标记。节点详情复用图鉴条目,
 * 所以这里只把 id 抛回去,不新做详情。数据侧形状归 E 流(冻结形状:
 * `creature.parentLinks?: { parentA?: string; parentB?: string }`);树节点
 * 渲染原语归 C 流——这里按签名先接 stub,原语落位后由调用方传入。
 */

export interface FamilyTreeNode {
  readonly id: CreatureId;
  /** 玩家起的名字;未命名时图上退回编号。 */
  readonly name: string | null;
  readonly alive: boolean;
  readonly parentLinks?: {
    readonly parentA?: string;
    readonly parentB?: string;
  };
  /** 死亡节点专属:其习得特质已在后代身上延续。 */
  readonly traitsInherited?: boolean;
}

/** 树节点渲染原语契约。C 流交付真实实现;stub 只画「名字/编号 + 生死」。 */
export type TreeNodePrimitive = (doc: Doc, node: FamilyTreeNode) => HTMLElement;

function stubTreeNode(doc: Doc, node: FamilyTreeNode): HTMLElement {
  return el(doc, "span", {
    className: node.alive ? "gazer-tree__node" : "gazer-tree__node--dead",
    text: node.name ?? node.id,
  });
}

function parentIdsOf(node: FamilyTreeNode): readonly string[] {
  const links = node.parentLinks;
  if (links === undefined) {
    return [];
  }
  return [links.parentA, links.parentB].filter(
    (parent): parent is string => typeof parent === "string",
  );
}

export interface FamilyTreePanelOptions {
  /** C 流的树节点渲染原语;缺省用 stub。 */
  readonly renderNode?: TreeNodePrimitive;
}

export interface FamilyTreePanel {
  readonly root: HTMLElement;
  destroy(): void;
}

export function familyTreePanel(
  doc: Doc,
  locale: Locale,
  nodes: readonly FamilyTreeNode[],
  onPick: (id: CreatureId) => void,
  options: FamilyTreePanelOptions = {},
): FamilyTreePanel {
  const renderNode = options.renderNode ?? stubTreeNode;
  const heading = el(doc, "h2", {
    className: "gazer-panel__title",
    text: t(locale, COPY.panels.treeTitle),
  });
  const note = el(doc, "p", {
    className: "gazer-panel__note",
    text: t(locale, COPY.panels.treeNote),
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depthCache = new Map<string, number>();
  // 家谱是树,不认环:环上的节点按深度 0 画,避免死循环。
  const depthOf = (id: string, seen: ReadonlySet<string>): number => {
    const cached = depthCache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const node = byId.get(id);
    if (node === undefined || seen.has(id)) {
      return 0;
    }
    const parents = parentIdsOf(node).filter((parent) => byId.has(parent));
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    const depth =
      parents.length === 0 ? 0 : 1 + Math.max(...parents.map((parent) => depthOf(parent, nextSeen)));
    depthCache.set(id, depth);
    return depth;
  };

  const list = doc.createElement("ul");
  list.className = "gazer-tree";
  for (const node of nodes) {
    const item = doc.createElement("li");
    item.className = "gazer-tree__branch";
    item.setAttribute("data-creature-id", node.id);
    item.setAttribute("data-alive", String(node.alive));
    const depth = depthOf(node.id, new Set<string>());
    if (depth > 0) {
      // 深度即缩进:树形用层级表达,不另画连线。
      item.style.paddingLeft = `${depth * 16}px`;
    }
    const parents = parentIdsOf(node).filter((parent) => byId.has(parent));
    if (parents.length > 0) {
      item.setAttribute("data-parents", parents.join(" "));
    }

    const pick = el(doc, "button", { className: "gazer-tree__pick", attrs: { type: "button" } });
    pick.append(renderNode(doc, node));
    if (!node.alive && node.traitsInherited === true) {
      pick.append(
        el(doc, "span", {
          className: "gazer-tree__inherited",
          text: ` ${t(locale, COPY.panels.treeInherited)}`,
        }),
      );
    }
    pick.addEventListener("click", () => onPick(node.id));
    item.append(pick);
    list.append(item);
  }

  const root = el(doc, "div", { className: "gazer-form", children: [heading, note, list] });
  return { root, destroy: () => root.remove() };
}
