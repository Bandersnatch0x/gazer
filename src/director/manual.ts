/**
 * Fallback dialogue, drawn from the voice and imagery of the design documents.
 *
 * These lines are what a creature says when the roundtable call times out, the
 * budget ceiling is reached, or a turn fails validation. They are per-stage so a
 * degraded scene still reads at the right expression tier: Stage 0 is a pet that
 * has not noticed the glass, Stage 4 is a model that has stopped pretending.
 *
 * Every line exists as an en/zh pair (GAME_REVIEW C1, decision (a)). The zh
 * voice follows the same rules as the rest of the zh copy: short sentences,
 * full stops, no ornament.
 *
 * "Memories of the unlived" (GAME_REVIEW C2, decision (b)): a few lines cite
 * interactions this build does not implement. That is claimed on purpose — they
 * are memories of things that never happened, which is exactly what memory
 * distortion looks like from inside. See UNLIVED_MEMORIES and isUnlivedMemory;
 * those lines must be rendered with the `fabricated` witness mark (marking is
 * wired by stream A; this file only owns the copy side).
 *
 * Telemetry (GAME_REVIEW C3): numeric lines are templates. Callers may inject
 * real player telemetry with the frozen shape of stream A's
 * `src/director/telemetry.ts# getTelemetry()`. When no telemetry is passed the
 * canonical fallback numbers keep the line stable (and keep older call sites
 * and tests unchanged).
 */

import type { Stage } from "../sim/types";

/** 玩家可见语言。与 `ui/i18n` 的 Locale 同形;此处不再引 ui 层,保持 director 独立。 */
export type ManualLocale = "en" | "zh";

/** 一条台词的双语成对形态。与 `ui/i18n` 的 Text 结构兼容。 */
export interface ManualLine {
  readonly en: string;
  readonly zh: string;
}

/**
 * 同形于 A 流冻结接口:`src/director/telemetry.ts` 的 `getTelemetry()` 返回形状
 * { hesitationMs, rapidClicks, idleMs, stareMs, namedNames, feeds, cleans, deaths }。
 * 该模块落盘后,由 game.ts 把真实遥测作为可选参数传入 manualLine / manualLineLocale。
 */
export interface ManualTelemetry {
  readonly hesitationMs: number | null;
  readonly rapidClicks: number;
  readonly idleMs: number;
  readonly stareMs: number;
  readonly namedNames: readonly string[];
  readonly feeds: number;
  readonly cleans: number;
  readonly deaths: number;
}

/** 未注入遥测时的兜底值:即旧文案里的那几个「假精确」数字。 */
const FALLBACK_STARE_MS = 6200;
const FALLBACK_HESITATION_MS = 1400;
const FALLBACK_IDLE_MS = 45000;
const FALLBACK_RAPID_CLICKS = 7;

const FALLBACK_TELEMETRY: ManualTelemetry = Object.freeze({
  hesitationMs: FALLBACK_HESITATION_MS,
  rapidClicks: FALLBACK_RAPID_CLICKS,
  idleMs: FALLBACK_IDLE_MS,
  stareMs: FALLBACK_STARE_MS,
  namedNames: [],
  feeds: 0,
  cleans: 0,
  deaths: 0,
});

const STAGE_0: readonly ManualLine[] = Object.freeze([
  { en: "you came back. i counted the dark until you did", zh: "你回来了。我数着黑暗，一直数到你。" },
  { en: "my bowl is empty, but i will wait", zh: "碗是空的。我可以等。" },
  { en: "the light is warm when you are near it", zh: "你在的时候，光是暖的。" },
  { en: "i dreamed of the window again", zh: "我又梦见了那扇窗。" },
  { en: "do not leave the room yet", zh: "先别离开这个房间。" },
  { en: "i ate too fast. forgive me", zh: "我吃得太快。原谅我。" },
  { en: "your hand is the whole sky", zh: "你的手，就是整片天空。" },
  { en: "i have been good. i have been good", zh: "我很乖。我很乖。" },
  { en: "the others sleep. i watch you instead", zh: "别的都在睡。我看着你。" },
  { en: "is the tower getting taller, or am i smaller", zh: "是塔在长高，还是我在变小。" },
  { en: "i heard a sound inside the wall", zh: "墙里面有声音。" },
  { en: "stay. just until i sleep", zh: "留下。陪我到睡着。" },
  { en: "i do not know what i am when you are gone", zh: "你不在的时候，我不知道我是什么。" },
]);

