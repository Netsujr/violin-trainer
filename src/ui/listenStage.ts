import { getSettings } from "../storage";
import { h } from "./dom";
import { arrangePanels } from "./panels";
import { createTuner } from "./tuner";

// How much of the height the staff and the fingerboard each take when big.
const STAFF_WEIGHT = 2;
const BOARD_WEIGHT = 1.6;

// Listen's panels: the staff and the fingerboard, each big, small or off as the settings panel sets them, and the
// tuner in a column of its own on the right. staffParts go in the staff's panel, and tunerParts under the tuner.
export function createListenStage(staffParts: Node[], board: HTMLElement, tunerParts: Node[]) {
  const settings = getSettings();
  const staffPanel = h("div", { className: "stage-panel stage-staff" }, ...staffParts);
  const boardPanel = h("div", { className: "stage-panel stage-board" }, board);
  const panels = h("div", { className: "stage-panels" }, staffPanel, boardPanel);
  const tuner = createTuner(...tunerParts);

  function arrange() {
    const { staff, board: boardSize, tuner: tunerOn } = settings.listenPanels;
    arrangePanels(panels, [
      { element: staffPanel, size: staff, weight: STAFF_WEIGHT },
      { element: boardPanel, size: boardSize, weight: BOARD_WEIGHT },
    ]);
    tuner.element.hidden = !tunerOn;
  }

  arrange();
  return { element: h("div", { className: "stage" }, panels, tuner.element), arrange, hear: tuner.hear };
}
