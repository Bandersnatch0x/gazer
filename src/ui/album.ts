/**
 * 相册面板：每只生物一行，列出编号、世代、好感、最突出的两条性格、
 * 工作记忆条数、以及已经固化的条目原文。
 *
 * 面板存在的理由只有一个：让玩家看得见「亲见」和「听说」的差别。
 * 所以每只生物都带一个来源计数，且工作记忆逐条标出来源。
 */

import type { CreatureId, WorldState } from "../sim/types";
import type { ConsolidatedEntry, MemoryEntry, MemorySlice } from "../sim/memory";
import { CONSOLIDATED_CAPACITY, WORKING_CAPACITY } from "../sim/memory";
import type { GenomeTraits } from "../sim/genome";
import { topTraits } from "../sim/genome";
import type { Telemetry } from "../director/telemetry";
import { worldCalendarAt } from "../sim/clock";
import { NEWS_TICKER_LABEL } from "../sim/news";
import { beliefAboutPlayer, factionOf } from "../sim/social";
import type { Locale, Text } from "./i18n";
import { t, tf } from "./i18n";
import { COPY, localizeFact } from "./copy";
import { countByStatus, displayStatus, witnessElement, type WitnessCounts } from "./witness";
import type { Doc } from "./shell";
import { el } from "./shell";

export interface AlbumCreature {
  readonly id: CreatureId;
  readonly generation: number;
  /** -1..1，对玩家的个人好感。 */
  readonly impression: number;
  readonly traits: GenomeTraits;
  readonly memory: MemorySlice;
}

export interface AlbumRow {
  readonly id: CreatureId;
  readonly generation: number;
  readonly impression: number;
  readonly impressionText: string;
  readonly traits: readonly (readonly [string, number])[];
  readonly traitsText: string;
  readonly workingCount: number;
  readonly workingText: string;
  readonly consolidatedCount: number;
  readonly consolidatedText: string;
  readonly counts: WitnessCounts;
  readonly epistemicText: string;
  readonly working: readonly MemoryEntry[];
  readonly consolidated: readonly ConsolidatedEntry[];
}

const TRAIT_LABELS: Readonly<Record<string, Text>> = COPY.traits;

/** 性格名是基因组里的英文键；显示时换成对应语言，查不到就原样显示。 */
function traitName(name: string, locale: Locale): string {
  const label = TRAIT_LABELS[name];
  return label === undefined ? name : t(locale, label);
}

function signed(value: number): string {
  const fixed = value.toFixed(2);
  return value > 0 ? `+${fixed}` : fixed;
}

export function albumRow(creature: AlbumCreature, locale: Locale): AlbumRow {
  const traits = topTraits(creature.traits, 2);
  const counts = countByStatus(creature.memory.working);
  return {
    id: creature.id,
    generation: creature.generation,
    impression: creature.impression,
    impressionText: signed(creature.impression),
    traits,
    traitsText:
      traits.length === 0
        ? t(locale, COPY.album.noTraits)
        : traits.map(([name, value]) => `${traitName(name, locale)} ${value.toFixed(2)}`).join(", "),
    workingCount: creature.memory.working.length,
    workingText: tf(locale, COPY.album.workingDetail, {
      count: creature.memory.working.length,
      capacity: WORKING_CAPACITY,
    }),
    consolidatedCount: creature.memory.consolidated.length,
    consolidatedText: tf(locale, COPY.album.consolidatedDetail, {
      count: creature.memory.consolidated.length,
      capacity: CONSOLIDATED_CAPACITY,
    }),
    counts,
    epistemicText: tf(locale, COPY.album.epistemicSplitValue, {
      witnessed: counts.witnessed,
      heard: counts.heard,
      inferred: counts.inferred,
      fabricated: counts.fabricated,
    }),
    working: creature.memory.working,
    consolidated: creature.memory.consolidated,
  };
}

export function albumRows(creatures: readonly AlbumCreature[], locale: Locale): readonly AlbumRow[] {
  return creatures.map((creature) => albumRow(creature, locale));
}

// ---------------------------------------------------------------------------
// 世界纪念(shell 壳层段,票 0011;决策 0001 边界)
//
// 纪念条目是壳层数据:render 时刻从 (world, telemetry) 只读推导,不存进
// WorldState、不新增任何 sim 写入。世界记住的是这次周目本身——来过的每一
// 只、给过的每个名字、养护账、收到过的注视,以及壳自己坦白的漂移和播报。
// ---------------------------------------------------------------------------

