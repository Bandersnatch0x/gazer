import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  detectLocale,
  fill,
  isLocale,
  localeFromSearch,
  nextLocale,
  readStoredLocale,
  rememberLocale,
  t,
} from "../src/ui/i18n";
import { allTextNodes } from "../src/ui/copy";

function pick<T>(values: readonly T[]): fc.Arbitrary<T> {
  return fc.integer({ min: 0, max: values.length - 1 }).map((index) => values[index] as T);
}

describe("locale primitives", () => {
  it("t always returns a non-empty string for every copy key in both locales", () => {
    const nodes = allTextNodes();
    expect(nodes.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(pick(nodes), pick(LOCALES), (node, locale) => {
        expect(t(locale, node.text).trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 400 },
    );
  });

  it("every copy node is present in English and Chinese", () => {
    for (const node of allTextNodes()) {
      expect(node.text.en.trim().length, `${node.path}.en`).toBeGreaterThan(0);
      expect(node.text.zh.trim().length, `${node.path}.zh`).toBeGreaterThan(0);
    }
  });

  it("falls back to English when a translation is blank", () => {
    expect(t("zh", { en: "kept", zh: "   " })).toBe("kept");
    expect(t("en", { en: "kept", zh: "留" })).toBe("kept");
  });

  it("nextLocale is an involution and always changes the locale", () => {
    fc.assert(
      fc.property(pick(LOCALES), (locale) => {
        const other = nextLocale(locale);
        expect(other).not.toBe(locale);
        expect(nextLocale(other)).toBe(locale);
      }),
      { numRuns: 20 },
    );
  });

  it("isLocale rejects everything that is not exactly en or zh", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(2)).toBe(false);
  });

  it("fill keeps unknown placeholders intact", () => {
    expect(fill("{a} of {b}", { a: 3, b: 12 })).toBe("3 of 12");
    expect(fill("{a} of {missing}", { a: 1 })).toBe("1 of {missing}");
  });
});

