import { t } from "../i18n";
import { getSettings, saveSettings, type Settings } from "../storage";
import { h } from "./dom";

const svgIcon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const HAND_ICON = svgIcon(
  '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
);
export const EXPAND_ICON = svgIcon('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>');
export const COMPRESS_ICON = svgIcon('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>');
export const LOOP_ICON = svgIcon('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>');
export const STAFF_ICON = svgIcon('<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><ellipse cx="10" cy="16" rx="2.5" ry="2"/><path d="M12.5 16V6"/>');
export const DONT_WAIT_ICON = svgIcon('<path d="m5 5 7 7-7 7M13 5l7 7-7 7"/>');
export const TRASH_ICON = svgIcon('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6"/>');
export const PLAY_ICON = svgIcon('<path d="M7 4v16l13-8z"/>');
export const PAUSE_ICON = svgIcon('<path d="M8 5v14M16 5v14"/>');
export const DOWNLOAD_ICON = svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>');
export const EAR_ICON = svgIcon('<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>');
export const RECORD_ICON = svgIcon('<circle cx="12" cy="12" r="6" fill="currentColor"/>');
export const LANES_ICON = svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>');
export const NOTE_ICON = svgIcon('<ellipse cx="8" cy="18" rx="3.5" ry="2.75" fill="currentColor"/><path d="M11.5 18V3c1.5 3 6 4 6 9"/>');
export const SHEET_ICON = svgIcon('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 7h10M7 10h10M7 15h10M7 18h10"/>');
export const COPY_ICON = svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
export const PASTE_ICON = svgIcon('<path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>');
export const MUSIC_ICON = svgIcon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>');
export const UPLOAD_ICON = svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>');
export const ALIGN_ICON = svgIcon('<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>');
export const REMOVE_TRACK_ICON = svgIcon('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>');
export const SPEAKER_ICON = svgIcon('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>');
export const TEMPO_ICON = svgIcon('<path d="M3.5 17a9 9 0 1 1 17 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.5"/>');
export const METRONOME_ICON = svgIcon('<path d="M9 3h6l4 18H5z"/><path d="M5.5 18h13M12 18l5-11"/>');
export const COUNT_IN_ICON = svgIcon('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>');
export const PENCIL_ICON = svgIcon('<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>');

function iconFor(key: keyof Settings["toggles"]) {
  const icon = h("span", { className: "icon" });
  if (key === "fingers") icon.innerHTML = HAND_ICON;
  else icon.textContent = key === "letterNames" ? "A" : t.solfege.C;
  return icon;
}

// An icon in a box that lights up when on, which is the whole switch. Its name is its tooltip, and what screen readers say.
export function boxToggle(icon: Node, label: string, on: boolean, onToggle: (on: boolean) => void) {
  const button = h("button", {
    type: "button",
    className: "box-toggle",
    title: label,
    ariaLabel: label,
    ariaPressed: String(on),
    onclick() {
      const next = button.ariaPressed !== "true";
      button.ariaPressed = String(next);
      onToggle(next);
    },
  }, icon);
  return button;
}

export function createIconToggle(key: keyof Settings["toggles"], onChange: () => void) {
  const { toggles } = getSettings();
  return boxToggle(iconFor(key), t.toggles[key], toggles[key], (on) => {
    toggles[key] = on;
    saveSettings();
    onChange();
  });
}
