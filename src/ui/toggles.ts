import { t } from "../i18n";
import { getSettings, saveSettings, type Settings } from "../storage";
import { h } from "./dom";

const TOGGLES = ["fingers", "noteNames", "letterNames", "staff"] as const;

export function createToggles(onChange: () => void) {
  const { toggles } = getSettings();
  return h(
    "div",
    { className: "row toggles" },
    ...TOGGLES.map((key) =>
      h(
        "label",
        {},
        h("input", {
          type: "checkbox",
          checked: toggles[key],
          onchange: (event) => {
            toggles[key] = (event.target as HTMLInputElement).checked;
            saveSettings();
            onChange();
          },
        }),
        ` ${t.toggles[key]}`,
      ),
    ),
  );
}

const svgIcon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const HAND_ICON = svgIcon(
  '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
);
export const EXPAND_ICON = svgIcon('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>');
export const COMPRESS_ICON = svgIcon('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>');
export const DONT_WAIT_ICON = svgIcon('<path d="m5 5 7 7-7 7M13 5l7 7-7 7"/>');
export const PLAY_ICON = svgIcon('<path d="M7 4v16l13-8z"/>');
export const CALENDAR_ICON = svgIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>');
const GRID_ICON = svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>');

function iconFor(key: keyof Settings["toggles"]) {
  const icon = h("span", { className: "icon" });
  if (key === "fingers" || key === "staffFingers") icon.innerHTML = HAND_ICON;
  else if (key === "grid") icon.innerHTML = GRID_ICON;
  else icon.textContent = key === "letterNames" ? "A" : t.solfege.C;
  return icon;
}

// A checkbox with an icon in place of its name, which stays available as its tooltip and to screen readers.
export function createIconToggle(key: keyof Settings["toggles"], onChange: () => void) {
  const { toggles } = getSettings();
  return h(
    "label",
    { title: t.toggles[key] },
    h("input", {
      type: "checkbox",
      checked: toggles[key],
      ariaLabel: t.toggles[key],
      onchange(event) {
        toggles[key] = (event.target as HTMLInputElement).checked;
        saveSettings();
        onChange();
      },
    }),
    iconFor(key),
  );
}
