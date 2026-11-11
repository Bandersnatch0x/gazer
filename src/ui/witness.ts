/**
 * 证词标记。每一句话都带一道发丝般的痕迹，默认几乎看不见；
 * 悬停或键盘聚焦才读得出来。`aria-label` 携带完整说明，
 * 所以「只能靠悬停才知道」这条从不成立。
 */

import type { DistortionKind, EpistemicStatus } from "../sim/memory";
import type { Text } from "./i18n";
import { COPY } from "./copy";

export const EPISTEMIC_STATUSES: readonly EpistemicStatus[] = [
  "witnessed",
  "heard",
  "inferred",
  "fabricated",
];

export interface WitnessMark {
  readonly status: EpistemicStatus;
  /** 一个字符的发丝痕迹，宽度固定，换行时不挤动文本。 */
  readonly glyph: string;
  /** 短标签，两种语言。 */
  readonly label: Text;
  /** 给屏幕阅读器的完整句子，比标签多一层解释。 */
  readonly fullText: Text;
}

const GLYPHS: Readonly<Record<EpistemicStatus, string>> = {
  witnessed: "·",
  heard: "˙",
  inferred: "¸",
  fabricated: "‧",
};

const LABELS: Readonly<Record<EpistemicStatus, Text>> = {
  witnessed: COPY.witness.witnessed,
  heard: COPY.witness.heard,
  inferred: COPY.witness.inferred,
  fabricated: COPY.witness.fabricated,
};

const FULL_TEXTS: Readonly<Record<EpistemicStatus, Text>> = {
  witnessed: COPY.witness.witnessedLong,
  heard: COPY.witness.heardLong,
  inferred: COPY.witness.inferredLong,
  fabricated: COPY.witness.fabricatedLong,
};

export function markFor(status: EpistemicStatus): WitnessMark {
  return {
    status,
    glyph: GLYPHS[status],
    label: LABELS[status],
    fullText: FULL_TEXTS[status],
  };
}

/**
 * 玩家看到的来源。持有者相信的是切片里存的那个值——变形过的记忆存成
 * `witnessed`，持有者分辨不出——而标记是玩家唯一能看见差别的地方：
 * 只要这条记忆带 distortion，标记就报 `fabricated`。
 */
export function displayStatus(entry: {
  readonly witnessed: EpistemicStatus;
  readonly distortion: DistortionKind | null;
}): EpistemicStatus {
  return entry.distortion === null ? entry.witnessed : "fabricated";
}

export interface WitnessCounts {
  readonly witnessed: number;
  readonly heard: number;
  readonly inferred: number;
  readonly fabricated: number;
  readonly total: number;
}

/**
 * 按玩家可见的来源计数。计数口径与标记一致，否则面板上的数字会和逐条标记打架。
 */
export function countByStatus(
  entries: readonly {
    readonly witnessed: EpistemicStatus;
    readonly distortion: DistortionKind | null;
  }[],
): WitnessCounts {
  const counts = { witnessed: 0, heard: 0, inferred: 0, fabricated: 0, total: entries.length };
  for (const entry of entries) {
    counts[displayStatus(entry)] += 1;
  }
  return counts;
}
