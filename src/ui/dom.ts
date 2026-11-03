export type Screen = { element: HTMLElement; leave(): void | Promise<void> };

export function h<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  props: Partial<HTMLElementTagNameMap[Tag]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}
