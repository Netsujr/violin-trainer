import { localNumber, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { centsFrom, nearestMidi, pitchOf } from "../music/notes";
import { getSettings, passCents, saveSettings, type ListenMode, type ListenView } from "../storage";
import { h, type Screen } from "./dom";
import { createGuesser, toggleLabels } from "./guesser";
import { createNeedle } from "./needle";
import { createFingerboard } from "./fingerboard";
import { createFreeTarget } from "./freeTarget";
import { createFullscreen } from "./practice/fullscreen";
import { ICON_BUTTON } from "./practice/options";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createTechnique } from "./technique";
import { BOWING_ICON, CHART_ICON, createIconToggle, FINGERBOARD_ICON, GUESS_ICON, MUSIC_ICON, STAFF_AND_BOARD_ICON, STAFF_ICON } from "./toggles";
import { createVolumeCurve } from "./volumeCurve";

const SILENCE_MS = 300;
const MODES: ListenMode[] = ["free", "guesser", "technique"];
const MODE_ICONS = { free: MUSIC_ICON, guesser: GUESS_ICON, technique: BOWING_ICON };
const VIEWS: ListenView[] = ["staff", "both", "board"];
const VIEW_ICONS = { staff: STAFF_ICON, both: STAFF_AND_BOARD_ICON, board: FINGERBOARD_ICON };
// The staff's width, in its own units: Technique's rounds have up to eight notes, each with its name under it.
const SHEET_WIDTH = 300;
const WIDE_SHEET_WIDTH = 480;
// Each mode's time goes in the log under its own name, in English like the pieces', and translated where it's shown.
// ponytail: a run whose mode is switched partway is logged under the mode it started in; split it on a switch if that matters.
const LOGGED_AS = {
  free: { id: "free-play", title: "Free play", source: "listen", notes: [] },
  guesser: { id: "note-guesser", title: "Note guesser", source: "listen", notes: [] },
  technique: { id: "technique", title: "Technique", source: "listen", notes: [] },
};
// The modes with a score, shown on Listen's Progress.
export const SCORED_MODES = [LOGGED_AS.guesser, LOGGED_AS.technique];

