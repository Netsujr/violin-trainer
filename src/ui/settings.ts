import { t, type Language } from "../i18n";
import { getSettings, passCents, saveSettings } from "../storage";
import { h } from "./dom";
import { GEAR_ICON } from "./toggles";

const LANGUAGES: [Language, string][] = [
  ["en", "EN"],
  ["pt", "PT"],
];

type SliderKey = "greenCents" | "toleranceCents" | "holdMs" | "minRms";

// changeLanguage switches the app to another language.
export function createSettingsPanel(changeLanguage: (language: Language) => void) {
  const settings = getSettings();
  // The needle's zones, on the page for its CSS: green either side of the middle, and yellow out to what still counts.
  const showZones = () => {
    document.documentElement.style.setProperty("--green", `${settings.greenCents}%`);
    document.documentElement.style.setProperty("--tolerance", `${passCents()}%`);
  };

  // A slider for one setting, named label, with its value beside it.
  const range = (label: string, key: SliderKey, min: number, max: number, step: number, unit: string) => {
    const show = () => `${settings[key].toLocaleString(t.locale)} ${unit}`;
    const value = h("output", { textContent: show() });
    const input = h("input", {
      type: "range",
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(settings[key]),
      ariaLabel: label,
      oninput: () => {
        settings[key] = Number(input.value);
        value.textContent = show();
        saveSettings();
        showZones();
      },
    });
    return [input, value] as const;
  };
  const slider = (label: string, key: SliderKey, min: number, max: number, step: number, unit: string) =>
    h("label", { className: "setting" }, `${label} `, ...range(label, key, min, max, step, unit));

  // Each zone is a small box in its colour, named only in its tooltip, with its slider beside it. The yellow box
  // switches yellow on and off, its slider hidden while it's off, when only green counts.
  const yellowRange = range(t.yellowZone, "toleranceCents", 10, 50, 1, "cents");
  const yellowButton = h("button", {
    type: "button",
    className: "zone-cell",
    title: t.yellowZone,
    ariaLabel: t.yellowZone,
    onclick() {
      settings.yellowOn = !settings.yellowOn;
      saveSettings();
      showYellow();
    },
  }, h("span", { className: "zone yellow" }));
  const showYellow = () => {
    yellowButton.ariaPressed = String(settings.yellowOn);
    yellowRange.forEach((part) => (part.hidden = !settings.yellowOn));
    showZones();
  };
  showYellow();

  return h(
    "details",
    {},
    // A gear, named in its tooltip and for screen readers.
    h("summary", { className: "settings-gear", innerHTML: GEAR_ICON, title: t.settings, ariaLabel: t.settings }),
    h(
      "div",
      { className: "settings-panel" },
      h(
        "div",
        { className: "setting language-setting" },
        t.language,
        h(
          "div",
          { role: "group", className: "language", ariaLabel: t.language },
          ...LANGUAGES.map(([language, label]) => h("button", { textContent: label, ariaPressed: String(language === settings.language), onclick: () => changeLanguage(language) })),
        ),
      ),
      h("div", { className: "setting zone-setting" }, h("span", { className: "zone-cell", title: t.greenZone }, h("span", { className: "zone green" })), ...range(t.greenZone, "greenCents", 3, 25, 1, "cents")),
      h("div", { className: "setting zone-setting" }, yellowButton, ...yellowRange),
      slider(t.holdTime, "holdMs", 100, 500, 10, "ms"),
      slider(t.micSensitivity, "minRms", 0.002, 0.05, 0.001, "RMS"),
    ),
  );
}
