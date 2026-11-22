import { t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { centsFrom, nearestMidi, pitchOf } from "../music/notes";
import { getSettings, passCents, saveSettings, type ListenMode } from "../storage";
import { h, type Screen } from "./dom";
import { createGuesser, toggleLabels } from "./guesser";
import { createFingerboard } from "./fingerboard";
import { createFreeTarget } from "./freeTarget";
import { createListenDock } from "./listenDock";
import { createListenStage } from "./listenStage";
import { dockOption } from "./panels";
import { createFullscreen } from "./practice/fullscreen";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createTechnique } from "./technique";
import { CHART_ICON } from "./toggles";
import { createVolumeCurve } from "./volumeCurve";

const SILENCE_MS = 300;
const MODES: ListenMode[] = ["free", "guesser", "technique"];
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
  const volume = createVolumeCurve();
  const staff = createStaff();
  let midi: number | null = null;
  let lastHeard = 0;
  const board = createFingerboard();
  const guesser = createGuesser(staff, () => controls.session, board);
  const technique = createTechnique(staff, () => controls.session, () => controls.finish(() => true));
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
  const progressButton = h("button", { type: "button", className: "ghost-button listen-progress", innerHTML: CHART_ICON, onclick: goProgress }, t.progress);
  const modeNames = { free: t.freePlay, guesser: t.noteGuesser, technique: t.technique };
  // The modes, in the sidebar under Listen, each with a line saying what it does.
  const modeButtons = MODES.map((mode) =>
    h("button", { type: "button", className: "sub-item", onclick: () => setMode(mode) }, h("span", { className: "sub-name" }, modeNames[mode]), h("span", { className: "sub-hint" }, t.modeHints[mode])),
  );
  const title = h("h1");
  // What a tap on the staff does, under it: in free play it picks a note to copy, and by ear it sounds the note again.
  // The CSS shows the one that applies.
  const staffHint = h("p", { className: "stage-hint" }, h("span", { className: "hint-free" }, t.pickNoteHint), h("span", { className: "hint-ear" }, t.hearAgain));

  // Each mode has its own settings in the settings panel, and its own parts on the stage, which the CSS shows from
  // data-mode: Technique also shows how loud the playing is, under the tuner.
  function setMode(mode: ListenMode) {
    element.dataset.mode = mode;
    settings.listenMode = mode;
    saveSettings();
    modeButtons.forEach((button, index) => (button.ariaPressed = String(MODES[index] === mode)));
    title.textContent = modeNames[mode];
    dock.showMode(mode);
    const width = mode === "technique" ? WIDE_SHEET_WIDTH : SHEET_WIDTH;
    staff.resize(width, 1);
    staff.hidePlayed();
    staff.clearTrace();
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

    stage.hear(frequency);
    // Against the note picked, what's played shows as a ghost, with its arrow.
    if (settings.listenMode === "free" && target.midi !== null) {
      const cents = centsFrom(frequency, target.midi);
      staff.showPlayed(0, cents, Math.abs(cents) <= passCents());
    }
  }

  function goQuiet() {
    midi = null;
    stage.hear(null);
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

  // Fullscreen leaves the panels with Start or Stop and Exit, and the guesser's score; CSS lays it out.
  const fullscreen = createFullscreen(() => {});
  controls.startButton.classList.add("listen-start");

  const dock = createListenDock(relabel, () => stage.arrange(), {
    free: [dockOption(t.sound, target.speaker)],
    guesser: guesser.options,
    technique: technique.options,
  });
  const stage = createListenStage([staff.element, staffHint, guesser.banner, technique.status, technique.results, technique.overlay], board.element, [volume.element]);
  const element = h(
    "section",
    { className: "listen fills-window" },
    h("div", { className: "title-row" }, title, guesser.score, h("div", { className: "title-tools" }, progressButton, fullscreen.button, controls.startButton)),
    controls.message,
    stage.element,
    dock.element,
  );

  setMode(settings.listenMode);
  goQuiet();

  return {
    element,
    sidebar: h("div", { role: "group", ariaLabel: t.screens.Listen }, ...modeButtons),
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
