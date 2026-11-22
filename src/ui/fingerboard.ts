import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI, OPEN_STRINGS, stringFor } from "../music/fingering";
import { frequencyOf, midiOf, nearestMidi, type PieceNote, type StringName } from "../music/notes";
import { getSettings, saveSettings } from "../storage";
import { h, svg } from "./dom";

const WIDTH = 1000;
const HEIGHT = 210;
const NUT_X = 64;
const END_X = 990;
// The board shows each string as far as first position reaches, a little past the third finger, spaced as on a violin.
const SHOWN_SEMITONES = 7.5;
// From the bottom of the board to the top, as a player looking down sees them: G nearest, E furthest.
const STRINGS: StringName[] = ["G", "D", "A", "E"];
// Where each string crosses the nut and the end of the board: they spread apart towards the bridge. The board is
// drawn wider than a real one, so the circles on it are easy to see.
const NUT_YS = [145, 115, 85, 55];
const END_YS = [162, 121, 79, 38];
const STRING_WIDTHS = [3, 2.5, 2, 1.5];
const LETTER_X = 34;
// Beginners' tapes: the first finger, the high second and the third, in semitones above the open string.
const TAPES = [2, 4, 5];
const TAPE_LABEL_Y = 202;
// An open string is played with no finger down, shown just past the nut.
const OPEN_X = 100;
const TARGET_COLOR = "#e6ae48";
const RIGHT_COLOR = "#6cc4ff";
const ON_TARGET_COLOR = "#1a1405";
const HEARD_COLOR = "#6cc4ff";
const BOARD_COLOR = "#07090d";
// The board's edges, from the nut to its end, where it's wider.
const BOARD_TOP = [40, 18];
const BOARD_BOTTOM = [160, 182];

// How far down a string a note is stopped, as a share of what the board shows: 0 at the nut. A semitone takes up
// less of the string the higher it goes, as on a real string.
export const boardShare = (semitones: number) => (1 - 2 ** (-semitones / 12)) / (1 - 2 ** (-SHOWN_SEMITONES / 12));

const xAt = (share: number) => NUT_X + (END_X - NUT_X) * share;
const along = ([nut, end]: number[], x: number) => nut + ((end - nut) * (x - NUT_X)) / (END_X - NUT_X);

// Where a note is stopped on a string, open just past the nut.
function pointOn(string: StringName, semitones: number) {
  const index = STRINGS.indexOf(string);
  const x = semitones <= 0 ? OPEN_X : xAt(boardShare(semitones));
  return { x, y: along([NUT_YS[index], END_YS[index]], x) };
}

// The dark board and the nut.
const drawBoard = () => [
  svg("path", { d: `M${NUT_X} ${BOARD_TOP[0]}L${END_X} ${BOARD_TOP[1]}V${BOARD_BOTTOM[1]}L${NUT_X} ${BOARD_BOTTOM[0]}Z`, fill: BOARD_COLOR }),
  svg("rect", { x: NUT_X - 6, y: BOARD_TOP[0] - 4, width: 8, height: BOARD_BOTTOM[0] - BOARD_TOP[0] + 8, rx: 2, fill: "#c9c2b0" }),
];

// The board's head, before the nut, with each string's letter: pressed, it puts beginners' tapes on the board or
// takes them off, brass while they're on.
function drawHead(on: boolean, onToggle: (on: boolean) => void) {
  const head = svg(
    "g",
    { class: "fingerboard-head", role: "button", tabindex: "0", "aria-label": t.tapes, "aria-pressed": String(on) },
    svg("rect", { x: LETTER_X - 24, y: BOARD_TOP[0] - 12, width: 48, height: BOARD_BOTTOM[0] - BOARD_TOP[0] + 24, rx: 14 }),
    ...STRINGS.map((string, index) =>
      svg("text", { class: "fingerboard-letter", x: LETTER_X, y: NUT_YS[index] + 6, "text-anchor": "middle" }, document.createTextNode(t.strings[string])),
    ),
  );
  const toggle = () => {
    const next = head.getAttribute("aria-pressed") !== "true";
    head.setAttribute("aria-pressed", String(next));
    onToggle(next);
  };
  head.addEventListener("click", toggle);
  head.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
  return head;
}

