import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI, OPEN_STRINGS, stringFor } from "../music/fingering";
import { frequencyOf, midiOf, nearestMidi, type PieceNote, type StringName } from "../music/notes";
import { getSettings, saveSettings } from "../storage";
import { h, svg } from "./dom";

const WIDTH = 160;
const HEIGHT = 320;
const NUT_Y = 46;
const BOTTOM_Y = 312;
// The board shows each string as far as first position reaches, a little past the third finger, spaced as on a violin.
const SHOWN_SEMITONES = 7.5;
const STRINGS: StringName[] = ["G", "D", "A", "E"];
// Where each string crosses the nut and the bottom of the board: they spread apart towards the bridge. The board is
// drawn wider than a real one, so the circles on it are easy to see.
const NUT_XS = [50, 70, 90, 110];
const BOTTOM_XS = [30, 63.3, 96.7, 130];
const STRING_WIDTHS = [3, 2.5, 2, 1.5];
// Beginners' tapes: the first finger, the high second and the third, in semitones above the open string.
const TAPES = [2, 4, 5];
// An open string is played with no finger down, shown just above the nut.
const OPEN_Y = NUT_Y - 13;
const TARGET_COLOR = "#d62828";
const RIGHT_COLOR = "#14914a";
const HEARD_COLOR = "#1f6fd1";

// How far down a string a note is stopped, as a share of what the board shows: 0 at the nut. A semitone takes up
// less of the string the higher it goes, as on a real string.
export const boardShare = (semitones: number) => (1 - 2 ** (-semitones / 12)) / (1 - 2 ** (-SHOWN_SEMITONES / 12));

// Where a note is stopped on a string, open just above the nut.
function pointOn(string: StringName, semitones: number) {
  const index = STRINGS.indexOf(string);
  if (semitones <= 0) return { x: NUT_XS[index], y: OPEN_Y };
  const share = boardShare(semitones);
  return { x: NUT_XS[index] + (BOTTOM_XS[index] - NUT_XS[index]) * share, y: NUT_Y + (BOTTOM_Y - NUT_Y) * share };
}

// A small scroll and pegbox above the nut.
const drawHead = () =>
  svg(
    "g",
    { class: "fingerboard-head" },
    svg("path", { d: `M68 ${NUT_Y} L67 20 Q67 14 73 14 L87 14 Q93 14 93 20 L92 ${NUT_Y} Z`, fill: "#7a4424" }),
    svg("circle", { cx: 80, cy: 10, r: 9, fill: "#7a4424" }),
    svg("path", { d: "M80 10 m-5 0 a5 5 0 1 1 5 5 a3 3 0 1 1 -3 -3", fill: "none", stroke: "#4a2614", "stroke-width": 1.5 }),
    ...[22, 34].map((y) => svg("rect", { x: 55, y, width: 13, height: 4, rx: 2, fill: "#2b1d14" })),
    ...[28, 40].map((y) => svg("rect", { x: 92, y, width: 13, height: 4, rx: 2, fill: "#2b1d14" })),
  );

// The dark board below the nut, and the nut.
const drawBoard = () => [
  svg("path", { d: `M42 ${NUT_Y} L118 ${NUT_Y} L144 ${BOTTOM_Y + 8} L16 ${BOTTOM_Y + 8} Z`, fill: "#1d1a17" }),
  svg("rect", { x: 41, y: NUT_Y - 3, width: 78, height: 5, rx: 1, fill: "#efe6d2" }),
];

const drawStrings = () =>
  STRINGS.map((_, index) => svg("line", { x1: NUT_XS[index], y1: NUT_Y - 3, x2: BOTTOM_XS[index], y2: BOTTOM_Y + 8, stroke: "#d8d0bf", "stroke-width": STRING_WIDTHS[index] }));

// A tape across the board, as wide as the board is there.
function drawTape(semitones: number) {
  const share = boardShare(semitones);
  const y = NUT_Y + (BOTTOM_Y - NUT_Y) * share;
  return svg("rect", { x: 42 - 26 * share, y: y - 2.5, width: 76 + 52 * share, height: 5, fill: "#f6f1e3", opacity: 0.85 });
}