describe("detectLocale order", () => {
  const storedArb = fc.constantFrom<string | null>("en", "zh", "fr", "", "EN", null);
  const queryArb = fc.constantFrom("en", "zh", "fr", "", "EN", "zh-CN");

  it("prefers the query parameter, then stored, then English", () => {
    fc.assert(
      fc.property(queryArb, storedArb, (query, stored) => {
        const search = query.length === 0 ? "" : `?lang=${query}`;
        const expected = isLocale(query) ? query : isLocale(stored) ? stored : DEFAULT_LOCALE;
        expect(detectLocale(search, stored)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("accepts the query with or without a leading question mark", () => {
    expect(localeFromSearch("?lang=zh")).toBe("zh");
    expect(localeFromSearch("lang=zh")).toBe("zh");
    expect(localeFromSearch("?lang=fr")).toBeNull();
    expect(localeFromSearch("?other=zh")).toBeNull();
    expect(localeFromSearch("")).toBeNull();
  });

  it("is stable: the same inputs always give the same locale", () => {
    fc.assert(
      fc.property(fc.string(), storedArb, (search, stored) => {
        const first = detectLocale(search, stored);
        expect(detectLocale(search, stored)).toBe(first);
        expect(isLocale(first)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("falls back to English when neither source is valid", () => {
    expect(detectLocale("", null)).toBe("en");
    expect(detectLocale("?lang=de", "de")).toBe("en");
  });

  it("query wins over a stored preference", () => {
    expect(detectLocale("?lang=en", "zh")).toBe("en");
    expect(detectLocale("?lang=zh", "en")).toBe("zh");
  });

  it("stored preference wins when the query is absent or invalid", () => {
    expect(detectLocale("", "zh")).toBe("zh");
    expect(detectLocale("?lang=fr", "zh")).toBe("zh");
  });
});

describe("locale storage", () => {
  function memoryStore(initial: Readonly<Record<string, string>> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      values,
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
    };
  }

  it("reads and writes the documented key", () => {
    const store = memoryStore();
    rememberLocale(store, "zh");
    expect(store.values.get(LOCALE_STORAGE_KEY)).toBe("zh");
    expect(readStoredLocale(store)).toBe("zh");
  });

  it("survives a missing or throwing store", () => {
    expect(readStoredLocale(null)).toBeNull();
    const throwing = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: (): void => {
        throw new Error("blocked");
      },
    };
    expect(readStoredLocale(throwing)).toBeNull();
    expect(() => rememberLocale(throwing, "zh")).not.toThrow();
  });
});

/**
 * 文案纪律：界面可见的字符串只能住在 copy.ts 与 help.ts。
 * 组件文件里出现三个及以上连续英文词，就判定为一句裸英文。
 */
const UI_DIR = join(process.cwd(), "src", "ui");
const COPY_FILES = new Set(["copy.ts", "help.ts"]);
const STYLE_FILE = "theme.ts";

interface ScannedFile {
  readonly name: string;
  readonly source: string;
}

function componentFiles(): readonly ScannedFile[] {
  return readdirSync(UI_DIR)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) => !COPY_FILES.has(name) && name !== STYLE_FILE)
    .map((name) => ({ name, source: readFileSync(join(UI_DIR, name), "utf8") }));
}

/** 去掉注释，只留代码，避免中文注释或英文注释被误判。 */
function stripComments(source: string): string {
  let out = "";
  let index = 0;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const newline = source.indexOf("\n", index);
      index = newline === -1 ? source.length : newline;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    out += source[index];
    index += 1;
  }
  return out;
}

/** 抽出所有字符串字面量（单引号、双引号、反引号）。 */
function stringLiterals(source: string): readonly string[] {
  const code = stripComments(source);
  const out: string[] = [];
  let index = 0;
  while (index < code.length) {
    const char = code[index];
    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      let value = "";
      index += 1;
      while (index < code.length && code[index] !== quote) {
        if (code[index] === "\\") {
          value += code[index + 1] ?? "";
          index += 2;
          continue;
        }
        value += code[index];
        index += 1;
      }
      out.push(value);
      index += 1;
      continue;
    }
    index += 1;
  }
  return out;
}

const WORD = /[A-Za-z][A-Za-z'-]*/g;

function looksLikeEnglishSentence(value: string): boolean {
  const withoutInterpolation = value.replace(/\$\{[^}]*\}/g, " ");
  const words = (withoutInterpolation.match(WORD) ?? []).filter((word) => word.length >= 2);
  return words.length >= 3;
}

describe("copy discipline", () => {
  it("the sentence detector has a working positive and negative control", () => {
    expect(looksLikeEnglishSentence("Nothing speaks in this room tonight.")).toBe(true);
    expect(looksLikeEnglishSentence("gazer-dialogue__line")).toBe(false);
    expect(looksLikeEnglishSentence("aria-live")).toBe(false);
    expect(looksLikeEnglishSentence("${options.className}__title")).toBe(false);
  });

  it("scans a non-empty set of component files", () => {
    const names = componentFiles().map((file) => file.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("i18n.ts");
    expect(names).not.toContain("copy.ts");
    expect(names).not.toContain("help.ts");
  });

  it("no component file contains a bare English sentence", () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const literal of stringLiterals(file.source)) {
        if (looksLikeEnglishSentence(literal)) {
          offenders.push(`${file.name}: ${literal}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component file declares its own bilingual strings", () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const code = stripComments(file.source);
      if (/\ben\s*:/.test(code) || /\bzh\s*:/.test(code)) {
        offenders.push(file.name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the style file carries no user-visible content", () => {
    const source = readFileSync(join(UI_DIR, STYLE_FILE), "utf8");
    // 只看声明起始处的 `content:`，`justify-content:` 不算。
    expect(/(^|[\s;{])content\s*:/m.test(source)).toBe(false);
  });
});
