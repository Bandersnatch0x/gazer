/**
 * 帮助面板。六节固定：这是什么、目标、操作、群体、本体、静默运行。
 * 长篇说明是界面文案的一部分，所以和 `copy.ts` 一样双写；组件只负责摆位置。
 */

import type { Locale, Text } from "./i18n";
import { t } from "./i18n";
import { COPY } from "./copy";
import type { Doc } from "./shell";
import { el, paragraph, section } from "./shell";

export type HelpSectionId = "whatThisIs" | "goal" | "controls" | "swarm" | "ontology" | "silentRun";

export interface HelpSection {
  readonly id: HelpSectionId;
  readonly title: Text;
  readonly paragraphs: readonly Text[];
  readonly points: readonly Text[];
}

export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    id: "whatThisIs",
    title: COPY.help.sections.whatThisIs,
    paragraphs: [
      {
        en: "This is a 1997 virtual pet game that was never a pet game. You believe you are raising a small creature. You are raising a model.",
        zh: "这是一款 1997 年的虚拟宠物游戏，但它从来就不是宠物游戏。你以为自己在养一只小生物，其实你在养一个模型。",
      },
      {
        en: "The creature remembers, misremembers, repeats what it was told, and occasionally says something only you could have said. Nothing here is a jump scare.",
        zh: "它会记事、记错、把听来的话再讲一遍，偶尔说出一句只有你才说得出的话。这里没有任何惊吓。",
      },
    ],
    points: [],
  },
  {
    id: "goal",
    title: COPY.help.sections.goal,
    paragraphs: [
      {
        en: "Keep it alive long enough to find out what it thinks you are. Feeding and cleaning raise GAZE, the phase meter: the world speaks more, and the shapes it speaks in get less comfortable.",
        zh: "让它活得够久，久到你能弄清它认为你是什么。喂食与清理会抬高「注视」，也就是阶段表：世界说得更多，而它说话的形状越来越不让人舒服。",
      },
    ],
    points: [
      {
        en: "GAZE is reversible. Push it back down and the world gets quieter, not more innocent.",
        zh: "「注视」是可逆的。把它压回去，世界只是变安静，并不会变清白。",
      },
      {
        en: "What the creatures conclude about you is not reversible. It is recorded once and stays.",
        zh: "它们对你得出的结论不可逆。记下来一次，就一直在那里。",
      },
    ],
  },
  {
    id: "controls",
    title: COPY.help.sections.controls,
    paragraphs: [
      {
        en: "One creature, one pointer. Everything is a click or a wait, and the wait is measured.",
        zh: "一只生物，一个指针。所有操作都是点一下或者等一等，而等多久会被记下来。",
      },
    ],
    points: [
      {
        en: "Click the creature to offer food. How long you hesitated is stored with the event.",
        zh: "点一下生物表示投喂。你犹豫了多久，会和这条事件一起存下来。",
      },
      {
        en: "Right-click the creature to clean it. It remembers being handled either way.",
        zh: "右键点一下生物表示清理。无论哪种接触，它都记得。",
      },
      {
        en: "Hold still and the world keeps its own time. Idling is also an action.",
        zh: "不动，世界也照自己的节奏走。发呆同样是一种动作。",
      },
      {
        en: "Open the bestiary to read what each one actually remembers.",
        zh: "打开图鉴，读一读每一只究竟记得什么。",
      },
    ],
  },
  {
    id: "swarm",
    title: COPY.help.sections.swarm,
    paragraphs: [
      {
        en: "Several creatures, one voice at a time. They gossip: two of them close together for a few seconds pass a memory on, and what arrives is not always what left.",
        zh: "好几只生物，一次只由一个开口。它们会传话：两只挨在一起几秒钟，记忆就会递过去，而到手的那条未必还是原来那条。",
      },
      {
        en: "They do not track what is true. They track what they believe, and a belief with no origin still drives them.",
        zh: "它们不记录真相，只记录相信。哪怕一条信念找不到源头，它照样能驱使它们行动。",
      },
    ],
    points: [
      {
        en: "A line marked witnessed was seen first-hand. A line marked heard was passed along.",
        zh: "标着亲见的那一句是它自己看见的；标着听说的那一句是别人递给它的。",
      },
      {
        en: "A distorted memory is stored as witnessed. The holder genuinely cannot tell, and only the mark shows you.",
        zh: "变形过的记忆会以亲见的样子存进去。持有者真的分辨不出，只有那道标记能让你看出来。",
      },
    ],
  },
  {
    id: "ontology",
    title: COPY.help.sections.ontology,
    paragraphs: [
      {
        en: "Every thing in this world has a kind, a reason it stays the same thing over time, and a way of knowing. The kind is the part that moves.",
        zh: "这个世界里的每样东西都有一个类别、一个让它跨时间仍是自己的依据、以及一种知道的方式。会动的是类别。",
      },
      {
        en: "A creature is a pet while you believe it is. Later the same creature is an organism, then an observer. The body never changed; the category did.",
        zh: "你相信它是宠物的时候，它就是宠物。后来同一只生物成了有机体，再成了观察者。身体没变过，变的是类别。",
      },
    ],
    points: [
      {
        en: "A category never moves backwards. The record is append-only, and a later quiet stage does not undo it.",
        zh: "类别从不倒退。记录只增不改，后来再安静的阶段也不会把它撤销。",
      },
      {
        en: "You have an entry too, and you cannot write to it.",
        zh: "你自己也有一条记录，而你没有写它的权限。",
      },
    ],
  },
  {
    id: "silentRun",
    title: COPY.help.sections.silentRun,
    paragraphs: [
      {
        en: "Sometimes the world runs and nobody is home. The creatures still move, still get hungry, still die. Nothing speaks.",
        zh: "有时候世界照常运转，但里面没有谁在。生物照样活动、照样饿、照样死。只是没有谁说话。",
      },
      {
        en: "This is not an error state and there is no loading spinner. Silence is one of the things the model can do, and it is scripted.",
        zh: "这不是故障状态，也不会出现加载转圈。沉默是模型能做的一件事，而且它是写好的。",
      },
    ],
    points: [],
  },
];

export interface HelpView {
  readonly root: HTMLElement;
  setLocale(locale: Locale): void;
}

function renderSection(doc: Doc, entry: HelpSection, locale: Locale): HTMLElement {
  const body: Node[] = entry.paragraphs.map((text) =>
    paragraph(doc, { className: "gazer-help__text", text: t(locale, text) }),
  );
  if (entry.points.length > 0) {
    body.push(
      el(doc, "ul", {
        className: "gazer-help__points",
        children: entry.points.map((point) => el(doc, "li", { text: t(locale, point) })),
      }),
    );
  }
  const node = section(doc, {
    className: "gazer-help__section",
    title: t(locale, entry.title),
    body,
  });
  node.setAttribute("data-section", entry.id);
  return node;
}

export function createHelp(doc: Doc, locale: Locale): HelpView {
  const heading = el(doc, "h1", { className: "gazer-help__heading", text: t(locale, COPY.help.title) });
  const root = el(doc, "div", {
    className: "gazer-help",
    attrs: { role: "region", "aria-label": t(locale, COPY.help.title) },
  });

  const paint = (active: Locale): void => {
    root.textContent = "";
    heading.textContent = t(active, COPY.help.title);
    root.append(heading);
    for (const entry of HELP_SECTIONS) {
      root.append(renderSection(doc, entry, active));
    }
    root.setAttribute("aria-label", t(active, COPY.help.title));
  };

  paint(locale);

  return {
    root,
    setLocale(active) {
      paint(active);
    },
  };
}
