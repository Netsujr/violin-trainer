import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";

export function createSettingsPanel() {
  const settings = getSettings();

  const slider = (
    label: string,
    key: "toleranceCents" | "holdMs" | "minRms",
    min: number,
    max: number,
    step: number,
    unit: string,
  ) => {
    const value = h("output", { textContent: `${settings[key]} ${unit}` });
    const input = h("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(settings[key]),
      oninput: () => {
        settings[key] = Number(input.value);
        value.textContent = `${settings[key]} ${unit}`;
        saveSettings();
      },
    });
    return h("label", { className: "setting" }, `${label} `, input, " ", value);
  };

  return h(
    "details",
    {},
    h("summary", {}, "Settings"),
    h(
      "div",
      { className: "settings-panel" },
      slider("Tolerance", "toleranceCents", 10, 50, 1, "cents"),
      slider("Hold time", "holdMs", 100, 500, 10, "ms"),
      slider("Mic sensitivity (volume gate, raise it in a noisy room)", "minRms", 0.002, 0.05, 0.001, "RMS"),
    ),
  );
}
