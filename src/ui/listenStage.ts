import { t } from "../i18n";
import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";
import { arrangePanels, sizeButton } from "./panels";
import { createTuner } from "./tuner";

// How much of the height the staff and the fingerboard each take when big.
const STAFF_WEIGHT = 2;
const BOARD_WEIGHT = 1.6;

// Listen's panels: the staff and the fingerboard, each shown or hidden by the settings panel and big or small by its
// own corner button, and the tuner in a column of its own on the right. staffParts go in the staff's panel, and
// tunerParts under the tuner.
export function createListenStage(staffParts: Node[], board: HTMLElement, tunerParts: Node[]) {
  const settings = getSettings();
  const sized = () => {
    saveSettings();
    arrange();
  };
  const staffSize = sizeButton("staff", t.staff, settings.listenPanels, sized);
  const boardSize = sizeButton("board", t.fingerboard, settings.listenPanels, sized);
  const staffPanel = h("div", { className: "stage-panel stage-staff" }, ...staffParts, staffSize);
  const boardPanel = h("div", { className: "stage-panel stage-board" }, board, boardSize);
  const panels = h("div", { className: "stage-panels" }, staffPanel, boardPanel);
  const tuner = createTuner(...tunerParts);

  function arrange() {
    const { staff, board: boardShown, tuner: tunerOn } = settings.listenPanels;
    arrangePanels(panels, [
      { element: staffPanel, size: staff, weight: STAFF_WEIGHT, sizeButton: staffSize },
      { element: boardPanel, size: boardShown, weight: BOARD_WEIGHT, sizeButton: boardSize },
    ]);
    tuner.element.hidden = !tunerOn;
  }

  arrange();
  return { element: h("div", { className: "stage" }, panels, tuner.element), arrange, hear: tuner.hear };
}
