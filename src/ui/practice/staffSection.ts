import { t } from "../../i18n";
import type { Meter } from "../../music/notes";
import { getSettings, saveSettings } from "../../storage";
import { h } from "../dom";
import { createHighway } from "../highway";
import { contentWidth, staffScale, timelineScale } from "../layout";
import { createStaff } from "../staff";
import { createIconToggle } from "../toggles";

const STAFF_SIDE_PADDING = 16;

// The lanes with their display toggles, and the staff under them with its open/close button, sized to the screen.
// pickNote is a click on a note. render draws the notes again after a change of size or display. onMove is the lanes
// moving, with the beat at the hit line.
export function createStaffSection(pickNote: (index: number, extend: boolean) => void, render: () => void, onMove: (beat: number) => void) {
  const settings = getSettings();
  let viewChanged = () => {};
  const staffWidth = () => (contentWidth() - STAFF_SIDE_PADDING) / staffScale();
  // Scrolling the staff by hand moves the lanes, which bring the staff along, as when the lanes are scrolled.
  const staff = createStaff(staffWidth(), !settings.staffOpen && !settings.staffOnly, staffScale(), pickNote, (beat) => highway.moveToBeat(beat));
  const highway = createHighway(pickNote, (beat) => {
    staff.follow(beat);
    onMove(beat);
  });
  const toggle = h("button", {
    className: "staff-toggle",
    textContent: "▾",
    onclick() {
      settings.staffOpen = !settings.staffOpen;
      saveSettings();
      staff.setCollapsed(!settings.staffOpen);
      labelToggle();
      render();
      viewChanged();
    },
  });
  const panel = h("div", { className: "staff-panel" }, staff.element, toggle);
  // The run's score, on the left of the bar above the lanes.
  const score = h("span", { className: "lane-score" });
  // The label switches, kept together so fullscreen can take them to its buttons.
  const labels = h(
    "div",
    { className: "row toggles label-toggles" },
    createIconToggle("fingers", render),
    createIconToggle("noteNames", render),
    createIconToggle("letterNames", render),
  );
  const toolbar = h("div", { className: "section-bar" }, score, labels);

  function labelToggle() {
    const label = settings.staffOpen ? t.collapseSheet : t.showFullSheet;
    toggle.ariaExpanded = String(settings.staffOpen);
    toggle.ariaLabel = label;
    toggle.title = label;
  }
  labelToggle();

  const showScale = () => panel.style.setProperty("--timeline-scale", String(staffScale()));
  showScale();

  // Only a real change of layout, not a phone's address bar sliding away.
  let fitted = `${contentWidth()}:${timelineScale()}:${staffScale()}`;
  function fit() {
    const size = `${contentWidth()}:${timelineScale()}:${staffScale()}`;
    if (size === fitted) return;

    fitted = size;
    showScale();
    highway.resize();
    staff.resize(staffWidth(), staffScale());
    render();
  }
  addEventListener("resize", fit);

  return {
    staff,
    highway,
    fit,
    // The piece's bars, for the staff and the lanes' bar lines.
    setMeter(meter: Meter) {
      staff.setMeter(meter);
      highway.setMeter(meter);
    },
    // Called when ▾ opens or closes the sheet.
    whenViewChanges(callback: () => void) {
      viewChanged = callback;
    },
    // Something for the start of the bar, before the score.
    addFirst(...nodes: Node[]) {
      toolbar.prepend(...nodes);
    },
    // Another switch on the bar, after the score.
    addToggle(node: Node) {
      toolbar.insertBefore(node, score.nextSibling);
    },
    labels,
    // The label switches back at the end of the bar, after fullscreen.
    returnLabels: () => toolbar.append(labels),
    showScore(text: string) {
      score.textContent = text;
    },
    timeline: h("div", { className: "timeline-section" }, toolbar, highway.element),
    sheet: h("div", { className: "staff-section" }, panel),
    leave: () => removeEventListener("resize", fit),
  };
}