// A violin's fingerboard in first position, nut at the top, to show where a note is played: a red circle, with its
// finger in it, where it's stopped, filling green once it's played in tune. What's heard shows as a blue ghost where
// it's played, on whichever string, joined to the circle by a dashed line, with a word on top saying which way to go.
// Its head switches beginners' tapes on and off, and glows while they're on. For use wherever a note to play is shown.
export function createFingerboard() {
  const settings = getSettings();
  const head = drawHead();
  const tapes = svg("g", { class: "fingerboard-tapes" }, ...TAPES.map(drawTape));
  const target = svg("circle", { class: "fingerboard-target", r: 10, "stroke-width": 3 });
  const finger = svg("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": 12, "font-weight": 700, "font-family": "system-ui, sans-serif" });
  const line = svg("line", { stroke: HEARD_COLOR, "stroke-width": 2, "stroke-dasharray": "4 3" });
  const ghost = svg("circle", { class: "fingerboard-ghost", r: 8, fill: HEARD_COLOR, "fill-opacity": 0.45, stroke: HEARD_COLOR, "stroke-width": 2 });
  const picture = svg("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, "aria-hidden": "true" }, head, ...drawBoard(), tapes, ...drawStrings(), line, target, finger, ghost);
  const hint = h("p", { className: "fingerboard-hint", hidden: true });
  // A bare button over the head, so it's the head that's pressed.
  const headButton = h("button", {
    type: "button",
    className: "fingerboard-head-button",
    title: t.tapes,
    ariaLabel: t.tapes,
    onclick() {
      settings.fingerboardTapes = !settings.fingerboardTapes;
      saveSettings();
      showTapes();
    },
  });
  const showTapes = () => {
    tapes.style.display = settings.fingerboardTapes ? "" : "none";
    head.classList.toggle("lit", settings.fingerboardTapes);
    headButton.ariaPressed = String(settings.fingerboardTapes);
  };
  const element = h("div", { className: "fingerboard" }, h("div", { role: "img", ariaLabel: t.fingerboard }, picture, hint), headButton);
  let note: { string: StringName; semitones: number } | null = null;
  showTapes();

  const at = (element: SVGElement, point: { x: number; y: number }, x = "cx", y = "cy") => {
    element.setAttribute(x, String(point.x));
    element.setAttribute(y, String(point.y));
  };
  const showHint = (text: string | null) => {
    hint.hidden = text === null;
    hint.textContent = text ?? "";
  };
  const colour = (right: boolean) => {
    target.setAttribute("fill", right ? RIGHT_COLOR : "#fff");
    target.setAttribute("stroke", right ? RIGHT_COLOR : TARGET_COLOR);
    finger.setAttribute("fill", right ? "#fff" : TARGET_COLOR);
  };
  const hideHeard = () => [ghost, line].forEach((part) => (part.style.display = "none"));

  return {
    element,
    // The note to play, with its string and finger, or none. right shows it as played right.
    show(next: PieceNote | null, right = false) {
      note = next?.pitch && next.string ? { string: next.string, semitones: midiOf(next.pitch) - OPEN_STRINGS[next.string] } : null;
      [target, finger].forEach((part) => (part.style.display = note ? "" : "none"));
      hideHeard();
      showHint(null);
      if (!note) return;
      at(target, pointOn(note.string, note.semitones));
      at(finger, pointOn(note.string, note.semitones), "x", "y");
      finger.textContent = (next!.finger ?? "0").replace(/\D/g, "");
      colour(right);
      picture.parentElement!.ariaLabel = `${t.fingerboard}: ${t.onString(t.strings[note.string], t.finger(next!.finger ?? "0"))}`;
    },
    // What's heard, or nothing, against the note shown, in tune within toleranceCents. A note near the note's string
    // is shown on it, with which way to slide; one further off on the string it's played on, with which way to go.
    hear(frequency: number | null, toleranceCents: number) {
      if (!note) return;
      hideHeard();
      if (frequency === null) return showHint(null);
      const onTarget = 12 * Math.log2(frequency / frequencyOf(OPEN_STRINGS[note.string]));
      const off = (onTarget - note.semitones) * 100;
      const inTune = Math.abs(off) <= toleranceCents;
      colour(inTune);
      if (inTune) return showHint(t.rightThere);

      const midi = nearestMidi(frequency);
      const nearTarget = onTarget > -0.5 && onTarget < SHOWN_SEMITONES + 0.5;
      if (!nearTarget && (midi < LOWEST_MIDI || midi > HIGHEST_MIDI)) return showHint(t.otherString);
      const string = nearTarget ? note.string : stringFor(midi);
      const heard = pointOn(string, nearTarget ? Math.max(0, onTarget) : 12 * Math.log2(frequency / frequencyOf(OPEN_STRINGS[string])));
      at(ghost, heard);
      at(line, heard, "x1", "y1");
      at(line, pointOn(note.string, note.semitones), "x2", "y2");
      [ghost, line].forEach((part) => (part.style.display = ""));
      if (string === note.string) return showHint(off < 0 ? t.slideDown : t.slideUp);
      showHint(t.goToString(t.strings[note.string], STRINGS.indexOf(note.string) > STRINGS.indexOf(string)));
    },
  };
}
