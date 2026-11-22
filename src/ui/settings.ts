import { localNumber, t } from "../i18n";
import { getSettings, passCents, saveSettings } from "../storage";
import { backupButtons } from "./backup";
import { h, type Screen } from "./dom";
import { createNeedle } from "./needle";

type SliderKey = "greenCents" | "toleranceCents" | "holdMs" | "minRms";
// Past this, the storage used shows as a warning.
const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

// A setting's name with a line saying what it does, then its control.
const setting = (name: string, caption: string, ...controls: Node[]) =>
  h("div", { className: "setting" }, h("div", {}, h("p", { className: "setting-name" }, name), ...(caption ? [h("p", { className: "setting-caption" }, caption)] : [])), ...controls);

// Tuning, listening and your data, on a screen of their own. Tuning shows the dial as it will look, redrawn as the
// sliders move.
export function settingsScreen(): Screen {
  const settings = getSettings();
  const dial = createNeedle();
  const key = h("div", { className: "dial-key" });
  const showTuning = () => {
    dial.drawZones();
    key.replaceChildren(
      h("span", { className: "in-tune" }, t.inTuneWithin(settings.greenCents)),
      ...(settings.yellowOn ? [h("span", { className: "close-enough" }, t.closeEnoughWithin(passCents()))] : []),
    );
  };

  // A slider for one setting, named label for screen readers, with its value beside it.
  const slider = (label: string, settingKey: SliderKey, min: number, max: number, step: number, unit = "") => {
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
        showTuning();
      },
    });
    return h("label", { className: "slide" }, input, value);
  };

  // Close enough switches on and off, its slider hidden while it's off, when only in tune counts.
  const yellowSlider = slider(t.yellowZone, "toleranceCents", 10, 50, 1, "cents");
  const yellowButtons = [true, false].map((on) =>
    h("button", {
      type: "button",
      textContent: on ? t.on : t.off,
      onclick() {
        settings.yellowOn = on;
        saveSettings();
        showYellow();
      },
    }),
  );
  const showYellow = () => {
    yellowButtons.forEach((button, index) => (button.ariaPressed = String(settings.yellowOn === !index)));
    yellowSlider.hidden = !settings.yellowOn;
    showTuning();
  };
  showYellow();

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
      h("h2", {}, t.tuning),
      h("p", { className: "setting-caption" }, t.tuningCaption),
      h(
        "div",
        { className: "tuning" },
        h("div", {}, dial.element, key),
        h(
          "div",
          {},
          setting(t.greenZone, t.greenCaption, slider(t.greenZone, "greenCents", 3, 25, 1, "cents")),
          setting(t.yellowZone, t.yellowCaption, h("div", { role: "group", className: "segments", ariaLabel: t.yellowZone }, ...yellowButtons), yellowSlider),
        ),
      ),
    ),
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
