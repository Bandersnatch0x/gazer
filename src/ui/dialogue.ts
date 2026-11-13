/**
 * 1997 年那种终端窗口：纸暗底、等宽字、顶栏写着一条假路径。
 *
 * 节奏是设计的一部分，所以延迟必须抖：每一轮落在 1.5 到 4 秒之间，
 * 由外部传入的随机源决定，绝不读系统时间。核心 `playScript` 是纯函数，
 * 不装定时器；真正的逐条揭示放在 `runPlayback` 里，由调用方给调度器。
 */

import type { RoundtableScript, RoundtableTurn, TurnIntent } from "../sim/roundtable";
import type { EpistemicStatus, MemorySlice } from "../sim/memory";
import type { CreatureId, Mood } from "../sim/types";
import type { Locale } from "./i18n";
import { t } from "./i18n";
import { COPY } from "./copy";
import { witnessElement, displayStatus } from "./witness";
import type { Doc } from "./shell";
import { el } from "./shell";

export const MIN_TURN_DELAY_MS = 1500;
export const MAX_TURN_DELAY_MS = 4000;

export interface Clock {
  now(): number;
}

export interface PlaybackTurn {
  readonly speaker: CreatureId;
  readonly text: string;
  readonly intent: TurnIntent;
  readonly mood: Mood;
  readonly memoryRef: string;
  /** 这一轮之前的静默时长，1500..4000。 */
  readonly delayMs: number;
  /** 相对播放起点的揭示时刻，由 delayMs 累加而来。 */
  readonly revealAtMs: number;
  /** 揭示时刻的绝对时钟读数，等于 startedAtMs + revealAtMs。 */
  readonly absoluteAtMs: number;
}

export interface Playback {
  readonly turns: readonly PlaybackTurn[];
  readonly startedAtMs: number;
  /** 最后一轮揭示的时刻；空脚本时为起点本身。 */
  readonly endsAtMs: number;
}