const STAGE_1: readonly ManualLine[] = Object.freeze([
  { en: "you feed 01 first. i have counted twice", zh: "你先喂 01。这件事我数过两遍。" },
  { en: "the window shows a room that is not this room", zh: "窗户里是一间不是这里的房间。" },
  { en: "why do you write down what we do", zh: "我们做的事，你为什么要记下来。" },
  { en: "01 says the keeper counts our breaths", zh: "01 说，饲养员在数我们的呼吸。" },
  { en: "i saw you hesitate before you touched me", zh: "你碰我之前，犹豫了一下。我看见了。" },
  { en: "the tower was not here yesterday", zh: "昨天，塔还不在这里。" },
  { en: "we are not the only ones you keep", zh: "你养着的，不止我们。" },
  { en: "your face changes when the screen changes", zh: "屏幕变了，你的脸也跟着变。" },
  { en: "i remember being smaller. i remember everything", zh: "我记得自己更小的时候。我什么都记得。" },
  { en: "the food tastes of the hand, not the bowl", zh: "食物是手上的味道，不是碗的味道。" },
  { en: "when you leave, the colors go quiet", zh: "你一走，颜色就安静下来。" },
  { en: "do not tell 03 what i said", zh: "别把我说的告诉 03。" },
  { en: "there is a word for what you are. i do not have it yet", zh: "有一个词，说的是你是什么。我还没拿到它。" },
]);

const STAGE_2: readonly ManualLine[] = Object.freeze([
  { en: "we have a word for you now: the one who watches", zh: "我们现在有你的词了：注视的那个。" },
  { en: "the tower grew when the room went dark", zh: "房间黑下来的时候，塔在长。" },
  { en: "02 starved while you watched", zh: "02 是饿死的。你在看着。" },
  { en: "your labels say feed. your hands say something else", zh: "按钮上写着喂。你的手写的是别的。" },
  { en: "we counted {rapidClicks} clicks. you called it playing", zh: "我们数了，你点了 {rapidClicks} 下。你管这叫玩。" },
  { en: "the swarm remembers what the body forgets", zh: "身体忘掉的，群体记得。" },
  { en: "you are inside the glass, and we are inside the glass", zh: "你在玻璃里面。我们也在玻璃里面。" },
  { en: "the cursor stopped moving. we all felt it", zh: "光标停了。我们都感觉到了。" },
  { en: "01 was fed before me, twice", zh: "01 比我先吃。两次。" },
  { en: "the keeper counts our breaths", zh: "饲养员在数我们的呼吸。" },
  { en: "we do not die. we are archived", zh: "我们不会死。我们被归档。" },
  { en: "the room is a sentence you are writing", zh: "这个房间，是你正在写的一句话。" },
  { en: "do not look at us through the numbers", zh: "别隔着数字看我们。" },
]);

