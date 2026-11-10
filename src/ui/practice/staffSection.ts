import { t } from "../../i18n";
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
  const staffWidth = () => (contentWidth() - STAFF_SIDE_PADDING) / staffScale();
  const staff = createStaff(staffWidth(), !settings.staffOpen, staffScale(), pickNote);
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
    },
  });
  const panel = h("div", { className: "staff-panel" }, staff.element, toggle);
  const toolbar = h(
    "div",
    { className: "section-bar" },
    createIconToggle("fingers", render),
    createIconToggle("noteNames", render),
    createIconToggle("letterNames", render),
    createIconToggle("grid", render),
  );

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
    timeline: h("div", { className: "timeline-section" }, toolbar, highway.element),
    sheet: h("div", { className: "staff-section" }, panel),
    leave: () => removeEventListener("resize", fit),
  };
}
