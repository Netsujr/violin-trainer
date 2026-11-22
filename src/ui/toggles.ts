import { t } from "../i18n";
import { getSettings, saveSettings, type Settings } from "../storage";
import { h } from "./dom";

const svgIcon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const EXPAND_ICON = svgIcon('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>');
export const COMPRESS_ICON = svgIcon('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>');
// A panel's size: arrows out to make it big, in to make it small.
export const GROW_ICON = svgIcon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>');
export const SHRINK_ICON = svgIcon('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>');
export const STAFF_ICON = svgIcon('<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><ellipse cx="10" cy="16" rx="2.5" ry="2"/><path d="M12.5 16V6"/>');
export const TRASH_ICON = svgIcon('<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6M10 11v6M14 11v6"/>');
export const PLAY_ICON = svgIcon('<path d="M7 4v16l13-8z"/>');
export const STOP_ICON = svgIcon('<rect x="6" y="6" width="12" height="12" rx="1"/>');
export const CHART_ICON = svgIcon('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>');
export const PAUSE_ICON = svgIcon('<path d="M8 5v14M16 5v14"/>');
export const DOWNLOAD_ICON = svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>');
export const RECORD_ICON = svgIcon('<circle cx="12" cy="12" r="6" fill="currentColor"/>');
export const LANES_ICON = svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>');
export const NOTE_ICON = svgIcon('<ellipse cx="8" cy="18" rx="3.5" ry="2.75" fill="currentColor"/><path d="M11.5 18V3c1.5 3 6 4 6 9"/>');
export const SHEET_ICON = svgIcon('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 7h10M7 10h10M7 15h10M7 18h10"/>');
export const MUSIC_ICON = svgIcon('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>');
export const UPLOAD_ICON = svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>');
export const ALIGN_ICON = svgIcon('<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/>');
export const REMOVE_TRACK_ICON = svgIcon('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>');
export const SPEAKER_ICON = svgIcon('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>');
export const GEAR_ICON = svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>');
export const METRONOME_ICON = svgIcon('<path d="M9 3h6l4 18H5z"/><path d="M5.5 18h13M12 18l5-11"/>');
// The sidebar's screens: a microphone for Listen, a book for Library and a calendar; Practice is MUSIC_ICON. A panel
// for the button that shrinks the sidebar to icons.
export const MIC_ICON = svgIcon('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>');
export const BOOK_ICON = svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>');
export const CALENDAR_ICON = svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>');
export const PANEL_ICON = svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>');
export const PENCIL_ICON = svgIcon('<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>');

// A switch with its word on it, pressed when on.
export function wordToggle(label: string, on: boolean, onToggle: (on: boolean) => void) {
  const button = h("button", {
    type: "button",
    textContent: label,
    ariaPressed: String(on),
    onclick() {
      const next = button.ariaPressed !== "true";
      button.ariaPressed = String(next);
      onToggle(next);
    },
  });
  return button;
}

// A choice as joined segments, with the one picked pressed. label names the group for screen readers.
export function chipGroup<T>(label: string, values: T[], name: (value: T) => string, current: () => T, pick: (value: T) => void) {
  const buttons = values.map((value) =>
    h("button", {
      type: "button",
      textContent: name(value),
      onclick() {
        pick(value);
        show();
      },
    }),
  );
  const show = () => buttons.forEach((button, at) => (button.ariaPressed = String(values[at] === current())));
  show();
  return h("div", { role: "group", className: "segments", ariaLabel: label }, ...buttons);
}

// One of the labels on the notes, their fingers, names and letters, switched on and off with its word.
export function createLabelToggle(key: keyof Settings["toggles"], onChange: () => void) {
  const { toggles } = getSettings();
  return wordToggle(t.toggles[key], toggles[key], (on) => {
    toggles[key] = on;
    saveSettings();
    onChange();
  });
}
