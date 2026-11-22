// The clear space ahead of the lanes' hit line, in their units: at least three beats show, which limits how large a
// narrow panel draws them.
const MIN_VIEW_WIDTH = 130 + 3 * 120;

// The width of the screen's content: the room beside the sidebar, inside its padding.
export const contentWidth = () => {
  const main = document.querySelector("main")!;
  const style = getComputedStyle(main);
  return main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
};

// How large to draw something unitsHigh tall in box, a panel's drawing area: as tall as the box allows, but never so
// large that fewer than three beats show across it. Before the box is laid out, at its own size.
export function scaleToFit(box: Pick<HTMLElement, "clientWidth" | "clientHeight">, unitsHigh: number) {
  const scale = Math.min(box.clientHeight / unitsHigh, box.clientWidth / MIN_VIEW_WIDTH);
  return scale > 0 ? scale : 1;
}
