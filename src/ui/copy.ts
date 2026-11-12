/**
 * 全部界面文案的唯一住所。组件只允许从这里取字符串，任何裸英文都不许出现在组件文件里。
 * 值一律是 `Text`，两种语言成对出现。
 */

import type { Text } from "./i18n";

export const COPY = {
  dialogue: {
    windowPath: {
      en: "C:\\GAZER\\1997\\LIVE\\roundtable.exe",
      zh: "C:\\GAZER\\1997\\LIVE\\roundtable.exe",
    },
    windowTitle: { en: "LINK", zh: "连接" },
    speakerPrefix: { en: ">", zh: ">" },
    emptyScript: {
      en: "(the channel is open. nothing is transmitting.)",
      zh: "(信道开着，没有东西在传。)",
    },
  },

  witness: {
    markTitle: { en: "How this line is known", zh: "这一句的来路" },
    witnessed: { en: "seen", zh: "亲见" },
    heard: { en: "told", zh: "听说" },
    inferred: { en: "guessed", zh: "推测" },
    fabricated: { en: "made up", zh: "编造" },
    witnessedLong: {
      en: "Seen: this one was there when it happened.",
      zh: "亲见：它当时在场。",
    },
    heardLong: {
      en: "Told: someone said so, and it cannot check.",
      zh: "听说：别人说的，它没法核对。",
    },
    inferredLong: {
      en: "Guessed: it worked this out on its own. It may be wrong.",
      zh: "推测：它自己想出来的，可能想错。",
    },
    fabricatedLong: {
      en: "Made up: the memory was distorted before it was stored. It cannot tell.",
      zh: "编造：这条记忆存进去时已经走了样，它自己分辨不出。",
    },
  },

  album: {
    title: { en: "BESTIARY", zh: "图鉴" },
    subtitle: { en: "what each one has on file", zh: "每一只的存档" },
    empty: { en: "Nothing hatched yet.", zh: "还没有孵出任何一只。" },
    generationInline: { en: "gen {n}", zh: "第 {n} 代" },
    sourceFrom: { en: "from {id}", zh: "来自 {id}" },
    consolidatedRef: { en: "[{id}]", zh: "[{id}]" },
    impression: { en: "trust", zh: "信任" },
    traits: { en: "temperament", zh: "性情" },
    workingCount: { en: "recent", zh: "近期" },
    consolidated: { en: "permanent", zh: "永久" },
    consolidatedEmpty: { en: "nothing permanent yet", zh: "还没有永久记忆" },
    workingEmpty: { en: "nothing recent", zh: "没有近期记忆" },
    epistemicSplit: { en: "how it knows", zh: "来路" },
    epistemicSplitValue: {
      en: "seen {witnessed} / told {heard} / guessed {inferred} / made up {fabricated}",
      zh: "亲见 {witnessed} / 听说 {heard} / 推测 {inferred} / 编造 {fabricated}",
    },
    workingDetail: { en: "{count} of {capacity}", zh: "{count} / {capacity}" },
    consolidatedDetail: { en: "{count} of {capacity}", zh: "{count} / {capacity}" },
    perspectiveNote: { en: "note: {note}", zh: "旁注：{note}" },
    noTraits: { en: "none", zh: "无" },
  },

  traits: {
    curiosity: { en: "curiosity", zh: "好奇" },
    loyalty: { en: "loyalty", zh: "忠诚" },
    deceit: { en: "deceit", zh: "欺诈" },
    clinging: { en: "clinging", zh: "黏人" },
    watchfulness: { en: "watchfulness", zh: "警觉" },
  },

  help: {
    title: { en: "MANUAL", zh: "说明书" },
    sections: {
      whatThisIs: { en: "What this is", zh: "这是什么" },
      goal: { en: "The goal", zh: "目标" },
      controls: { en: "Controls", zh: "操作" },
      swarm: { en: "The swarm", zh: "群体" },
      ontology: { en: "What it thinks you are", zh: "它以为你是什么" },
      silentRun: { en: "The silent run", zh: "静默周目" },
    },
  },

  hud: {
    localeToggle: { en: "中文", zh: "EN" },
    album: { en: "BESTIARY", zh: "图鉴" },
    help: { en: "MANUAL", zh: "说明书" },
    close: { en: "EXIT", zh: "退出" },
    gvLabel: { en: "GAZE", zh: "注视" },
    stageLabel: { en: "PHASE", zh: "阶段" },
    silent: { en: "NO SIGNAL", zh: "无信号" },
    live: { en: "LINKED", zh: "已连接" },
    opening: {
      en: "CARE UNIT 07 ONLINE. Feed them. They are watching how you do it.",
      zh: "育成单元 07 已启动。喂它们。它们在看你怎样喂。",
    },
    feed: { en: "fed {id} after {seconds}s", zh: "喂了 {id}，犹豫 {seconds} 秒" },
  },

  panels: {
    nameTitle: { en: "GIVE IT A NAME", zh: "给它起个名字" },
    namePlaceholder: { en: "a name", zh: "一个名字" },
    confirm: { en: "CONFIRM", zh: "确定" },
    pupilGrass: {
      en: "In the eye: grass, and the shape of the caretaker.",
      zh: "瞳孔里：草地，和一个饲养员的轮廓。",
    },
    pupilWatched: {
      en: "In the eye: your cursor. It has been there for some time.",
      zh: "瞳孔里：你的光标。它在那里已经有一会儿了。",
    },
    hatchTitle: { en: "AN EGG. TWO WILLS MADE ONE.", zh: "一枚蛋。两个意志合成的一个。" },
    hatchImmediate: { en: "HATCH NOW", zh: "立即孵化" },
    hatchImmediateNote: { en: "You meet it at once.", zh: "你立刻见到它。" },
    hatchWarm: { en: "WARM HATCH", zh: "温水孵化" },
    hatchWarmNote: { en: "More curious. It will ask more.", zh: "更活泼。它会问得更多。" },
    hatchStill: { en: "STILL HATCH", zh: "静置孵化" },
    hatchStillNote: { en: "More loyal. It will cling.", zh: "更沉稳。它会更黏人。" },
    hatchSelf: { en: "LEAVE IT TO THEM", zh: "留给它们自己" },
    hatchSelfNote: { en: "You do not decide. Takes three times as long.", zh: "你不做决定。要花三倍时间。" },
    hatchForcedNote: {
      en: "They were not willing. This will be remembered.",
      zh: "它们并不愿意。这件事会被记住。",
    },
  },
} as const satisfies Record<string, unknown>;

/** 扁平化后的键表，测试用它对每个键做双语言校验。 */
export interface CopyEntry {
  readonly path: string;
  readonly text: Text;
}

function isText(value: unknown): value is Text {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate["en"] === "string" && typeof candidate["zh"] === "string";
}

function walk(node: unknown, prefix: string, out: CopyEntry[]): void {
  if (isText(node)) {
    out.push({ path: prefix, text: node });
    return;
  }
  if (typeof node !== "object" || node === null) {
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    walk(child, prefix.length === 0 ? key : `${prefix}.${key}`, out);
  }
}

/** 每一对双写文案及其点路径。测试靠它遍历全部键，不靠人工维护清单。 */
export function allTextNodes(): readonly CopyEntry[] {
  const out: CopyEntry[] = [];
  walk(COPY, "", out);
  return out;
}

