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
    windowTitle: { en: "ROUNDTABLE", zh: "圆桌" },
    speakerPrefix: { en: ">", zh: ">" },
    emptyScript: {
      en: "(the window is open and nothing speaks)",
      zh: "(窗口开着，没有谁说话)",
    },
  },

  witness: {
    markTitle: { en: "How this line is known", zh: "这一句是怎么知道的" },
    witnessed: { en: "witnessed", zh: "亲见" },
    heard: { en: "heard", zh: "听说" },
    inferred: { en: "inferred", zh: "推知" },
    fabricated: { en: "fabricated", zh: "伪造" },
    witnessedLong: {
      en: "Witnessed: this creature saw it happen.",
      zh: "亲见：这只生物亲眼看见了。",
    },
    heardLong: {
      en: "Heard: this creature was told, and cannot check it.",
      zh: "听说：这只生物是听来的，无从核对。",
    },
    inferredLong: {
      en: "Inferred: this creature worked it out, and may be wrong.",
      zh: "推知：这只生物是自己推出来的，可能推错。",
    },
    fabricatedLong: {
      en: "Fabricated: the memory was distorted before it was stored, and the holder cannot tell.",
      zh: "伪造：这条记忆在存进去之前就已经变形，持有者分辨不出。",
    },
  },

  album: {
    title: { en: "ALBUM", zh: "相册" },
    subtitle: { en: "what each one actually holds", zh: "每一只究竟记得什么" },
    empty: { en: "No creature has been hatched.", zh: "还没有孵化任何生物。" },
    generationInline: { en: "gen {n}", zh: "第 {n} 代" },
    sourceFrom: { en: "from {id}", zh: "来自 {id}" },
    consolidatedRef: { en: "[{id}]", zh: "[{id}]" },
    impression: { en: "impression", zh: "好感" },
    traits: { en: "traits", zh: "性格" },
    workingCount: { en: "working memories", zh: "工作记忆" },
    consolidated: { en: "consolidated", zh: "已固化" },
    consolidatedEmpty: { en: "nothing consolidated yet", zh: "尚未固化任何记忆" },
    workingEmpty: { en: "no working memories", zh: "没有工作记忆" },
    epistemicSplit: { en: "by source", zh: "记忆来源" },
    epistemicSplitValue: {
      en: "witnessed {witnessed} / heard {heard} / inferred {inferred} / fabricated {fabricated}",
      zh: "亲见 {witnessed} / 听说 {heard} / 推知 {inferred} / 伪造 {fabricated}",
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
    title: { en: "HOW TO PLAY", zh: "怎么玩" },
    sections: {
      whatThisIs: { en: "What this is", zh: "这是什么" },
      goal: { en: "The goal", zh: "目标" },
      controls: { en: "Controls", zh: "操作" },
      swarm: { en: "The swarm", zh: "群体" },
      ontology: { en: "The ontology", zh: "本体" },
      silentRun: { en: "The silent run", zh: "静默运行" },
    },
  },

  hud: {
    localeToggle: { en: "中文", zh: "EN" },
    album: { en: "ALBUM", zh: "记忆" },
    help: { en: "HELP", zh: "帮助" },
    close: { en: "CLOSE", zh: "关闭" },
    silent: { en: "silent", zh: "沉默" },
    live: { en: "live", zh: "在线" },
    opening: {
      en: "You wake in a warm little world. Feed them. They are watching how you do it.",
      zh: "你醒在一个温暖的小世界里。喂它们。它们在看你怎样喂。",
    },
    feed: { en: "fed {id} after {seconds}s", zh: "喂了 {id}，犹豫 {seconds} 秒" },
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

