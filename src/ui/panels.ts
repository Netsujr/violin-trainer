import { t } from "../i18n";
import type { PanelSize } from "../storage";
import { h } from "./dom";
import { GROW_ICON, SHRINK_ICON } from "./toggles";

// A small panel takes this share of the height it takes when big, so stepping it down plainly gives the others room.
const SMALL_SHARE = 0.5;

// A panel and how much of the height it takes when big, as against the others, with its corner button for its size.
type Panel = { element: HTMLElement; size: PanelSize; weight: number; sizeButton?: HTMLButtonElement };

// Lays out panels in grid in their own order, whatever their size, so none moves when another changes: each big one a
// row of its own, and two small ones side by side sharing a row. With no big one, the small ones stack instead of
// squeezing into thin columns. Each corner button shows which way it would go, and goes when its panel is alone.
export function arrangePanels(grid: HTMLElement, panels: Panel[]) {
  const shown = panels.filter((panel) => panel.size !== "off");
  for (const panel of panels) {
    panel.element.hidden = panel.size === "off";
    if (!panel.sizeButton) continue;
    // A panel alone fills the room whatever its size, so its button has nothing to do.
    panel.sizeButton.hidden = shown.length < 2;
    panel.sizeButton.ariaPressed = String(panel.size === "big");
    panel.sizeButton.innerHTML = panel.size === "big" ? SHRINK_ICON : GROW_ICON;
  }
  const anyBig = shown.some((panel) => panel.size === "big");
  const rows: number[] = [];
  let paired = false;
  for (let index = 0; index < shown.length; index++) {
    const [panel, next] = [shown[index], shown[index + 1]];
    if (anyBig && panel.size === "small" && next?.size === "small") {
      rows.push(Math.max(panel.weight, next.weight) * SMALL_SHARE);
      panel.element.style.gridColumn = next.element.style.gridColumn = "";
      paired = true;
      index++;
    } else {
      rows.push(anyBig && panel.size === "small" ? panel.weight * SMALL_SHARE : panel.weight);
      panel.element.style.gridColumn = "1 / -1";
    }
  }
  grid.style.gridTemplateColumns = paired ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)";
  grid.style.gridTemplateRows = rows.map((weight) => `minmax(0, ${weight}fr)`).join(" ");
}

// A panel's button in the On screen group, named on it, showing or hiding it. A panel shown again comes back big. The
// last panel on stays on, so one always shows. set keeps the change.
export function panelButton(key: string, name: string, panels: Record<string, PanelSize | boolean>, set: () => void) {
  const sizes = panels as Record<string, PanelSize>;
  const button = h("button", {
    type: "button",
    textContent: name,
    onclick() {
      const othersOn = Object.entries(panels).some(([other, size]) => other !== key && typeof size === "string" && size !== "off");
      if (sizes[key] !== "off" && !othersOn) return;
      sizes[key] = sizes[key] === "off" ? "big" : "off";
      button.ariaPressed = String(sizes[key] !== "off");
      set();
    },
  });
  button.ariaPressed = String(sizes[key] !== "off");
  return button;
}

// A panel's own button, in its top right corner: makes it small, or big again. Its icon and pressed state follow
// the panel's size as arrangePanels lays it out. set keeps the change.
export function sizeButton(key: string, name: string, panels: Record<string, PanelSize | boolean>, set: () => void) {
  const sizes = panels as Record<string, PanelSize>;
  return h("button", {
    type: "button",
    className: "panel-size",
    ariaLabel: t.panelBig(name),
    onclick() {
      sizes[key] = sizes[key] === "big" ? "small" : "big";
      set();
    },
  });
}

// One setting in a screen's settings panel: its name above its control, and a line under it when it needs one.
export const dockOption = (label: string, control: HTMLElement, caption?: HTMLElement) =>
  h("div", { className: "dock-option" }, h("p", { className: "dock-label" }, label), control, ...(caption ? [caption] : []));
