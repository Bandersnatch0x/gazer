/**
 * Ticket 0063 B6 (lead closeout): the full-screen closeup overlay used to be
 * a keyboard trap — the only exit was `pointerdown`, no Escape, no role, no
 * focusable close button (B-group ui-audit blocking finding 3).
 *
 * These assertions pin the overlay's observable dialog semantics on the
 * `game.ts` source (the wiring is browser-bound; the pure faces of the same
 * fix live in `game-robustness-0068.test.ts` for driver/duck behaviour).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../src/game.ts", import.meta.url), "utf8");

function openCloseupBody(): string {
  const marker = "function openCloseup(";
  const start = SOURCE.indexOf(marker);
  const next = SOURCE.indexOf("\n  /** Staring into the pupil", start);
  return SOURCE.slice(start, next);
}

describe("ticket 0063 B6: the pupil closeup is a dialog, not a keyboard trap", () => {
  const body = openCloseupBody();

  it("declares dialog semantics on the overlay", () => {
    expect(body).toContain('overlay.setAttribute("role", "dialog")');
    expect(body).toContain('overlay.setAttribute("aria-modal", "true")');
    expect(body).toContain("overlay.tabIndex = -1");
  });

  it("closes on Escape and removes the listener on dispose", () => {
    expect(body).toContain('if (event.key === "Escape")');
    expect(body).toContain("doc.addEventListener(\"keydown\", closeKey)");
    expect(body).toContain("doc.removeEventListener(\"keydown\", closeKey)");
  });

  it("ships a focusable close button and focuses the overlay on open", () => {
    expect(body).toContain('closeButton.setAttribute("aria-label", "close pupil closeup")');
    expect(body).toContain("overlay.append(eye, closeButton)");
    expect(body).toContain("overlay.focus()");
  });
});
