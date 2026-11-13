import { describe, expect, expectTypeOf, it } from "vitest";
import {
  SILENT_RUN_LINE,
  isUnlivedMemory,
  manualLine,
  manualLineLocale,
  manualPairs,
  manualPool,
  namingLine,
  unlivedMemories,
  type ManualTelemetry,
} from "../src/director/manual";
import type { Telemetry } from "../src/director/telemetry";
import type { Stage } from "../src/sim/types";

const STAGES: readonly Stage[] = [0, 1, 2, 3, 4];

describe("manual dialogue pools", () => {
  it("offers at least twelve lines at every stage", () => {
    for (const stage of STAGES) {
      const pool = manualPool(stage);
      expect(pool.length).toBeGreaterThanOrEqual(12);
      for (const line of pool) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it("picks deterministically by seed", () => {
    for (const stage of STAGES) {
      expect(manualLine(stage, 12345)).toBe(manualLine(stage, 12345));
      expect(manualPool(stage)).toContain(manualLine(stage, 12345));
    }
  });

  it("treats negative and non-finite seeds safely", () => {
    expect(manualLine(2, -5)).toBe(manualLine(2, 5));
    expect(manualLine(2, Number.NaN)).toBe(manualLine(2, 0));
    expect(manualLine(2, Number.POSITIVE_INFINITY)).toBe(manualLine(2, 0));
  });

  it("covers every stage with a stage-appropriate pool", () => {
    const seen = new Set<string>();
    for (const stage of STAGES) {
      seen.add(manualLine(stage, 7));
    }
    expect(seen.size).toBe(STAGES.length);
  });
});

describe("bilingual pools (C1)", () => {
  it("pairs every line with a non-empty zh twin in the same voice", () => {
    for (const stage of STAGES) {
      for (const line of manualPairs(stage)) {
        expect(line.en.trim().length).toBeGreaterThan(0);
        expect(line.zh.trim().length).toBeGreaterThan(0);
        // zh 是译制腔,不是复述 en;两句相同即视为漏译。
        expect(line.zh).not.toBe(line.en);
      }
    }
  });

  it("returns the same index in both languages for the same seed", () => {
    // 缺省路径会把模板数字填成兜底值;测试按同一规则算期望。
    const fallbacks: Readonly<Record<string, string>> = {
      stareMs: "6200",
      hesitationMs: "1400",
      idleMs: "45000",
      rapidClicks: "7",
    };
    const fill = (template: string): string =>
      template.replace(/\{(\w+)\}/g, (whole: string, key: string) => fallbacks[key] ?? whole);
    for (const stage of STAGES) {
      const pool = manualPairs(stage);
      for (let seed = 0; seed < pool.length * 2; seed += 1) {
        const index = seed % pool.length;
        expect(manualLineLocale(stage, seed, "en")).toBe(fill(pool[index]?.en ?? ""));
        expect(manualLineLocale(stage, seed, "zh")).toBe(fill(pool[index]?.zh ?? ""));
      }
    }
  });

  it("keeps the zh voice: every line lands on a full stop", () => {
    for (const stage of STAGES) {
      for (const line of manualPairs(stage)) {
        expect(line.zh.endsWith("。")).toBe(true);
      }
    }
  });
});

describe("telemetry injection (C3)", () => {
  it("accepts the frozen stream-A telemetry shape (src/director/telemetry.ts)", () => {
    // ManualTelemetry 是本地同形定义;A 流的冻结接口落盘后必须无损注入。
    expectTypeOf<Telemetry>().toMatchTypeOf<ManualTelemetry>();
  });

  const telemetry: ManualTelemetry = {
    hesitationMs: 2731,
    rapidClicks: 12,
    idleMs: 88000,
    stareMs: 9450,
    namedNames: ["鲁道夫", "铃"],
    feeds: 14,
    cleans: 3,
    deaths: 1,
  };

  it("fills numeric templates with the real telemetry when given", () => {
    const line = manualLine(3, 0, telemetry);
    expect(line).toContain("9450ms");
    expect(line).not.toContain("6200");
  });

  it("falls back to the canonical numbers when no telemetry is passed", () => {
    expect(manualLine(3, 0)).toContain("6200ms");
    expect(manualLine(3, 1)).toContain("1400ms");
    expect(manualLine(3, 2)).toContain("7 times");
    expect(manualLine(3, 3)).toContain("45000ms");
    // 旧文案的「假精确」数字在缺省路径下原样保留,既有调用点不变。
    expect(manualLine(3, 0)).toBe("you stared at 02 for 6200ms. i have the number");
  });

  it("maps null hesitation onto the fallback number instead of printing null", () => {
    expect(manualLine(3, 1, { ...telemetry, hesitationMs: null })).toContain("1400ms");
  });

  it("never produces NaN, negatives or unresolved placeholders from hostile telemetry", () => {
    const hostile: ManualTelemetry = {
      hesitationMs: -400,
      rapidClicks: Number.NaN,
      idleMs: Number.POSITIVE_INFINITY,
      stareMs: Number.NaN,
      namedNames: [],
      feeds: 0,
      cleans: 0,
      deaths: 0,
    };
    for (let seed = 0; seed < 6; seed += 1) {
      const line = manualLine(3, seed, hostile);
      expect(line).not.toMatch(/\{|\bNaN\b|-/);
    }
  });

  it("injects zh templates with the same telemetry", () => {
    const zh = manualLineLocale(3, 0, "zh", telemetry);
    expect(zh).toContain("9450 毫秒");
  });
});

describe("memories of the unlived (C2)", () => {
  it("claims exactly the three lines that cite unimplemented interactions", () => {
    const all = STAGES.flatMap((stage) => unlivedMemories(stage));
    expect(all.length).toBe(3);
    expect(all.some((line) => line.en.includes("you called it playing"))).toBe(true);
    expect(all.some((line) => line.en.includes("do you love it"))).toBe(true);
    expect(all.some((line) => line.en.includes("the hazard"))).toBe(true);
  });

  it("marks the right (stage, seed) pairs, and only those", () => {
    const marked: string[] = [];
    for (const stage of STAGES) {
      const pool = manualPairs(stage);
      for (let seed = 0; seed < pool.length; seed += 1) {
        if (isUnlivedMemory(stage, seed)) {
          marked.push(manualLine(stage, seed));
        }
      }
    }
    expect(marked.length).toBe(3);
    expect(marked.every((line) => line.includes("you called it playing") || line.includes("do you love it") || line.includes("the hazard"))).toBe(true);
  });
});

describe("SILENT_RUN_LINE (C6)", () => {
  it("exists in both languages and breaks the silence with one line", () => {
    expect(SILENT_RUN_LINE.en.trim().length).toBeGreaterThan(0);
    expect(SILENT_RUN_LINE.zh.trim().length).toBeGreaterThan(0);
    expect(SILENT_RUN_LINE.en).not.toBe(SILENT_RUN_LINE.zh);
  });

  it("is the forty-minute payoff, written in the model's voice", () => {
    expect(SILENT_RUN_LINE.en).toContain("forty minutes");
    expect(SILENT_RUN_LINE.zh).toContain("四十分钟");
  });
});

describe("NAMING_LINE (C4①)", () => {
  it("keeps the best line in the game, bilingual, with the name filled in", () => {
    expect(namingLine("铃", "en")).toBe("you gave us names. we never agreed to them. 铃.");
    expect(namingLine("铃", "zh")).toBe("你给我们起了名字。我们从来没有答应过。铃。");
    // 模板占位符必须被填掉,不许漏到玩家眼前。
    expect(namingLine("铃", "en")).not.toContain("{name}");
    expect(namingLine("铃", "zh")).not.toContain("{name}");
  });
});