const drawStrings = () =>
  STRINGS.map((_, index) => svg("line", { x1: NUT_X, y1: NUT_YS[index], x2: END_X, y2: END_YS[index], stroke: "#c9d1dc", "stroke-width": STRING_WIDTHS[index] }));

// A tape across the board, as wide as the board is there, with its finger under it.
function drawTape(semitones: number, index: number) {
  const x = xAt(boardShare(semitones));
  return svg(
    "g",
    {},
    svg("line", { x1: x, y1: along(BOARD_TOP, x) + 2, x2: x, y2: along(BOARD_BOTTOM, x) - 2, stroke: "#3a4558", "stroke-width": 4 }),
    svg("text", { class: "fingerboard-tape-finger", x, y: TAPE_LABEL_Y, "text-anchor": "middle" }, document.createTextNode(String(index + 1))),
  );
}

// A violin's fingerboard in first position, drawn across the screen with the nut on the left and the E string at the
// top, to show where a note is played: a brass circle, with its finger in it, where it's stopped, turning blue once
// it's played in tune. What's heard shows as a blue ghost where it's played, on whichever string, joined to the circle
// by a dashed line, with a word saying which way to go. Pressing its head puts beginners' tapes on it. For
// use wherever a note to play is shown.
export function createFingerboard() {
  const settings = getSettings();
  const tapes = svg("g", { class: "fingerboard-tapes" }, ...TAPES.map(drawTape));
  const target = svg("circle", { class: "fingerboard-target", r: 15, "stroke-width": 2 });
  const finger = svg("text", { class: "fingerboard-finger", "text-anchor": "middle", "dominant-baseline": "central", fill: ON_TARGET_COLOR });
  const line = svg("line", { stroke: HEARD_COLOR, "stroke-width": 2.5, "stroke-dasharray": "6 5" });
  const nextRing = svg("circle", { class: "fingerboard-next", r: 15, fill: "none", stroke: TARGET_COLOR, "stroke-width": 2, "stroke-dasharray": "5 4" });
  const ghost = svg("circle", { class: "fingerboard-ghost", r: 12, fill: HEARD_COLOR, "fill-opacity": 0.4, stroke: HEARD_COLOR, "stroke-width": 2.5 });
  const head = drawHead(settings.fingerboardTapes, (on) => {
    settings.fingerboardTapes = on;
    saveSettings();
    showTapes();
  });
  // The drawing is one picture to screen readers, with the head a button beside it.
  const board = svg("g", { role: "img", "aria-label": t.fingerboard }, ...drawBoard(), tapes, ...drawStrings(), nextRing, line, target, finger, ghost);
  const picture = svg("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}` }, board, head);
  const hint = h("p", { className: "fingerboard-hint", hidden: true });
  const showTapes = () => (tapes.style.display = settings.fingerboardTapes ? "" : "none");
  const element = h("div", { className: "fingerboard" }, h("div", { className: "fingerboard-picture" }, picture, hint));
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
    target.setAttribute("fill", right ? RIGHT_COLOR : TARGET_COLOR);
    target.setAttribute("stroke", right ? RIGHT_COLOR : TARGET_COLOR);
  };
  const hideHeard = () => [ghost, line].forEach((part) => (part.style.display = "none"));

  return {
    element,
    // The note to play, with its string and finger, or none. right shows it as played right. upcoming, the note after
    // it, shows as a dashed ring where it's played.
    show(next: PieceNote | null, right = false, upcoming: PieceNote | null = null) {
      const after = upcoming?.pitch && upcoming.string ? pointOn(upcoming.string, midiOf(upcoming.pitch) - OPEN_STRINGS[upcoming.string]) : null;
      nextRing.style.display = after ? "" : "none";
      if (after) at(nextRing, after);
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
