import { centsText } from "../i18n";
import { getSettings, passCents } from "../storage";
import { h } from "./dom";

// The needle, green as far off as is in tune and yellow out to what still counts, as Settings says, which draws the zones.
export function createNeedle() {
  const mark = h("i");
  const value = h("span", { textContent: "—" });
  const track = h("div", { className: "needle" }, mark);
  const show = (cents: number | null) => {
    const off = Math.abs(cents ?? Infinity);
    track.dataset.zone = off <= getSettings().greenCents ? "green" : off <= passCents() ? "yellow" : "out";
    mark.hidden = cents === null;
    mark.style.left = `${50 + Math.max(-50, Math.min(50, cents ?? 0))}%`;
    value.textContent = cents === null ? "—" : `${cents > 0 ? "+" : ""}${centsText(Math.round(cents))}`;
  };
  show(null);

  return { element: h("div", { className: "row" }, "♭", track, "♯", value), show };
}
