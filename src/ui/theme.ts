/**
 * 对话框的样式。它是样式，不是文案：这里只有选择器和声明，
 * 没有 `content` 属性，所以没有任何用户可见的字符串藏在这里。
 * 组件文件扫描测试会把本文件列入豁免，并额外断言本文件不含 `content`。
 */

export const SHELL_STYLE = `
  :root {
    --gazer-paper: #10130f;
    --gazer-paper-raised: #171b15;
    --gazer-ink: #cfe8d5;
    --gazer-ink-dim: #7d8f81;
    --gazer-hairline: #2a322a;
    --gazer-mark: #4b5a4d;
  }
  .gazer-dialogue {
    background: var(--gazer-paper);
    color: var(--gazer-ink);
    border: 1px solid var(--gazer-hairline);
    font: 12px/1.7 ui-monospace, "Courier New", monospace;
    max-width: 44rem;
    /* The transcript must never grow up over the map and eat the clicks. */
    max-height: 34vh;
    display: flex;
    flex-direction: column;
  }
  .gazer-dialogue__body {
    overflow-y: auto;
  }
  .gazer-dialogue__bar {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 2px 6px;
    border-bottom: 1px solid var(--gazer-hairline);
    color: var(--gazer-ink-dim);
    letter-spacing: 0.04em;
  }
  .gazer-dialogue__body {
    padding: 6px;
    min-height: 6.5rem;
  }
  .gazer-dialogue__line {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
  }
  .gazer-dialogue__speaker {
    color: var(--gazer-ink-dim);
    min-width: 5ch;
  }
  .gazer-dialogue__text {
    flex: 1;
    white-space: pre-wrap;
  }
  .gazer-dialogue__empty {
    color: var(--gazer-ink-dim);
    font-style: italic;
  }
  .gazer-witness {
    border: 0;
    background: none;
    padding: 0;
    margin: 0;
    color: var(--gazer-mark);
    font: inherit;
    line-height: 1;
    cursor: help;
    opacity: 0.18;
    transition: opacity 120ms linear;
  }
  .gazer-witness:hover,
  .gazer-witness:focus-visible {
    opacity: 1;
    outline: 1px dotted var(--gazer-hairline);
  }
  .gazer-witness__label {
    display: inline-block;
    max-width: 0;
    overflow: hidden;
    white-space: nowrap;
    vertical-align: baseline;
    transition: max-width 120ms linear;
  }
  .gazer-witness:hover .gazer-witness__label,
  .gazer-witness:focus-visible .gazer-witness__label {
    max-width: 10ch;
  }
  .gazer-album {
    border: 1px solid var(--gazer-hairline);
    padding: 8px;
  }
  .gazer-album__row {
    border-top: 1px solid var(--gazer-hairline);
    padding: 6px 0;
  }
  .gazer-album__id {
    color: var(--gazer-ink);
    letter-spacing: 0.06em;
  }
  .gazer-album__meta {
    color: var(--gazer-ink-dim);
  }
  .gazer-album__memory {
    white-space: pre-wrap;
  }
  .gazer-album__consolidated {
    color: var(--gazer-ink);
  }
  .gazer-help {
    border: 1px solid var(--gazer-hairline);
    padding: 10px;
    max-width: 46rem;
  }
  .gazer-help__section + .gazer-help__section {
    margin-top: 0.9rem;
  }
  .gazer-help__title {
    font-size: 1em;
    margin: 0 0 0.3rem;
    letter-spacing: 0.06em;
  }
  .gazer-help p {
    margin: 0 0 0.4rem;
  }
  .gazer-toolbar {
    display: flex;
    gap: 0.75rem;
    padding: 4px 0;
  }
  .gazer-toolbar button {
    background: none;
    border: 1px solid var(--gazer-hairline);
    color: var(--gazer-ink-dim);
    font: inherit;
    padding: 1px 8px;
    cursor: pointer;
  }
  .gazer-toolbar button:hover,
  .gazer-toolbar button:focus-visible {
    color: var(--gazer-ink);
  }
`;

export const SHELL_STYLE_ID = "gazer-ui-style";

export function installStyles(doc: Document): void {
  if (doc.getElementById(SHELL_STYLE_ID) !== null) {
    return;
  }
  const style = doc.createElement("style");
  style.id = SHELL_STYLE_ID;
  style.textContent = SHELL_STYLE;
  doc.head.append(style);
}
