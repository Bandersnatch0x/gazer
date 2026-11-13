/**
 * The reflection channel (projection hidden line, ticket 0058; decision
 * 0014, SPEC §4 L5 / §5). The monitor's own OSD face: green-on-black,
 * translucent — the same in-fiction language as the settings page
 * (ART-CORE-04 §2.3). It shows what the swarm currently believes about the
 * outside and about the hand that feeds them, plus the bee/ant predictions
 * and their score.
 *
 * Layer rulings held (SPEC §5):
 * - OSD layer, not a world panel, not the world canvas (R3's logic): the
 *   world's integer-scale discipline is untouched, and nothing here reads
 *   game state on its own — the game layer hands in a snapshot per open.
 * - G9: this layer must never become a third bloom point — the text color
 *   is deliberately dimmer than the terminal cursor, and no glow/text-shadow
 *   is ever set.
 * - LCD MODE does not hide this channel (content, not framing); it carries
 *   no framing effects of its own, so there is nothing to disable.
 * - Passive surface: it renders only when opened, never auto-plays, no sound.
 * - Copy discipline: every user-visible string lives in `./copy`
 *   (`COPY.projection`); this file holds selectors and numbers only.
 */

import type { Locale } from "./i18n";
import { t } from "./i18n";
import type { Doc } from "./shell";
import { el } from "./shell";
import { FONT_STACK } from "./theme";
import { COPY } from "./copy";
import type { PredictionClaim, Reflection, ReflectionNode } from "../sim/projection";

/** Dimmer than the terminal cursor and the G highlight (G9 bloom whitelist). */
const OSD_INK = "#2f9e58";
const OSD_INK_DIM = "#1d6b3a";
const OSD_BG = "rgba(5, 10, 7, 0.84)";
const OSD_BORDER = "#17301f";
const OSD_AMBER = "#8a7a3a";

/** The DOS confidence bar: ten cells, filled blocks first. */
function bar(confidence: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(confidence * 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function topicLabel(locale: Locale, topic: ReflectionNode["topic"]): string {
  const key =
    topic === "sky"
      ? COPY.projection.topicSky
      : topic === "market"
        ? COPY.projection.topicMarket
        : topic === "crowd"
          ? COPY.projection.topicCrowd
          : COPY.projection.topicPlayer;
  return t(locale, key);
}

function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole: string, key: string) => {
    const value = values[key];
    return value === undefined ? whole : String(value);
  });
}

export interface ReflectionSnapshot {
  readonly day: number;
  readonly reflection: Reflection;
  readonly predictions: readonly PredictionClaim[];
  readonly locale: Locale;
}

export interface ReflectionChannel {
  readonly root: HTMLElement;
  isOpen(): boolean;
  open(snapshot: ReflectionSnapshot): void;
  refresh(snapshot: ReflectionSnapshot): void;
  close(): void;
  toggle(snapshot: ReflectionSnapshot): void;
  destroy(): void;
}

