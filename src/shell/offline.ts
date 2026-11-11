import { SHELL_PALETTE } from "./palette";

export type Cleanup = () => void;

export type ConnectionState = "online" | "offline";

export interface ConnectionWindow {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(type: "online" | "offline", listener: () => void): void;
  removeEventListener(type: "online" | "offline", listener: () => void): void;
}

export const OFFLINE_NOTICE_TEXT = "the world keeps its own time.";

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

export function showOfflineNotice(doc: Document): Cleanup {
  const notice = doc.createElement("div");
  notice.setAttribute("role", "status");
  notice.setAttribute("data-gazer", "offline-notice");
  notice.textContent = OFFLINE_NOTICE_TEXT;
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
