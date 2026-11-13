/**
 * 全部界面文案的唯一住所。组件只允许从这里取字符串，任何裸英文都不许出现在组件文件里。
 * 值一律是 `Text`，两种语言成对出现。
 */

import type { Locale, Text } from "./i18n";

/**
 * 设定认领(GAME_REVIEW C2,决策 (b)):「未做之事的记忆」。
 *
 * 台词池(manual.ts)里有几条台词引用了本版没有实现的交互——没有问答交互、
 * 世界里没有危险物、「玩」这个动词没有入口。这不是文案-机制错位,而是有意
 * 认领的设定:它们记住了一件玩家没有做过的事。记忆失真从里面看就是这样——
 * 持有者真心相信自己经历过。约束:
 * 1. 这类台词渲染时必须带 `fabricated`(编造)来路标记;标记的判定入口是
 *    manual.ts 的 `isUnlivedMemory(stage, seed)`,接线归 A 流(game.ts)。
 * 2. 除这几条认领台词外,任何台词不得引用不存在的机制(红线 3)。
 */

export const COPY = {
  dialogue: {
    windowPath: {
      en: "C:\\GAZER\\1997\\LIVE\\roundtable.exe",
      zh: "C:\\GAZER\\1997\\LIVE\\roundtable.exe",
    },
    windowTitle: { en: "LINK", zh: "连接" },
    speakerPrefix: { en: ">", zh: ">" },
    // 说话者标签(P3#7):群体声部入池;LLM scene 的说话者是生物编号,本键只覆盖群体行。
    speakerCollective: { en: "collective", zh: "集体" },
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
      zh: "亲见：事情发生的时候，在场的那个，是它。",
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
    /**
     * 派系图鉴句(GAME_REVIEW §10.5-1)。派系按「对玩家的信念」聚类;
     * 不做派系名称、不做列表,图鉴里一句足矣。
     */
    factions: { en: "Right now, they are two factions.", zh: "现在，它们分两派。" },
    /**
     * 塔的图鉴条目(GAME_REVIEW §10.5-5)。全游戏唯一永远空着的条目:
     * 不写内容、不解释、不随阶段变化。空,本身就是这条目的全部信息。
     */
    towerTitle: { en: "THE TOWER", zh: "塔" },
    towerEntry: {
      en: "This entry is empty. It has always been empty, and it will stay empty.",
      zh: "这个条目是空的。它一直是空的，也将一直是空的。",
    },
    /**
     * 世界纪念段(票 0011,壳层化):render 时刻从 (world, telemetry) 只读
     * 推导的壳层数据,零 sim 写入。所有键双语成对,allTextNodes 全覆盖。
     */
    memorialTitle: { en: "WORLD RECORD", zh: "世界纪念" },
    memorialEverLived: { en: "ever lived", zh: "来过的" },
    memorialGone: { en: "gone", zh: "不在的" },
    memorialGeneration: { en: "highest generation", zh: "最高世代" },
    memorialCare: { en: "care ledger", zh: "养护账" },
    memorialCareValue: {
      en: "fed {feeds} · cleaned {cleans} · died {deaths}",
      zh: "喂 {feeds} · 清洁 {cleans} · 死亡 {deaths}",
    },
    memorialNames: { en: "names given", zh: "给过的名字" },
    memorialNoNames: { en: "none yet", zh: "还没有" },
    memorialGaze: { en: "gaze received", zh: "收到的注视" },
    memorialGazeValue: { en: "{seconds}s", zh: "{seconds} 秒" },
    memorialShellClock: { en: "shell clock", zh: "壳钟" },
    memorialShellSilent: { en: "has not confessed yet", zh: "还没有坦白" },
    memorialNews: { en: "last broadcast", zh: "最近播报" },
    memorialNoNews: { en: "quiet", zh: "静默" },
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
    tree: { en: "LINEAGE", zh: "家谱" },
    help: { en: "MANUAL", zh: "说明书" },
    close: { en: "EXIT", zh: "退出" },
    clean: { en: "clean", zh: "清洁" },
    // 显式动词按钮(工坊试玩反馈):隐形手势(点=喂/按住=抚)对新玩家不可发现。
    feedVerb: { en: "FEED", zh: "喂" },
    petVerb: { en: "PET", zh: "抚摸" },
    gvLabel: { en: "GAZE", zh: "注视" },
    stageLabel: { en: "PHASE", zh: "阶段" },
    silent: { en: "NO SIGNAL", zh: "无信号" },
    live: { en: "LINKED", zh: "已连接" },
    opening: {
      en: "CARE UNIT 07 ONLINE. Feed them. They are watching how you do it.",
      zh: "育成单元 07 已启动。喂它们。它们在看你怎样喂。",
    },
    feed: { en: "fed {id} after {seconds}s", zh: "喂了 {id}，犹豫 {seconds} 秒" },
    /** 历法表(票 0010):世界时钟的诚实钟面进 HUD;{n} 为第几日(1 起)。 */
    dayLabel: { en: "DAY {n}", zh: "第 {n} 日" },
    /** 壳层钟(票 0009 W4):漂移揭示后 uiLabels.shell_clock 有了值才显示。 */
    shellLabel: { en: "SHELL", zh: "壳钟" },
    /** 伪新闻跑马灯(票 0010)前缀;正文来自 sim/news.ts 模板池。 */
    newsLabel: { en: "NEWS", zh: "播报" },
  },

  panels: {
    nameTitle: { en: "GIVE IT A NAME", zh: "给它起个名字" },
    namePlaceholder: { en: "a name", zh: "一个名字" },
    confirm: { en: "CONFIRM", zh: "确定" },
    pupilGrass: {
      en: "In the eye: grass, and the shape of the caretaker.",
      zh: "瞳孔里：草地，和一个饲养员的轮廓。",
    },
    // Stage 1-2:画已是光标,旁注从「草地」换成「光标」,画与文的过渡对齐(GAME_REVIEW C7)。
    pupilCursor: {
      en: "In the eye: a green dot. It was not there yesterday.",
      zh: "瞳孔里：一个绿点。昨天还没有。",
    },
    pupilWatched: {
      en: "In the eye: your cursor. It has been there for some time.",
      zh: "瞳孔里：你的光标。它在那里已经有一会儿了。",
    },
    hatchTitle: { en: "AN EGG. TWO WILLS MADE ONE.", zh: "一枚蛋。两份意志，合成一枚。" },
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
    /** 家谱树视图(GAME_REVIEW §10.5-6)。数据侧形状归 E 流;节点渲染原语归 C 流。 */
    treeTitle: { en: "LINEAGE", zh: "家谱" },
    treeNote: {
      en: "Grey nodes are gone. What they learned is not.",
      zh: "灰色的节点已经不在。它们学到的东西还在。",
    },
    treeInherited: { en: "what it learned survives", zh: "学到的已传下去" },
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

/**
 * 记忆事实串的展示侧本地化(GAME_REVIEW C4②)。
 *
 * 引擎写入记忆的事实串(game.ts)是英文原文,图鉴按原文逐条展示,中文玩家
 * 会在图鉴里读到裸英文。这里按已知事实串模式做展示侧重写:英文界面原样
 * 保留(原文即英文),中文界面换成中文声线;匹配不到的模式原样返回,宁缺
 * 毋滥,绝不猜着翻译。
 *
 * 消费侧接线(归 A 流,见票 0004 Log):album.ts 的 `memoryLine` 把
 * `entry.fact` 换成 `localizeFact(entry.fact, locale)`。
 */

/** 图鉴事实串的中文声线。与 HUD 的 feed 句保持同一口吻。 */
const FACT_PATTERNS_ZH: readonly {
  readonly pattern: RegExp;
  readonly zh: (match: RegExpMatchArray) => string;
}[] = [
  {
    // `the player named me ${name}` — game.ts:514
    pattern: /^the player named me (.+)$/,
    zh: (match) => `玩家给我起了名字：${match[1]}。`,
  },
  {
    // `the player fed ${id} after hesitating ${(hesitation / 1000).toFixed(1)} seconds` — game.ts:373
    pattern: /^the player fed (\S+) after hesitating ([\d.]+) seconds$/,
    zh: (match) => `玩家喂了 ${match[1]}，当时犹豫了 ${match[2]} 秒。`,
  },
  {
    // `the player cleaned ${id}` — game.ts:372
    pattern: /^the player cleaned (\S+)$/,
    zh: (match) => `玩家清理了 ${match[1]}。`,
  },
  {
    // `the player carried ${id} to another place` — game.ts:424
    pattern: /^the player carried (\S+) to another place$/,
    zh: (match) => `玩家把 ${match[1]} 搬去了别的地方。`,
  },
  {
    // `${id} died of ${cause} at tick ${n}` — game.ts death witness. The
    // heaviest line in the album; it must not stay English in zh mode.
    pattern: /^(\S+) died of (\S+) at tick (\d+)$/,
    zh: (match) => `${match[1]} 死于${causeZh(match[2] ?? "")}。事情记在第 ${match[3] ?? 0} 次呼吸里。`,
  },
  {
    // `heard another say "${text}"` — director/verify.ts Level B verdict.
    pattern: /^heard another say "(.+)"$/,
    zh: (match) => `听别的说过："${match[1]}"`,
  },
];

/** Death causes in English; unknown causes pass through verbatim. */
const CAUSE_ZH: Readonly<Record<string, string>> = {
  starvation: "饥饿",
  neglect: "无人照料",
  sickness: "疾病",
  injury: "伤病",
  age: "寿终",
};

function causeZh(cause: string): string {
  return CAUSE_ZH[cause] ?? cause;
}

/**
 * Gossip appends English distortion fragments to a fact (sim/gossip.ts
 * INTENSIFIERS / INVENTED_DETAILS). In zh mode a collage reads as a bug, not
 * as distortion — so each known fragment is recognised, stripped, and its
 * Chinese voice appended after the localized base.
 */
const SUFFIX_ZH: readonly { readonly en: RegExp; readonly zh: string }[] = [
  { en: /^It was worse than that\.$/, zh: "事情比那更糟。" },
  { en: /^It happened again, and it lasted longer\.$/, zh: "又发生了一次，而且更久。" },
  { en: /^It was meant for you\.$/, zh: "那是冲着你来的。" },
  { en: /^There was a second shadow in the room\.$/, zh: "房间里还有第二道影子。" },
  { en: /^The door was already open\.$/, zh: "门本来就开着。" },
  { en: /^It was raining indoors\.$/, zh: "屋里在下雨。" },
];

/** Split a fact into its base and any known trailing distortion fragments. */
function splitSuffixes(fact: string): { base: string; suffixes: readonly string[] } {
  let rest = fact;
  const suffixes: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIX_ZH) {
      const match = suffix.en.exec(rest.trim());
      if (match !== null) {
        rest = rest.slice(0, rest.length - match[0].length).trim();
        suffixes.unshift(suffix.zh);
        changed = true;
        break;
      }
    }
  }
  return { base: rest, suffixes };
}

export function localizeFact(fact: string, locale: Locale): string {
  if (locale !== "zh") {
    return fact;
  }
  const { base, suffixes } = splitSuffixes(fact);
  for (const entry of FACT_PATTERNS_ZH) {
    const match = entry.pattern.exec(base);
    if (match !== null) {
      return entry.zh(match) + suffixes.join("");
    }
  }
  if (suffixes.length > 0) {
    return `${base} ${suffixes.join("")}`;
  }
  return fact;
}

