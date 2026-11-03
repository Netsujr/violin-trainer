import { t } from "../i18n";
import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";

export function createSettingsPanel() {
  const settings = getSettings();
  const showTolerance = () => document.documentElement.style.setProperty("--tolerance", `${settings.toleranceCents}%`);
  showTolerance();

  const slider = (
    label: string,
    key: "toleranceCents" | "holdMs" | "minRms",
    min: number,
    max: number,
    step: number,
    unit: string,
  ) => {
    const show = () => `${settings[key].toLocaleString(t.locale)} ${unit}`;
    const value = h("output", { textContent: show() });
    const input = h("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(settings[key]),
      oninput: () => {
        settings[key] = Number(input.value);
        value.textContent = show();
        saveSettings();
        showTolerance();
      },
    });
    return h("label", { className: "setting" }, `${label} `, input, " ", value);
  };

  return h(
    "details",
    {},
    h("summary", {}, t.settings),
    h(
      "div",
      { className: "settings-panel" },
      slider(t.tolerance, "toleranceCents", 10, 50, 1, "cents"),
      slider(t.holdTime, "holdMs", 100, 500, 10, "ms"),
      slider(t.micSensitivity, "minRms", 0.002, 0.05, 0.001, "RMS"),
    ),
  );
}
