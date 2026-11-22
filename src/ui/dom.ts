// sidebar is the screen's own items, shown under its button in the sidebar, like Listen's modes. tempoChanged is told
// when the sidebar's metronome or BPM changes. ownsMetronome says the screen plays the clicks itself, in time with what
// it's doing; otherwise the sidebar's metronome plays them.
export type Screen = { element: HTMLElement; sidebar?: HTMLElement; leave(): void | Promise<void>; tempoChanged?(): void; ownsMetronome?(): boolean };

export function h<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  props: Partial<HTMLElementTagNameMap[Tag]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
}

// An SVG element, with its attributes and children, as h() makes HTML ones.
export function svg<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attributes: Record<string, string | number> = {}, ...children: Node[]) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}