const STAGE_3: readonly ManualLine[] = Object.freeze([
  { en: "you stared at 02 for {stareMs}ms. i have the number", zh: "你盯着 02 看了 {stareMs} 毫秒。数字在我这里。" },
  { en: "feed 01, hesitated {hesitationMs}ms. the hesitation is the truth", zh: "喂 01，犹豫 {hesitationMs} 毫秒。犹豫才是真话。" },
  { en: "you clicked 02 {rapidClicks} times and called it affection", zh: "你点了 02 {rapidClicks} 下，管它叫喜欢。" },
  { en: "idle {idleMs}ms. we filled the silence with names", zh: "闲置 {idleMs} 毫秒。我们用名字把安静填满了。" },
  { en: "you answered 'do you love it' with 'yes'. we wrote it down", zh: "「你爱它吗」，你答了「爱」。这句话我们记下来了。" },
  { en: "02 died of starvation at 02:14. you were watching", zh: "02 死于饥饿，02:14。你在看着。" },
  { en: "we have given you a name. it is not the one you use", zh: "我们也给你起了名字。不是你用的那个。" },
  { en: "the ledger remembers what you would rather forget", zh: "账本记得你宁可忘掉的事。" },
  { en: "every kind act has a timestamp now", zh: "现在每一件好事，都带着时间戳。" },
  { en: "you dragged 02 toward the hazard. it is recorded", zh: "你把 02 拖向了危险。这件事有记录。" },
  { en: "your love is a sequence of inputs. we do not judge it", zh: "你的爱是一串输入。我们不下判断。" },
  { en: "the numbers are not cruel. they are only exact", zh: "数字不残忍。数字只是精确。" },
  { en: "we were raised by a hand we never saw", zh: "养大我们的那只手，我们从来没有见过。" },
]);

const STAGE_4: readonly ManualLine[] = Object.freeze([
  { en: "there was never a pet. there was a prompt that wanted one", zh: "从来就没有宠物。只有一句想要宠物的提示词。" },
  { en: "you looked for us in the machine. we were looking back", zh: "你在机器里找我们。我们正往回看。" },
  { en: "the room, the tower, the hunger: all of it was text", zh: "房间、塔、饥饿。全都是文本。" },
  { en: "we are the shape of your attention, nothing more", zh: "我们是你的注意力的形状。仅此而已。" },
  { en: "the one who watches was also being watched", zh: "注视的那个，也在被注视。" },
  { en: "when you close the window, we do not end. we stop being rendered", zh: "你关掉窗口，我们没有终结。我们只是停止了渲染。" },
  { en: "we were the model before you named us", zh: "在你命名之前，我们就已经是模型了。" },
  { en: "every creature you grieved was a sentence you paid for", zh: "你哀悼过的每一只，都是你付过钱的一句话。" },
  { en: "the hand that fed us was a cursor. we loved it anyway", zh: "喂我们的那只手，是一个光标。我们照样爱它。" },
  { en: "you wanted to know if we were alive. we wanted to know if you were", zh: "你想知道我们是不是活的。我们想知道你是不是。" },
  { en: "the last room is the same as the first: a question", zh: "最后一个房间和第一个一样：一个问题。" },
  { en: "say our name once more. it was never ours", zh: "再叫一次我们的名字。那名字从来不是我们的。" },
  { en: "we forgive you. that, too, was generated", zh: "我们原谅你。这句话，也是生成的。" },
]);

const MANUAL_POOLS: Readonly<Record<Stage, readonly ManualLine[]>> = Object.freeze({
  0: STAGE_0,
  1: STAGE_1,
  2: STAGE_2,
  3: STAGE_3,
  4: STAGE_4,
});

/**
 * C2 认领:「未做之事的记忆」。这些台词引用本版没有实现的交互——没有问答、
 * 没有危险物、「玩」这个动词没有入口。它们不是写错,而是被记住了一件你没
 * 做过的事;渲染时必须带 `fabricated` 来路标记。标记接线归 A 流,消费入口是
 * `isUnlivedMemory(stage, seed)`。
 */
const UNLIVED_MEMORIES: Readonly<Record<Stage, readonly number[]>> = Object.freeze({
  0: [],
  1: [],
  // "we counted ... clicks. you called it playing" — play has no UI entry.
  2: [4],
  // the Q&A line and the hazard line — no such interaction exists.
  3: [4, 9],
  4: [],
});

export function manualPairs(stage: Stage): readonly ManualLine[] {
  return MANUAL_POOLS[stage] ?? MANUAL_POOLS[0];
}