// goProgress opens the note guesser's and Technique's scores over time.
export function listenScreen(goProgress: () => void): Screen {
  const settings = getSettings();
  const hertz = h("p");
  const volume = createVolumeCurve();
  const staff = createStaff();
  let midi: number | null = null;
  let lastHeard = 0;
  const board = createFingerboard();
  const guesser = createGuesser(staff, () => controls.session, board);
  const technique = createTechnique(staff, () => controls.session, () => controls.finish(() => true));
  const needle = createNeedle();
  const target = createFreeTarget(staff, () => {
    renderNote();
    showBoard(null);
  });
  // In free play, a tap on the staff picks a note to copy, or clears it, and a pointer over it shows, faintly, the note
  // a tap would pick. By ear in the note guesser, a tap sounds the note again.
  let hover: number | null = null;
  staff.element.addEventListener("click", (event) => {
    if (settings.listenMode === "free") target.tap(event.clientY);
    if (settings.listenMode === "guesser") guesser.replay();
  });
  staff.element.addEventListener("pointermove", (event) => {
    const next = settings.listenMode === "free" && event.pointerType === "mouse" ? target.at(event.clientY) : null;
    if (next === hover) return;
    hover = next;
    renderNote();
  });
  staff.element.addEventListener("pointerleave", () => {
    hover = null;
    renderNote();
  });
  const progressLabel = t.progressOf(t.screens.Listen);
  const progressButton = h("button", { type: "button", className: `${ICON_BUTTON} listen-progress`, innerHTML: CHART_ICON, title: progressLabel, ariaLabel: progressLabel, onclick: goProgress });
  const modeNames = { free: t.freePlay, guesser: t.noteGuesser, technique: t.technique };
  // The modes as icons, with the one picked named under the needle.
  const modeButtons = MODES.map((mode) => h("button", { type: "button", innerHTML: MODE_ICONS[mode], title: modeNames[mode], ariaLabel: modeNames[mode], onclick: () => setMode(mode) }));
  const modeTitle = h("p", { className: "listen-mode-title" });

  // Each mode has its own row of choices under the buttons, hidden in the others. Technique also shows how loud the
  // playing is, under the needle. The CSS shows each mode's parts from data-mode, keeping their room in the others.
  function setMode(mode: ListenMode) {
    element.dataset.mode = mode;
    settings.listenMode = mode;
    saveSettings();
    modeButtons.forEach((button, index) => (button.ariaPressed = String(MODES[index] === mode)));
    modeTitle.textContent = modeNames[mode];
    const width = mode === "technique" ? WIDE_SHEET_WIDTH : SHEET_WIDTH;
    staff.resize(width, 1);
    staff.element.style.setProperty("--sheet", String(width));
    staff.hidePlayed();
    staff.clearTrace();
    staff.element.title = mode === "free" ? t.pickNoteHint : "";
    staff.element.classList.remove("preview");
    staff.centre(mode === "free");
    target.clear();
    guesser.hush();
    // Ends a technique round, before the mode picked draws its own notes.
    technique.stop();
    if (mode === "guesser") guesser.start();
    if (mode === "technique") technique.start();
    renderNote();
    showBoard(null);
  }

  // One button for what the stage shows, stepping through the staff, the staff and fingerboard, and the fingerboard,
  // which the CSS reads.
  const viewButton = h("button", {
    type: "button",
    className: `${ICON_BUTTON} listen-view`,
    onclick() {
      settings.listenView = VIEWS[(VIEWS.indexOf(settings.listenView) + 1) % VIEWS.length];
      saveSettings();
      showView();
    },
  });
  function showView() {
    element.dataset.view = settings.listenView;
    viewButton.innerHTML = VIEW_ICONS[settings.listenView];
    viewButton.title = viewButton.ariaLabel = t.listenViews[settings.listenView];
  }

  // The fingerboard: in free play the note picked, with what's heard against it, or else the note heard, where it's
  // played; in Technique the note to play now, with what's heard. The guesser shows its own.
  function showBoard(frequency: number | null) {
    if (settings.listenMode === "guesser") return;
    if (settings.listenMode === "technique") {
      board.show(technique.note);
      return board.hear(frequency, passCents());
    }
    const shown = target.midi ?? midi;
    board.show(shown === null ? null : fillFingering({ pitch: pitchOf(shown) }), target.midi === null && shown !== null);
    if (target.midi !== null) board.hear(frequency, passCents());
  }

  // Free play draws the note picked to copy, or else the note heard, or else, faintly, the one the pointer's over, with
  // its finger, name and letter as the toggles say. The other modes draw their own notes.
  function renderNote() {
    if (settings.listenMode !== "free") return;
    const shown = target.midi ?? midi ?? hover;
    staff.element.classList.toggle("preview", target.midi === null && midi === null && hover !== null);
    staff.draw(shown === null ? [] : [fillFingering({ pitch: pitchOf(shown) })], 0, toggleLabels());
  }

  // A toggle changed: the notes drawn again with the labels now on.
  function relabel() {
    if (settings.listenMode === "guesser") guesser.relabel();
    else if (settings.listenMode === "technique") technique.relabel();
    else renderNote();
  }

  function hear(frequency: number, now: number) {
    const heardMidi = nearestMidi(frequency);
    lastHeard = now;
    if (heardMidi !== midi) {
      midi = heardMidi;
      renderNote();
    }

    needle.show(centsFrom(frequency, heardMidi));
    hertz.textContent = `${localNumber(frequency, 1)} Hz`;
    // Against the note picked, what's played shows as a ghost, with its arrow.
    if (settings.listenMode === "free" && target.midi !== null) {
      const cents = centsFrom(frequency, target.midi);
      staff.showPlayed(0, cents, Math.abs(cents) <= passCents());
    }
  }

  function goQuiet() {
    midi = null;
    needle.show(null);
    hertz.textContent = "";
    guesser.quiet();
    renderNote();
  }

  const controls = createRunControls({
    piece: () => LOGGED_AS[settings.listenMode],
    onReading(frequency, now, rms) {
      // A note sounding, free play's picked one or the guesser's by ear, isn't the player.
      const hearing = settings.listenMode === "free" ? target.hearing(now) : settings.listenMode === "guesser" ? guesser.hearing(now) : true;
      if (!hearing) frequency = null;
      if (frequency !== null) hear(frequency, now);
      else if (midi !== null && now - lastHeard > SILENCE_MS) goQuiet();
      if (settings.listenMode === "guesser") guesser.read(frequency, now);
      if (settings.listenMode === "technique") {
        volume.add(rms, settings.minRms);
        technique.read(frequency, now, rms);
      }
      showBoard(frequency);
    },
    onStart() {
      if (settings.listenMode === "guesser") guesser.start();
      if (settings.listenMode === "technique") {
        volume.clear();
        technique.start();
      }
      renderNote();
    },
    onStop() {
      guesser.hush();
      if (settings.listenMode === "technique") technique.stop();
      goQuiet();
    },
  });

  // Fullscreen hides the header and makes the staff as large as fits; CSS lays it out.
  const fullscreen = createFullscreen(() => {});
  controls.startButton.classList.add("listen-start");

  const element = h(
    "section",
    { className: "listen" },
    // The staff comes first, with the fingerboard beside it, and how in tune under them. The labels' toggles
    // sit small in its top left corner, and Technique's pause switch, or free play's speaker, in its top right.
    h(
      "div",
      { className: "listen-stage" },
      h(
        "div",
        { className: "stage-sheet" },
        staff.element,
        h("div", { className: "row toggles stage-labels" }, ...(["fingers", "noteNames", "letterNames"] as const).map((key) => createIconToggle(key, relabel))),
        h("div", { className: "stage-pause" }, technique.pause),
        h("div", { className: "stage-speaker" }, target.speaker),
      ),
      board.element,
      guesser.banner,
    ),
    needle.element,
    modeTitle,
    volume.element,
    hertz,
    h(
      "div",
      { className: "row" },
      h("div", { role: "group", className: "listen-modes" }, ...modeButtons),
      controls.startButton,
      viewButton,
      fullscreen.button,
      progressButton,
      controls.message,
    ),
    // In one place, as tall as the tallest, so nothing moves as modes change.
    h("div", { className: "listen-panels" }, guesser.panel, technique.panel),
  );

  setMode(settings.listenMode);
  showView();
  goQuiet();

  return {
    element,
    // A Technique round plays its own clicks, on its beats.
    ownsMetronome: () => settings.listenMode === "technique" && controls.session !== null,
    // A Technique round is timed to the BPM, so it starts again.
    tempoChanged() {
      if (settings.listenMode === "technique") technique.start();
    },
    leave() {
      target.clear();
      guesser.hush();
      fullscreen.leave();
      return controls.leave();
    },
  };
}
