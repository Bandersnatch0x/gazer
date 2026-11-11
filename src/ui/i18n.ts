/**
 * 语言原语：界面只有两种语言，字符串一律以 `Text` 双写，取用时按 locale 选边。
 * 选择顺序：URL 参数 `?lang=` → localStorage `gazer-locale` → 英文。
 */

export type Locale = "en" | "zh";

export type Text = Readonly<Record<Locale, string>>;

export const LOCALES: readonly Locale[] = ["en", "zh"];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_STORAGE_KEY = "gazer-locale";

export const LOCALE_PARAM = "lang";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

/**
 * 取一条双写文案。空串视为缺失，回落到英文，避免界面上出现空白标签。
 */
export function t(locale: Locale, text: Text): string {
  const value = text[locale];
  return value.trim().length > 0 ? value : text[DEFAULT_LOCALE];
}

export function nextLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}

/**
 * 模板填充。占位符写作 `{name}`；找不到的值原样保留，方便测试与肉眼定位漏填。
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key];
    return value === undefined ? whole : String(value);
  });
}

/** `t` + `fill` 的常用组合。 */
export function tf(
  locale: Locale,
  text: Text,
  values: Readonly<Record<string, string | number>>,
): string {
  return fill(t(locale, text), values);
}

/**
 * 从查询串里读 `?lang=`。非法值返回 null，让调用方继续往下落。
 */
export function localeFromSearch(search: string): Locale | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (query.length === 0) {
    return null;
  }
  const value = new URLSearchParams(query).get(LOCALE_PARAM);
  return isLocale(value) ? value : null;
}

export function detectLocale(search: string, stored: string | null): Locale {
  const fromSearch = localeFromSearch(search);
  if (fromSearch !== null) {
    return fromSearch;
  }
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

/** 只依赖两个方法，方便在测试里传一个内存实现。 */
export interface LocaleStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredLocale(store: LocaleStore | null): string | null {
  if (store === null) {
    return null;
  }
  try {
    return store.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberLocale(store: LocaleStore | null, locale: Locale): void {
  if (store === null) {
    return;
  }
  try {
    store.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // 隐私模式或配额耗尽时保持静默：语言偏好丢了不影响游戏。
  }
}