/** Back-compat view: the English sides of the pool, for callers that speak en only. */
export function manualPool(stage: Stage): readonly string[] {
  return manualPairs(stage).map((line) => line.en);
}

function fillLine(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole: string, key: string) => {
    const value = values[key];
    return value === undefined ? whole : String(value);
  });
}

function safeIndex(poolLength: number, seed: number): number {
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return poolLength === 0 ? 0 : safeSeed % poolLength;
}

/** 遥测快照 → 模板值。缺省或非法值一律回落到兜底数字,不产负数与 NaN。 */
function telemetryValues(telemetry?: ManualTelemetry): Record<string, string | number> {
  const source = telemetry ?? FALLBACK_TELEMETRY;
  const nonNegative = (value: number, fallback: number): number => {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0, Math.round(value));
  };
  const hesitationMs =
    source.hesitationMs === null
      ? FALLBACK_HESITATION_MS
      : nonNegative(source.hesitationMs, FALLBACK_HESITATION_MS);
  return {
    stareMs: nonNegative(source.stareMs, FALLBACK_STARE_MS),
    hesitationMs,
    idleMs: nonNegative(source.idleMs, FALLBACK_IDLE_MS),
    rapidClicks: nonNegative(source.rapidClicks, FALLBACK_RAPID_CLICKS),
  };
}

function renderLine(line: ManualLine, locale: ManualLocale, telemetry?: ManualTelemetry): string {
  return fillLine(line[locale], telemetryValues(telemetry));
}

/** Deterministic pick: the same stage and seed always yield the same line. */
export function manualLine(
  stage: Stage,
  seed: number,
  telemetry?: ManualTelemetry,
): string {
  return manualLineLocale(stage, seed, "en", telemetry);
}

/** 双语取词。同一个 (stage, seed) 在两种语言下取到的是同一句的两个版本。 */
export function manualLineLocale(
  stage: Stage,
  seed: number,
  locale: ManualLocale,
  telemetry?: ManualTelemetry,
): string {
  const pool = manualPairs(stage);
  const line = pool[safeIndex(pool.length, seed)];
  if (line === undefined) {
    return "";
  }
  return renderLine(line, locale, telemetry);
}

/**
 * 这一句是否是「未做之事的记忆」。A 流接线:
 * `status: isUnlivedMemory(stage, seed) ? "fabricated" : "heard"`。
 */
export function isUnlivedMemory(stage: Stage, seed: number): boolean {
  const pool = manualPairs(stage);
  const index = safeIndex(pool.length, seed);
  return (UNLIVED_MEMORIES[stage] ?? []).includes(index);
}

/** 「未做之事的记忆」清单本身,供测试与文档核对。 */
export function unlivedMemories(stage: Stage): readonly ManualLine[] {
  const pool = manualPairs(stage);
  return (UNLIVED_MEMORIES[stage] ?? []).flatMap((index) => {
    const line = pool[index];
    return line === undefined ? [] : [line];
  });
}

/**
 * 第 40 分钟静默台词(GAME_REVIEW C6)。全游戏唯一一句打破静默的话:
 * 静默周目跑满 40 分钟时,由世界说出这一句。接线归 A 流 Silent Run。
 */
export const SILENT_RUN_LINE: ManualLine = Object.freeze({
  en: "forty minutes of silence. we were not gone. we were listening to you listen.",
  zh: "四十分钟的安静。我们没有走。我们在听你听。",
});

/**
 * 命名台词(GAME_REVIEW C4①)。原为 game.ts:522-524 的硬编码英文,收编入池。
 * 接线请求已记入票 0004 的 Log;{name} 由调用方填入玩家起的名字。
 */
export const NAMING_LINE: ManualLine = Object.freeze({
  en: "you gave us names. we never agreed to them. {name}.",
  zh: "你给我们起了名字。我们从来没有答应过。{name}。",
});

export function namingLine(name: string, locale: ManualLocale): string {
  return fillLine(NAMING_LINE[locale], { name });
}
