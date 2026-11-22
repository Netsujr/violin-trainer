import { t } from "../i18n";
import { getSettings, saveSettings, type ListenMode } from "../storage";
import { h } from "./dom";
import { dockOption, panelButton } from "./panels";
import { createLabelToggle, wordToggle } from "./toggles";

// Listen's settings panel, docked under the panels in one wrapping row: what's written on the notes, which panels are
// on screen and how big, then the mode's own settings, from modeOptions. labelsChanged redraws the notes, and
// panelsChanged lays the panels out again.
export function createListenDock(labelsChanged: () => void, panelsChanged: () => void, modeOptions: Record<ListenMode, HTMLElement[]>) {
  const settings = getSettings();
  const panels = settings.listenPanels;
  const changed = () => {
    saveSettings();
    panelsChanged();
  };
  const labels = h("div", { role: "group", className: "segments", ariaLabel: t.onTheNotes }, ...(["fingers", "noteNames", "letterNames"] as const).map((key) => createLabelToggle(key, labelsChanged)));
  const tuner = wordToggle(t.tuner, panels.tuner, (on) => {
    panels.tuner = on;
    changed();
  });
  const onScreen = h("div", { role: "group", className: "segments", ariaLabel: t.onScreen }, panelButton("staff", t.staff, panels, changed), panelButton("board", t.fingerboard, panels, changed), tuner);
  const modes = Object.entries(modeOptions).map(([mode, options]) => ({ mode, element: h("div", { className: "dock-mode" }, ...options) }));

  return {
    element: h("section", { className: "dock", ariaLabel: t.screens.Settings }, dockOption(t.onTheNotes, labels), dockOption(t.onScreen, onScreen), ...modes.map((options) => options.element)),
    // Shows only the mode's own settings.
    showMode: (mode: ListenMode) => modes.forEach((options) => (options.element.hidden = options.mode !== mode)),
  };
}