export interface WorldMemorial {
  /** 第几日(1 起)。 */
  readonly day: number;
  /** 世界钟面 HH:MM(诚实面,非壳层漂移面)。 */
  readonly clock: string;
  /** 在册总数(死去的仍在册,家谱同规)。 */
  readonly everLived: number;
  /** 其中不在了的。 */
  readonly gone: number;
  /** 达到过的最高世代。 */
  readonly maxGeneration: number;
  readonly feeds: number;
  readonly cleans: number;
  readonly deaths: number;
  /** 玩家给过的名字,按给出顺序。 */
  readonly names: readonly string[];
  /** 收到的注视,取整秒。 */
  readonly gazeSeconds: number;
  /** 壳层钟最后一次坦白的面(W4);未坦白为 null。 */
  readonly shellClock: string | null;
  /** 最近一次壳层播报(伪新闻);还没有为 null。 */
  readonly news: string | null;
  /** 群内并存的派系数(tender/wrong);少于两派为 0——派系句只在两派并存时可见。 */
  readonly factions: number;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** 只读推导:同一 (world, telemetry) 永远推出同一份纪念。 */
export function worldMemorialFor(world: WorldState, telemetry: Telemetry): WorldMemorial {
  const creatures = Object.values(world.creatures);
  const calendar = worldCalendarAt(world.tick);
  let gone = 0;
  let maxGeneration = 1;
  for (const creature of creatures) {
    if (creature.behavior === "dead") {
      gone += 1;
    }
    const generation = creature.genome?.generation ?? 1;
    if (generation > maxGeneration) {
      maxGeneration = generation;
    }
  }
  return {
    day: calendar.day + 1,
    clock: `${pad2(calendar.hour)}:${pad2(calendar.minute)}`,
    everLived: creatures.length,
    gone,
    maxGeneration,
    feeds: telemetry.feeds,
    cleans: telemetry.cleans,
    deaths: telemetry.deaths,
    names: [...telemetry.namedNames],
    gazeSeconds: Number.isFinite(telemetry.stareMs) ? Math.max(0, Math.round(telemetry.stareMs / 1000)) : 0,
    shellClock: world.uiLabels["shell_clock"] ?? null,
    news: world.uiLabels[NEWS_TICKER_LABEL] ?? null,
    factions: countFactions(world),
  };
}

/** 派系数(票 0006 §6):按各生物对玩家的信念聚类,两派并存时图鉴才说那句话。 */
function countFactions(world: WorldState): number {
  const seen = new Set<string>();
  for (const creature of Object.values(world.creatures)) {
    if (creature.behavior === "dead") {
      continue;
    }
    const faction = factionOf(beliefAboutPlayer(world.memories?.[creature.id]));
    if (faction !== null) {
      seen.add(faction);
    }
  }
  return seen.size;
}

function field(doc: Doc, className: string, label: string, value: string): HTMLElement {
  return el(doc, "div", {
    className,
    children: [
      el(doc, "span", { className: "gazer-album__label", text: label }),
      el(doc, "span", { className: "gazer-album__value", text: value }),
    ],
  });
}

function memoryLine(doc: Doc, entry: MemoryEntry, locale: Locale): HTMLElement {
  const status = displayStatus(entry);
  const witness = witnessElement(doc, status, locale);
  const source =
    entry.source === null ? "" : ` ${tf(locale, COPY.album.sourceFrom, { id: entry.source })}`;
  return el(doc, "li", {
    className: "gazer-album__memory",
    attrs: { "data-memory-id": entry.id, "data-status": status },
    children: [witness, doc.createTextNode(` ${localizeFact(entry.fact, locale)}${source}`)],
  });
}

function consolidatedLine(doc: Doc, entry: ConsolidatedEntry, locale: Locale): HTMLElement {
  const children: Node[] = [
    el(doc, "span", {
      className: "gazer-album__cons-id",
      text: `${tf(locale, COPY.album.consolidatedRef, { id: entry.id })} `,
    }),
    el(doc, "span", { className: "gazer-album__cons-text", text: entry.content }),
  ];
  if (entry.perspectiveNote !== null) {
    children.push(
      el(doc, "span", {
        className: "gazer-album__cons-note",
        text: ` ${tf(locale, COPY.album.perspectiveNote, { note: entry.perspectiveNote })}`,
      }),
    );
  }
  return el(doc, "li", {
    className: "gazer-album__consolidated",
    attrs: { "data-memory-id": entry.id },
    children,
  });
}

function rowNode(doc: Doc, row: AlbumRow, locale: Locale): HTMLElement {
  const header = el(doc, "div", {
    className: "gazer-album__header",
    children: [
      el(doc, "span", { className: "gazer-album__id", text: row.id }),
      el(doc, "span", {
        className: "gazer-album__meta",
        text: ` ${tf(locale, COPY.album.generationInline, { n: row.generation })}`,
      }),
    ],
  });

  const meta = el(doc, "div", {
    className: "gazer-album__meta",
    children: [
      field(doc, "gazer-album__field", t(locale, COPY.album.impression), row.impressionText),
      field(doc, "gazer-album__field", t(locale, COPY.album.traits), row.traitsText),
      field(doc, "gazer-album__field", t(locale, COPY.album.workingCount), row.workingText),
      field(doc, "gazer-album__field", t(locale, COPY.album.consolidated), row.consolidatedText),
      field(doc, "gazer-album__field", t(locale, COPY.album.epistemicSplit), row.epistemicText),
    ],
  });

  const consolidatedList =
    row.consolidated.length === 0
      ? el(doc, "p", {
          className: "gazer-album__empty",
          text: t(locale, COPY.album.consolidatedEmpty),
        })
      : el(doc, "ul", {
          className: "gazer-album__list",
          children: row.consolidated.map((entry) => consolidatedLine(doc, entry, locale)),
        });

  const workingList =
    row.working.length === 0
      ? el(doc, "p", { className: "gazer-album__empty", text: t(locale, COPY.album.workingEmpty) })
      : el(doc, "ul", {
          className: "gazer-album__list",
          children: row.working.map((entry) => memoryLine(doc, entry, locale)),
        });

  return el(doc, "div", {
    className: "gazer-album__row",
    attrs: { "data-creature-id": row.id },
    children: [header, meta, consolidatedList, workingList],
  });
}

export interface AlbumView {
  readonly root: HTMLElement;
  render(creatures: readonly AlbumCreature[], memorial: WorldMemorial, locale: Locale): void;
}

/** 纪念段:一段标题 + 一列只读字段。双语全部走 COPY 池,零裸英文。 */
function memorialNode(doc: Doc, memorial: WorldMemorial, locale: Locale): HTMLElement {
  const careValue = tf(locale, COPY.album.memorialCareValue, {
    feeds: memorial.feeds,
    cleans: memorial.cleans,
    deaths: memorial.deaths,
  });
  const namesValue =
    memorial.names.length === 0
      ? t(locale, COPY.album.memorialNoNames)
      : memorial.names.join(", ");
  const shellValue =
    memorial.shellClock === null
      ? t(locale, COPY.album.memorialShellSilent)
      : memorial.shellClock;
  const newsValue =
    memorial.news === null ? t(locale, COPY.album.memorialNoNews) : memorial.news;
  const fields = el(doc, "div", {
    className: "gazer-album__meta",
    children: [
      field(
        doc,
        "gazer-album__field",
        tf(locale, COPY.hud.dayLabel, { n: memorial.day }),
        memorial.clock,
      ),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialEverLived), `${memorial.everLived}`),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialGone), `${memorial.gone}`),
      field(
        doc,
        "gazer-album__field",
        t(locale, COPY.album.memorialGeneration),
        `${memorial.maxGeneration}`,
      ),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialCare), careValue),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialNames), namesValue),
      field(
        doc,
        "gazer-album__field",
        t(locale, COPY.album.memorialGaze),
        tf(locale, COPY.album.memorialGazeValue, { seconds: memorial.gazeSeconds }),
      ),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialShellClock), shellValue),
      field(doc, "gazer-album__field", t(locale, COPY.album.memorialNews), newsValue),
    ],
  });
  // 派系句(票 0017 死键接线):两派并存时图鉴才说这句话。
  const factionLine =
    memorial.factions >= 2 ? el(doc, "p", { text: t(locale, COPY.album.factions) }) : null;
  // 塔条目(票 0017 死键接线):全图鉴唯一永远空着的条目。
  const towerEntry = el(doc, "section", {
    className: "gazer-album__memorial-tower",
    children: [
      el(doc, "h3", { className: "gazer-album__memorial-title", text: t(locale, COPY.album.towerTitle) }),
      el(doc, "p", { text: t(locale, COPY.album.towerEntry) }),
    ],
  });
  return el(doc, "div", {
    className: "gazer-album__memorial",
    attrs: { "data-memorial": "world" },
    children: [
      el(doc, "h2", { className: "gazer-album__memorial-title", text: t(locale, COPY.album.memorialTitle) }),
      fields,
      ...(factionLine === null ? [] : [factionLine]),
      towerEntry,
    ],
  });
}

export function createAlbum(doc: Doc, locale: Locale): AlbumView {
  const title = el(doc, "h1", { className: "gazer-album__heading", text: t(locale, COPY.album.title) });
  const subtitle = el(doc, "p", {
    className: "gazer-album__subtitle",
    text: t(locale, COPY.album.subtitle),
  });
  const list = el(doc, "div", { className: "gazer-album__list-body" });
  const root = el(doc, "div", {
    className: "gazer-album",
    attrs: { role: "region", "aria-label": t(locale, COPY.album.title) },
    children: [title, subtitle, list],
  });

  return {
    root,
    render(creatures, memorial, active) {
      title.textContent = t(active, COPY.album.title);
      subtitle.textContent = t(active, COPY.album.subtitle);
      root.setAttribute("aria-label", t(active, COPY.album.title));
      list.textContent = "";
      if (creatures.length === 0) {
        list.append(
          el(doc, "p", { className: "gazer-album__empty", text: t(active, COPY.album.empty) }),
        );
      } else {
        for (const row of albumRows(creatures, active)) {
          list.append(rowNode(doc, row, active));
        }
      }
      list.append(memorialNode(doc, memorial, active));
    },
  };
}
