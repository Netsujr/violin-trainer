import { localNumber, t } from "../i18n";
import { getSettings, saveSettings } from "../storage";
import { backupButtons } from "./backup";
import { h, type Screen } from "./dom";

type SliderKey = "greenCents" | "toleranceCents" | "holdMs" | "minRms";
// Past this, the storage used shows as a warning.
const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

// A setting's name with a line saying what it does, then its control.
export const setting = (name: string, caption: string, ...controls: Node[]) =>
  h("div", { className: "setting" }, h("div", {}, h("p", { className: "setting-name" }, name), ...(caption ? [h("p", { className: "setting-caption" }, caption)] : [])), ...controls);

// A slider for one setting, named label for screen readers, with its value beside it. onChange runs as it moves.
export function slider(label: string, settingKey: SliderKey, min: number, max: number, step: number, unit = "", onChange = () => {}) {
  const settings = getSettings();
  const show = () => `${settings[settingKey].toLocaleString(t.locale)}${unit && ` ${unit}`}`;
  const value = h("output", { textContent: show() });
  const input = h("input", {
    type: "range",
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(settings[settingKey]),
    ariaLabel: label,
    oninput: () => {
      settings[settingKey] = Number(input.value);
      value.textContent = show();
      saveSettings();
      onChange();
    },
  });
  return h("label", { className: "slide" }, input, value);
}

// Listening and your data, on a screen of their own. Tuning is set on the tuner itself.
export function settingsScreen(): Screen {
  const storage = h("p", { className: "storage-used" });
  void navigator.storage.estimate().then(({ usage = 0 }) => {
    storage.textContent = `${localNumber(usage / 1024 / 1024, 1)} MB`;
    storage.classList.toggle("warning", usage > STORAGE_WARNING_BYTES);
  });
  const sayProblem = (problem: string) => {
    storage.textContent = problem;
    storage.classList.add("warning");
  };

  const element = h(
    "section",
    { className: "settings" },
    h("h1", {}, t.screens.Settings),
    h(
      "section",
      { className: "settings-section" },
      h("h2", {}, t.listening),
      setting(t.holdTime, t.holdCaption, slider(t.holdTime, "holdMs", 100, 500, 10, "ms")),
      setting(t.micSensitivity, t.micCaption, slider(t.micSensitivity, "minRms", 0.002, 0.05, 0.001)),
    ),
    h(
      "section",
      { className: "settings-section" },
      h("h2", {}, t.yourData),
      setting(t.backUp, t.backUpWarning, h("div", { className: "row" }, ...backupButtons(sayProblem))),
      setting(t.storageUsed, "", storage),
    ),
  );
  return { element, leave() {} };
}