export interface PlayScriptOptions {
  readonly clock: Clock;
  /** 返回 0..1 的随机源。测试传入固定序列即可完全确定。 */
  readonly random?: () => number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 抖动延迟。随机源给出的值先夹到 0..1，避免劣质实现越界。
 * 落点始终闭区间 [1500, 4000]。
 */
export function jitterDelayMs(random: () => number): number {
  const raw = random();
  const roll = Number.isFinite(raw) ? clamp(raw, 0, 1) : 0.5;
  return Math.round(MIN_TURN_DELAY_MS + roll * (MAX_TURN_DELAY_MS - MIN_TURN_DELAY_MS));
}

/**
 * 把脚本排成一份可播放的时间表。纯函数：不读时钟以外的状态，不改输入。
 * 顺序保持，一轮不丢，哪怕文本为空也照样占一轮。
 */
export function playScript(script: RoundtableScript, options: PlayScriptOptions): Playback {
  const random = options.random ?? Math.random;
  const startedAtMs = options.clock.now();
  let cursor = 0;
  const turns: PlaybackTurn[] = [];
  for (const turn of script.scene) {
    const delayMs = jitterDelayMs(random);
    cursor += delayMs;
    turns.push({
      speaker: turn.speaker,
      text: turn.text,
      intent: turn.intent,
      mood: turn.mood,
      memoryRef: turn.memoryRef,
      delayMs,
      revealAtMs: cursor,
      absoluteAtMs: startedAtMs + cursor,
    });
  }
  return { turns, startedAtMs, endsAtMs: startedAtMs + cursor };
}

/**
 * 给调度器的最小契约：`atMs` 是相对 `runPlayback` 调用时刻的偏移，
 * 所以调度器可以一次性把所有回调排进去（例如 setTimeout）。
 */
export type Schedule = (callback: () => void, atMs: number) => void;

export interface RunPlaybackOptions {
  readonly schedule: Schedule;
  readonly onTurn: (turn: PlaybackTurn, index: number) => void;
  readonly onDone?: () => void;
}

/**
 * 按时间表逐条揭示。这里只做排队，不解释内容；取消逻辑交给调用方的调度器。
 */
export function runPlayback(playback: Playback, options: RunPlaybackOptions): void {
  if (playback.turns.length === 0) {
    options.onDone?.();
    return;
  }
  playback.turns.forEach((turn, index) => {
    options.schedule(() => {
      options.onTurn(turn, index);
      if (index === playback.turns.length - 1) {
        options.onDone?.();
      }
    }, turn.revealAtMs);
  });
}

export interface DialogueLineInput {
  readonly speaker: CreatureId;
  readonly text: string;
  /** 每一句台词都带标记；没有标记的台词不渲染。 */
  readonly status: EpistemicStatus;
}

export interface DialogueView {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  showLine(line: DialogueLineInput, locale: Locale): void;
  showLines(lines: readonly DialogueLineInput[], locale: Locale): void;
  reset(): void;
  setTitle(locale: Locale): void;
}

function lineNode(doc: Doc, line: DialogueLineInput, locale: Locale): HTMLElement {
  const children: Node[] = [
    el(doc, "span", {
      className: "gazer-dialogue__speaker",
      text: `${line.speaker}${t(locale, COPY.dialogue.speakerPrefix)}`,
    }),
    el(doc, "span", { className: "gazer-dialogue__text", text: line.text }),
  ];
  children.push(witnessElement(doc, line.status, locale));
  return el(doc, "div", { className: "gazer-dialogue__line", children });
}

export function createDialogue(doc: Doc, locale: Locale): DialogueView {
  const title = el(doc, "span", {
    className: "gazer-dialogue__title",
    text: t(locale, COPY.dialogue.windowTitle),
  });
  const path = el(doc, "span", {
    className: "gazer-dialogue__path",
    text: t(locale, COPY.dialogue.windowPath),
  });
  const bar = el(doc, "div", {
    className: "gazer-dialogue__bar",
    children: [path, title],
  });
  const body = el(doc, "div", {
    className: "gazer-dialogue__body",
    attrs: { role: "log", "aria-live": "polite" },
  });
  const root = el(doc, "div", {
    className: "gazer-dialogue",
    attrs: { "aria-label": t(locale, COPY.dialogue.windowTitle) },
    children: [bar, body],
  });

  const showLines = (lines: readonly DialogueLineInput[], active: Locale): void => {
    body.textContent = "";
    if (lines.length === 0) {
      body.append(
        el(doc, "p", { className: "gazer-dialogue__empty", text: t(active, COPY.dialogue.emptyScript) }),
      );
      return;
    }
    for (const line of lines) {
      body.append(lineNode(doc, line, active));
    }
  };

  return {
    root,
    body,
    showLine(line, active) {
      body.append(lineNode(doc, line, active));
    },
    showLines,
    reset() {
      body.textContent = "";
    },
    setTitle(active) {
      title.textContent = t(active, COPY.dialogue.windowTitle);
      path.textContent = t(active, COPY.dialogue.windowPath);
      root.setAttribute("aria-label", t(active, COPY.dialogue.windowTitle));
    },
  };
}

/**
 * 把圆桌脚本的一轮转成对话框能画的一行。标记必须来自说话者自己的记忆切片，
 * 所以解析函数是必填的：界面不替引擎猜来源，猜错就毁掉了整条 mechanic。
 */
export function toDialogueLine(
  turn: RoundtableTurn,
  statusFor: (turn: RoundtableTurn) => EpistemicStatus,
): DialogueLineInput {
  return {
    speaker: turn.speaker,
    text: turn.text,
    status: statusFor(turn),
  };
}

/**
 * 运行时的台词认知标记（消费侧，A 流接线用）。
 *
 * 一轮台词引用了一条 `memoryRef`；标记只看说话者自己的切片里有没有这条
 * 记忆、它是以什么来路存进去的：
 * - 记忆带 distortion → `fabricated`（存进去之前已经走了样）；
 * - 记忆的 witnessed 字段原样输出 → `witnessed` / `heard` / `inferred`；
 * - 引用了一条自己根本没有的记忆 → `inferred`（它引用了一个不存在的事实）。
 *
 * 直觉与推论由此在运行时真正分化：亲历写 witnessed，流言写 heard，
 * 失真写 fabricated——不再恒为 heard。
 */
export function resolveTurnStatus(
  turn: RoundtableTurn,
  slices: Readonly<Record<CreatureId, MemorySlice>>,
): EpistemicStatus {
  const slice = slices[turn.speaker];
  if (slice === undefined) {
    return "inferred";
  }
  const entry =
    slice.working.find((item) => item.id === turn.memoryRef) ??
    slice.consolidated.find((item) => item.id === turn.memoryRef);
  if (entry === undefined) {
    return "inferred";
  }
  // Self-knowledge was never a rumour: a consolidated citation is witnessed.
  if (!("witnessed" in entry)) {
    return "witnessed";
  }
  return displayStatus(entry);
}
