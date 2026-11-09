import { localNumber } from "../../i18n";
import { h } from "../dom";
import { createNeedle } from "../listen";
import type { createStaff } from "../staff";

// The tuning needle and the frequency heard, with the played note drawn on the staff.
export function createTuning(staff: ReturnType<typeof createStaff>) {
  const needle = createNeedle();
  const hertz = h("span");

  function show(cents: number | null, frequency: number | null) {
    needle.show(cents);
    hertz.textContent = frequency === null ? "" : `${localNumber(frequency, 1)} Hz`;
  }

  return {
    element: h("div", { className: "row tuning" }, needle.element, hertz),
    show,
    clear() {
      show(null, null);
      staff.hidePlayed();
    },
  };
}
