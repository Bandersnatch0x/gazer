import { describe, expect, it } from "vitest";
import { COPY, allTextNodes, localizeFact } from "../src/ui/copy";

describe("localizeFact (C4② 展示侧文案)", () => {
  it("rewrites the four engine fact patterns into the zh voice", () => {
    expect(localizeFact("the player named me 铃", "zh")).toBe("玩家给我起了名字：铃。");
    expect(localizeFact("the player fed 02 after hesitating 1.4 seconds", "zh")).toBe(
      "玩家喂了 02，当时犹豫了 1.4 秒。",
    );
    expect(localizeFact("the player cleaned 01", "zh")).toBe("玩家清理了 01。");
    expect(localizeFact("the player carried 03 to another place", "zh")).toBe(
      "玩家把 03 搬去了别的地方。",
    );
  });

  it("keeps the en display side on the original english facts", () => {
    const fact = "the player fed 02 after hesitating 1.4 seconds";
    expect(localizeFact(fact, "en")).toBe(fact);
  });

  it("returns unknown facts untouched instead of guessing a translation", () => {
    const fact = "some fact the engine does not emit yet";
    expect(localizeFact(fact, "zh")).toBe(fact);
  });

  it("handles the hesitation string exactly as game.ts formats it", () => {
    // game.ts:373 用 toFixed(1):整数秒也带一位小数。
    expect(localizeFact("the player fed 01 after hesitating 0.0 seconds", "zh")).toBe(
      "玩家喂了 01，当时犹豫了 0.0 秒。",
    );
  });
});

describe("§10.5 图鉴新增文案", () => {
  it("carries the faction sentence in both languages", () => {
    expect(COPY.album.factions.en.length).toBeGreaterThan(0);
    expect(COPY.album.factions.zh).toBe("现在，它们分两派。");
  });

  it("carries the tower entry: the only permanently empty entry in the game", () => {
    expect(COPY.album.towerTitle.zh).toBe("塔");
    expect(COPY.album.towerEntry.en).toContain("stay empty");
    expect(COPY.album.towerEntry.zh).toContain("将一直是空的");
  });
});

describe("C7 文案修订", () => {
  it("hatch title zh lands on 「两份意志，合成一枚」", () => {
    expect(COPY.panels.hatchTitle.zh).toBe("一枚蛋。两份意志，合成一枚。");
  });

  it("witnessedLong zh keeps the subject suspense of the en line", () => {
    expect(COPY.witness.witnessedLong.zh).toContain("在场的那个");
  });

  it("adds the stage 1-2 pupil caption so drawing and text change together", () => {
    expect(COPY.panels.pupilCursor.en).toContain("green dot");
    expect(COPY.panels.pupilCursor.zh).toContain("绿点");
  });
});

describe("copy discipline", () => {
  it("every new key still walks as a paired en/zh text node", () => {
    const paths = new Set(allTextNodes().map((entry) => entry.path));
    for (const required of [
      "album.factions",
      "album.towerTitle",
      "album.towerEntry",
      "panels.pupilCursor",
      "panels.treeTitle",
      "panels.treeNote",
      "panels.treeInherited",
    ]) {
      expect(paths.has(required)).toBe(true);
    }
  });
});
