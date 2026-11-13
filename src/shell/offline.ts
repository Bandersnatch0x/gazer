import { SHELL_PALETTE } from "./palette";
import type { Locale, Text } from "../ui/i18n";
import { DEFAULT_LOCALE, t } from "../ui/i18n";

export type Cleanup = () => void;

export type ConnectionState = "online" | "offline";

export interface ConnectionWindow {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

/**
 * 离线提示(GAME_REVIEW C4③,原为英文单语)。按界面语言取词;
 * 英文句保持原样——它是一句话完成「静默运行」设定的范本,不动。
 */
export const OFFLINE_NOTICE_TEXT: Text = Object.freeze({
  en: "the world keeps its own time.",
  zh: "世界照它自己的时间走。",
});

export function watchConnection(
  handler: (state: ConnectionState) => void,
  win: ConnectionWindow,
): Cleanup {
  let last: ConnectionState = win.navigator.onLine ? "online" : "offline";
  const report = (next: ConnectionState): void => {
    if (next === last) return;
    last = next;
    handler(next);
  };
  const onOnline = (): void => report("online");
  const onOffline = (): void => report("offline");
  win.addEventListener("online", onOnline);
  win.addEventListener("offline", onOffline);
  return () => {
    win.removeEventListener("online", onOnline);
    win.removeEventListener("offline", onOffline);
  };
}

export function showOfflineNotice(doc: Document, locale: Locale = DEFAULT_LOCALE): Cleanup {
  const notice = doc.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("data-gazer", "offline-notice");
  notice.textContent = t(locale, OFFLINE_NOTICE_TEXT);
  notice.style.cssText = [
    "position:fixed",
    "left:12px",
    "bottom:12px",
    "pointer-events:none",
    "font:11px ui-monospace,monospace",
    `color:${SHELL_PALETTE.text}`,
    "opacity:0.5",
  ].join(";");
  doc.body.appendChild(notice);
  return () => notice.remove();
}
