/**
 * 相册面板：每只生物一行，列出编号、世代、好感、最突出的两条性格、
 * 工作记忆条数、以及已经固化的条目原文。
 *
 * 面板存在的理由只有一个：让玩家看得见「亲见」和「听说」的差别。
 * 所以每只生物都带一个来源计数，且工作记忆逐条标出来源。
 */

import type { CreatureId } from "../sim/types";
import type { ConsolidatedEntry, MemoryEntry, MemorySlice } from "../sim/memory";
import { CONSOLIDATED_CAPACITY, WORKING_CAPACITY } from "../sim/memory";
import type { GenomeTraits } from "../sim/genome";
import { topTraits } from "../sim/genome";
import type { Locale, Text } from "./i18n";
import { t, tf } from "./i18n";
import { COPY } from "./copy";
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
    children: [witness, doc.createTextNode(` ${entry.fact}${source}`)],
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
  render(creatures: readonly AlbumCreature[], locale: Locale): void;
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
    render(creatures, active) {
      title.textContent = t(active, COPY.album.title);
      subtitle.textContent = t(active, COPY.album.subtitle);
      root.setAttribute("aria-label", t(active, COPY.album.title));
      list.textContent = "";
      if (creatures.length === 0) {
        list.append(
          el(doc, "p", { className: "gazer-album__empty", text: t(active, COPY.album.empty) }),
        );
        return;
      }
      for (const row of albumRows(creatures, active)) {
        list.append(rowNode(doc, row, active));
      }
    },
  };
}
