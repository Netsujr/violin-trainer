import { t } from "../i18n";
import type { PanelSize } from "../storage";
import { h } from "./dom";

// Each row of small panels, under the big ones, as a share of the height like the big ones' weights.
const SMALL_ROW_WEIGHT = 1.3;
const SMALLS_PER_ROW = 2;

// A panel and how much of the height it takes when big, as against the others.
type Panel = { element: HTMLElement; size: PanelSize; weight: number };

// Steps a panel big, small, off, then big again. The last panel on skips off, so one always shows.
export const nextSize = (size: PanelSize, othersOn: boolean): PanelSize => (size === "off" ? "big" : size === "big" ? "small" : othersOn ? "off" : "big");

// Lays out panels in grid: the big ones a row each, the small ones two to a row under them. With no big one, the
// small ones stack instead of squeezing into thin columns.
export function arrangePanels(grid: HTMLElement, panels: Panel[]) {
  const bigs = panels.filter((panel) => panel.size === "big");
  const smalls = panels.filter((panel) => panel.size === "small");
  for (const panel of panels) {
    panel.element.hidden = panel.size === "off";
    panel.element.dataset.size = panel.size;
  }
  const smallRows = Array<number>(Math.ceil(smalls.length / SMALLS_PER_ROW)).fill(SMALL_ROW_WEIGHT);
  const rows = bigs.length ? [...bigs.map((panel) => panel.weight), ...smallRows] : smalls.map((panel) => panel.weight);
  grid.style.gridTemplateColumns = bigs.length ? `repeat(${Math.min(SMALLS_PER_ROW, Math.max(1, smalls.length))}, minmax(0, 1fr))` : "minmax(0, 1fr)";
  grid.style.gridTemplateRows = rows.map((weight) => `minmax(0, ${weight}fr)`).join(" ");
}

// A panel's button in the On screen group, named on it: solid when big, dim when small, plain when off, and saying its
// size to screen readers. Each press steps it, in panels, the screen's saved sizes (and its tuner's switch), and set
// keeps the change.
export function panelButton(key: string, name: string, panels: Record<string, PanelSize | boolean>, set: () => void) {
  const sizes = panels as Record<string, PanelSize>;
  const button = h("button", {
    type: "button",
    textContent: name,
    onclick() {
      const othersOn = Object.entries(panels).some(([other, size]) => other !== key && typeof size === "string" && size !== "off");
      sizes[key] = nextSize(sizes[key], othersOn);
      show();
      set();
    },
  });
  const show = () => {
    button.dataset.size = sizes[key];
    button.ariaLabel = t.panelSize(name, sizes[key]);
  };
  show();
  return button;
}

// One setting in a screen's settings panel: its name above its control, and a line under it when it needs one.
export const dockOption = (label: string, control: HTMLElement, caption?: HTMLElement) =>
  h("div", { className: "dock-option" }, h("p", { className: "dock-label" }, label), control, ...(caption ? [caption] : []));