export function createReflectionChannel(doc: Doc): ReflectionChannel {
  const root = el(doc, "div", { className: "gazer-osd" });
  root.hidden = true;
  Object.assign(root.style, {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    bottom: "22vh",
    width: "92vw",
    maxWidth: "52rem",
    background: OSD_BG,
    border: `1px solid ${OSD_BORDER}`,
    color: OSD_INK,
    font: `12px/1.8 ${FONT_STACK}`,
    padding: "10px 14px",
    zIndex: "60",
    letterSpacing: "0.05em",
    // G9: no glow, no text-shadow, ever — the OSD must stay below the two
    // canonical bloom points in perceived brightness.
    textShadow: "none",
    boxShadow: "none",
  } satisfies Partial<CSSStyleDeclaration>);

  const titleEl = el(doc, "div", { className: "gazer-osd__title" });
  const hintEl = el(doc, "div", { className: "gazer-osd__hint" });
  const rowsEl = el(doc, "div", { className: "gazer-osd__rows" });
  const predictionEl = el(doc, "div", { className: "gazer-osd__prediction" });
  const closeButton = el(doc, "button", {
    className: "gazer-osd__close",
    attrs: { type: "button" },
  });
  Object.assign(closeButton.style, {
    background: "none",
    border: "none",
    color: OSD_INK_DIM,
    font: "inherit",
    cursor: "pointer",
    padding: "2px 0 0",
  } satisfies Partial<CSSStyleDeclaration>);
  root.append(titleEl, hintEl, rowsEl, predictionEl, closeButton);

  let open = false;
  let expandedTopic: ReflectionNode["topic"] | null = null;
  let current: ReflectionSnapshot | null = null;

  function claimOf(node: ReflectionNode, locale: Locale): string {
    const claim = locale === "zh" ? node.claimZh : node.claimEn;
    return claim.length > 0 ? claim : t(locale, COPY.projection.noSignal);
  }

  function nodeRow(doc: Doc, node: ReflectionNode, locale: Locale): HTMLElement {
    const row = el(doc, "div", { className: "gazer-osd__row" });
    row.style.cursor = "pointer";
    const head = el(doc, "div", { className: "gazer-osd__rowhead" });
    const tagSpan = el(doc, "span", {
      className: "gazer-osd__tag",
      text: `[${topicLabel(locale, node.topic)}] `,
    });
    const claimSpan = el(doc, "span", {
      className: "gazer-osd__claim",
      text: claimOf(node, locale),
    });
    const meterSpan = el(doc, "span", {
      className: "gazer-osd__meter",
      text: ` ${bar(node.confidence)} ${Math.round(node.confidence * 100)}%`,
    });
    head.append(tagSpan, claimSpan, meterSpan);
    const meta = el(doc, "div", { className: "gazer-osd__meta" });
    meta.append(
      el(doc, "span", {
        className: "gazer-osd__held",
        text: ` ${fill(t(locale, COPY.projection.heldBy), { n: node.heldBy.length })} · `,
      }),
      el(doc, "span", {
        className: "gazer-osd__drift",
        text: fill(t(locale, COPY.projection.drift), { d: Math.round(node.divergence * 100) }),
      }),
    );
    row.append(head, meta);
    if (node.topic === "player") {
      for (const styled of [tagSpan, head]) {
        styled.style.setProperty("color", OSD_AMBER);
      }
    }
    if (expandedTopic === node.topic) {
      const trace = el(doc, "div", {
        className: "gazer-osd__trace",
        text: fill(t(locale, COPY.projection.traceHead), {
          chain: node.traceChain.length > 0 ? node.traceChain.join(" → ") : "—",
        }),
      });
      trace.style.setProperty("color", OSD_INK_DIM);
      row.append(trace);
    }
    row.addEventListener("click", (event: Event) => {
      event.stopPropagation();
      expandedTopic = expandedTopic === node.topic ? null : node.topic;
      rerender();
    });
    return row;
  }

  function rerender(): void {
    if (current === null) {
      return;
    }
    const { reflection, predictions, locale } = current;
    titleEl.textContent = `${t(locale, COPY.projection.title)}  D${reflection.day + 1}`;
    titleEl.style.setProperty("color", OSD_INK);
    hintEl.textContent = t(locale, COPY.projection.hint);
    hintEl.style.setProperty("color", OSD_INK_DIM);
    closeButton.textContent = t(locale, COPY.projection.close);
    rowsEl.replaceChildren(...reflection.nodes.map((node) => nodeRow(doc, node, locale)));
    const openClaim = predictions.find((claim) => claim.resolvedTo === null);
    predictionEl.textContent =
      openClaim === undefined
        ? t(locale, COPY.projection.predictionIdle)
        : fill(t(locale, COPY.projection.prediction), {
            topic: topicLabel(locale, openClaim.topic),
            c: Math.round(openClaim.confidence * 100),
          });
  }

  closeButton.addEventListener("click", () => {
    close();
  });

  function close(): void {
    open = false;
    root.hidden = true;
  }

  return {
    root,
    isOpen: () => open,
    open(snapshot) {
      current = snapshot;
      open = true;
      root.hidden = false;
      expandedTopic = null;
      rerender();
    },
    refresh(snapshot) {
      // Locale switches re-render in place; an open channel never closes
      // under the reader.
      current = snapshot;
      if (open) {
        rerender();
      }
    },
    close,
    toggle(snapshot) {
      if (open) {
        close();
      } else {
        current = snapshot;
        open = true;
        root.hidden = false;
        expandedTopic = null;
        rerender();
      }
    },
    destroy() {
      root.remove();
    },
  };
}
