import { t } from "../i18n";
import { getSettings, passCents } from "../storage";
import { svg } from "./dom";

// The dial runs from 50 cents flat on the left to 50 cents sharp on the right, with in tune at the top.
const CENTRE = 160;
const RADIUS = 130;
const MAX_CENTS = 50;
const DEGREES_PER_CENT = 90 / MAX_CENTS;
const NEEDLE_LENGTH = 112;
const point = (cents: number) => {
  const angle = ((90 - cents * DEGREES_PER_CENT) * Math.PI) / 180;
  return `${(CENTRE + RADIUS * Math.cos(angle)).toFixed(1)} ${(CENTRE - RADIUS * Math.sin(angle)).toFixed(1)}`;
};
const arc = (cents: number) => `M${point(-cents)}A${RADIUS} ${RADIUS} 0 0 1 ${point(cents)}`;
const sign = (text: string, x: number) => svg("text", { class: "dial-sign", x, y: 186, "text-anchor": "middle" }, document.createTextNode(text));

// The tuning dial: blue as far off as is in tune and brass out to what still counts, as Settings sets them, with the
// needle pointing at how far off the note is. Its zone, for the needle's colour, is in data-zone.
export function createNeedle() {
  const yellow = svg("path", { class: "dial-yellow" });
  const green = svg("path", { class: "dial-green" });
  const needle = svg("path", { class: "dial-needle", d: `M${CENTRE} ${CENTRE}V${CENTRE - NEEDLE_LENGTH}` });
  const element = svg(
    "svg",
    { class: "needle", viewBox: "0 0 320 192", role: "img", "aria-label": t.tuning },
    svg("path", { class: "dial-track", d: arc(MAX_CENTS) }),
    yellow,
    green,
    needle,
    svg("circle", { class: "dial-hub", cx: CENTRE, cy: CENTRE, r: 8 }),
    sign("♭", 30),
    sign("♯", 290),
  );

  // Draws the zones from the settings, again after they change.
  function drawZones() {
    green.setAttribute("d", arc(getSettings().greenCents));
    yellow.setAttribute("d", arc(passCents()));
    yellow.style.visibility = getSettings().yellowOn ? "" : "hidden";
  }

  function show(cents: number | null) {
    const off = Math.abs(cents ?? Infinity);
    element.dataset.zone = off <= getSettings().greenCents ? "green" : off <= passCents() ? "yellow" : "out";
    needle.style.visibility = cents === null ? "hidden" : "";
    needle.style.transform = `rotate(${Math.max(-MAX_CENTS, Math.min(MAX_CENTS, cents ?? 0)) * DEGREES_PER_CENT}deg)`;
  }

  drawZones();
  show(null);
  return { element, show, drawZones };
}
