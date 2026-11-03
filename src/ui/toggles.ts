import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";

const TOGGLES = [
  ["fingers", "Fingers"],
  ["noteNames", "Note names (Do Ré Mi)"],
  ["letterNames", "Letter names (A G D)"],
  ["staff", "Staff"],
] as const;

export function createToggles(onChange: () => void) {
  const { toggles } = getSettings();
  return h(
    "div",
    { className: "row toggles" },
    ...TOGGLES.map(([key, label]) =>
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
        ` ${label}`,
      ),
    ),
  );
}
