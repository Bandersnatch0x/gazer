/**
 * DOM 装配原语。全是普通函数，没有框架、没有状态容器、没有生命周期。
 * 这里只负责「造元素 / 填文本 / 挂子节点」，不决定任何游戏逻辑，也不持有样式。
 */

export type Doc = Pick<Document, "createElement" | "createTextNode">;

export interface ElOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly children?: readonly Node[];
}

export function el(doc: Doc, tag: string, options: ElOptions = {}): HTMLElement {
  const node = doc.createElement(tag);
  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const child of options.children ?? []) {
    node.append(child);
  }
  return node;
}

export interface SectionOptions {
  readonly className: string;
  readonly title: string;
  readonly body: readonly Node[];
}

export function section(doc: Doc, options: SectionOptions): HTMLElement {
  const heading = el(doc, "h2", { className: `${options.className}__title`, text: options.title });
  return el(doc, "section", {
    className: options.className,
    attrs: { "aria-label": options.title },
    children: [heading, ...options.body],
  });
}

export interface ParagraphOptions {
  readonly className: string;
  readonly text: string;
}

export function paragraph(doc: Doc, options: ParagraphOptions): HTMLElement {
  return el(doc, "p", { className: options.className, text: options.text });
}
