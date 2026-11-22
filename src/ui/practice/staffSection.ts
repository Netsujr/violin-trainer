import { t } from "../../i18n";
import type { Meter } from "../../music/notes";
import { getSettings, saveSettings } from "../../storage";
import { h } from "../dom";
import { createHighway } from "../highway";
import { scaleToFit } from "../layout";
import { createStaff } from "../staff";

// The moving line's height, in the staff's units, which its panel's height sets the scale of.
const LINE_UNITS = 160;

// The lanes and the staff, each in its panel and drawn as large as the panel allows, the staff with its button to show
// one moving line or the whole sheet. pickNote is a click on a note. render draws the notes again after a change of
// size or display. onMove is the lanes moving, with the beat at the hit line.
export function createStaffSection(pickNote: (index: number, extend: boolean) => void, render: () => void, onMove: (beat: number) => void) {
  const settings = getSettings();
  let viewChanged = () => {};
  // The whole sheet is drawn at its usual size, as wide as the panel; the moving line as tall as the panel allows.
  const staffScale = () => (settings.staffOpen ? 1 : scaleToFit(staff.element, LINE_UNITS));
  const staffWidth = () => (staff.element.clientWidth || 600) / staffScale();
  // Scrolling the staff by hand moves the lanes, which bring the staff along, as when the lanes are scrolled.
  const staff = createStaff(600, !settings.staffOpen, 1, pickNote, (beat) => highway.moveToBeat(beat));
  const highway = createHighway(pickNote, (beat) => {
    staff.follow(beat);
    onMove(beat);
  });
  const toggle = h("button", {
    type: "button",
    className: "staff-toggle",
    textContent: "▾",
    onclick() {
      settings.staffOpen = !settings.staffOpen;
      saveSettings();
      staff.setCollapsed(!settings.staffOpen);
      labelToggle();
      refit();
      viewChanged();
    },
  });
  const staffPanel = h("div", { className: "stage-panel staff-panel" }, staff.element, toggle);
  const lanesPanel = h("div", { className: "stage-panel lanes-panel" }, highway.element);
  // The run's score, for the title row.
  const score = h("span", { className: "lane-score" });

  function labelToggle() {
    const label = settings.staffOpen ? t.collapseSheet : t.showFullSheet;
    toggle.ariaExpanded = String(settings.staffOpen);
    toggle.ariaLabel = label;
    toggle.title = label;
  }
  labelToggle();

  function refit() {
    staffPanel.style.setProperty("--timeline-scale", String(staffScale()));
    highway.resize();
    // In full screen, the whole sheet is drawn as large as fits.
    staff.setFill(document.documentElement.classList.contains("fullscreen"));
    staff.resize(staffWidth(), staffScale());
    render();
  }

  // Only a real change of size, not one a redraw makes, so this doesn't go round in circles.
  let fitted = "";
  const sizes = () => [lanesPanel, staffPanel].map((panel) => `${panel.clientWidth}x${panel.clientHeight}`).join();
  const observer = new ResizeObserver(() => {
    if (sizes() === fitted) return;
    fitted = sizes();
    refit();
  });
  observer.observe(lanesPanel);
  observer.observe(staffPanel);

  return {
    staff,
    highway,
    score,
    lanesPanel,
    staffPanel,
    // The piece's bars, for the staff and the lanes' bar lines.
    setMeter(meter: Meter) {
      staff.setMeter(meter);
      highway.setMeter(meter);
    },
    // Called when ▾ opens or closes the sheet.
    whenViewChanges(callback: () => void) {
      viewChanged = callback;
    },
    showScore(text: string) {
      score.textContent = text;
    },
    leave: () => observer.disconnect(),
  };
}
