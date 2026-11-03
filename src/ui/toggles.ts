import { t } from "../i18n";
import { getSettings, saveSettings, type Settings } from "../storage";
import { h } from "./dom";

const TOGGLES = ["fingers", "noteNames", "letterNames", "staff"] as const;

export function createToggles(onChange: () => void, extra: (keyof Settings["toggles"])[] = []) {
  const { toggles } = getSettings();
  return h(
    "div",
    { className: "row toggles" },
    ...[...TOGGLES, ...extra].map((key) =>
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
