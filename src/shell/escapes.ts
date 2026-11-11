import { SHELL_PALETTE } from "./palette";

export type Cleanup = () => void;

const ICON_SELECTOR = 'link[rel~="icon"]';
const EYE_CANVAS_SIZE = 64;
const EYE_SPOTS: readonly (readonly [string, string])[] = [
  ["2%", "12%"],
  ["92%", "18%"],
  ["6%", "82%"],
  ["88%", "88%"],
];

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function drawEye(ctx: CanvasRenderingContext2D, intensity: number): void {
  const size = EYE_CANVAS_SIZE;
  const mid = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = SHELL_PALETTE.void;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = SHELL_PALETTE.accent;
  ctx.beginPath();
  ctx.ellipse(mid, mid, size * 0.4, size * (0.12 + 0.16 * intensity), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SHELL_PALETTE.void;
  ctx.beginPath();
  ctx.arc(mid, mid, size * (0.06 + 0.1 * intensity), 0, Math.PI * 2);
  ctx.fill();
}

export function setFaviconEye(intensity: number, doc: Document): Cleanup {
  const canvas = doc.createElement("canvas");
  canvas.width = EYE_CANVAS_SIZE;
  canvas.height = EYE_CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return () => {};
  drawEye(ctx, clamp01(intensity));
  const href = canvas.toDataURL("image/png");

  const existing = doc.querySelector(ICON_SELECTOR);
  if (existing !== null) {
    const previousHref = existing.getAttribute("href");
    const previousType = existing.getAttribute("type");
    existing.setAttribute("href", href);
    existing.setAttribute("type", "image/png");
    return () => {
      if (previousHref === null) existing.removeAttribute("href");
      else existing.setAttribute("href", previousHref);
      if (previousType === null) existing.removeAttribute("type");
      else existing.setAttribute("type", previousType);
    };
  }

  const link = doc.createElement("link");
  link.setAttribute("rel", "icon");
  link.setAttribute("type", "image/png");
  link.setAttribute("href", href);
  doc.head.appendChild(link);
  return () => link.remove();
}

export function mutateTitle(text: string, doc: Document): Cleanup {
  const previous = doc.title;
  doc.title = text;
  return () => {
    doc.title = previous;
  };
}

export function onVisibilityReturn(
  handler: (hiddenMs: number) => void,
  doc: Document,
  now: () => number = () => Date.now(),
): Cleanup {
  let hiddenSince: number | null = doc.visibilityState === "hidden" ? now() : null;
  const onChange = (): void => {
    if (doc.visibilityState === "hidden") {
      if (hiddenSince === null) hiddenSince = now();
      return;
    }
    if (hiddenSince === null) return;
    const hiddenMs = now() - hiddenSince;
    hiddenSince = null;
    handler(Math.max(0, hiddenMs));
  };
  doc.addEventListener("visibilitychange", onChange);
  return () => {
    doc.removeEventListener("visibilitychange", onChange);
    hiddenSince = null;
  };
}

export function showOutsideEyes(opacity: number, doc: Document): Cleanup {
  const layer = doc.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-gazer", "outside-eyes");
  layer.style.cssText = [
    "position:fixed",
    "inset:0",
    "pointer-events:none",
    "z-index:2147483647",
    "line-height:1",
    "font:16px ui-monospace,monospace",
    `color:${SHELL_PALETTE.accent}`,
    `opacity:${clamp01(opacity)}`,
  ].join(";");

  for (const [left, top] of EYE_SPOTS) {
    const eye = doc.createElement("span");
    eye.textContent = "◉";
    eye.style.cssText = `position:absolute;left:${left};top:${top}`;
    layer.appendChild(eye);
  }

  doc.body.appendChild(layer);
  return () => layer.remove();
}
