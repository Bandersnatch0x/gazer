/**
 * Small modal panels: naming, hatch choice, and the pupil close-up.
 * They own layout only. The game decides what a choice means.
 */

import type { Locale, Text } from "./i18n";
import { t } from "./i18n";
import { COPY } from "./copy";
import type { Doc } from "./shell";
import { el } from "./shell";

export interface PanelChoice<T extends string> {
  readonly value: T;
  readonly label: Text;
  readonly note: Text;
}

export interface ChoicePanel {
  readonly root: HTMLElement;
  destroy(): void;
}

export function choicePanel<T extends string>(
  doc: Doc,
  locale: Locale,
  title: Text,
  choices: readonly PanelChoice<T>[],
  onPick: (value: T) => void,
): ChoicePanel {
  const heading = el(doc, "h2", { className: "gazer-panel__title", text: t(locale, title) });
  const buttons = choices.map((choice) => {
    const button = el(doc, "button", {
      className: "gazer-choice",
      attrs: { type: "button" },
    });
    button.append(
      el(doc, "span", { className: "gazer-choice__label", text: t(locale, choice.label) }),
      el(doc, "span", { className: "gazer-choice__note", text: t(locale, choice.note) }),
    );
    button.addEventListener("click", () => onPick(choice.value));
    return button;
  });
  const root = el(doc, "div", { className: "gazer-form", children: [heading, ...buttons] });
  return { root, destroy: () => root.remove() };
}

export interface NamePanel {
  readonly root: HTMLElement;
  focus(): void;
  destroy(): void;
}

export function namePanel(
  doc: Doc,
  locale: Locale,
  onSubmit: (name: string) => void,
): NamePanel {
  const heading = el(doc, "h2", {
    className: "gazer-panel__title",
    text: t(locale, COPY.panels.nameTitle),
  });
  const input = doc.createElement("input");
  input.className = "gazer-input";
  input.maxLength = 24;
  input.setAttribute("aria-label", t(locale, COPY.panels.namePlaceholder));
  input.placeholder = t(locale, COPY.panels.namePlaceholder);
  const button = el(doc, "button", {
    className: "gazer-choice",
    text: t(locale, COPY.panels.confirm),
    attrs: { type: "button" },
  });
  const submit = (): void => {
    const name = input.value.trim();
    if (name.length > 0) {
      onSubmit(name);
    }
  };
  button.addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if ((event as KeyboardEvent).key === "Enter") {
      submit();
    }
  });
  const root = el(doc, "div", { className: "gazer-form", children: [heading, input, button] });
  return {
    root,
    focus: () => input.focus(),
    destroy: () => root.remove(),
  };
}

export interface PupilPanel {
  readonly root: HTMLElement;
  destroy(): void;
}

/** The eye, magnified. Content by stage is the cheapest horror in the game. */
export function pupilPanel(doc: Doc, locale: Locale, stage: number): PupilPanel {
  const eye = doc.createElement("canvas");
  eye.width = 16;
  eye.height = 16;
  eye.className = "gazer-pupil";
  const ctx = eye.getContext("2d");
  if (ctx !== null) {
    ctx.fillStyle = "#f2e6c9";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#1a2b1f";
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.fill();
    // Stage 0 sees grass. Later stages see the player's cursor, then an eye.
    if (stage >= 3) {
      ctx.fillStyle = "#7ef0a6";
      ctx.fillRect(6, 6, 4, 4);
    } else if (stage >= 1) {
      ctx.fillStyle = "#2b6b46";
      ctx.fillRect(7, 7, 2, 2);
    }
  }
  const caption = el(doc, "p", {
    className: "gazer-panel__note",
    text: t(locale, stage >= 3 ? COPY.panels.pupilWatched : COPY.panels.pupilGrass),
  });
  const root = el(doc, "div", { className: "gazer-form", children: [eye, caption] });
  return { root, destroy: () => root.remove() };
}
