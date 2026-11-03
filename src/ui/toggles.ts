import { t } from "../i18n";
import { getSettings, saveSettings } from "../storage";
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
          role: "switch",
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
