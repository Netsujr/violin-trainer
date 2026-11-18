import { centsText, localNumber, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { centsFrom, nearestMidi, pitchOf } from "../music/notes";
import { getSettings, saveSettings, type ListenMode } from "../storage";
import { h, type Screen } from "./dom";
import { createGuesser, toggleLabels } from "./guesser";
import { createFullscreen } from "./practice/fullscreen";
import { ICON_BUTTON } from "./practice/options";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createTechnique } from "./technique";
import { CHART_ICON, createIconToggle } from "./toggles";
import { createVolumeCurve } from "./volumeCurve";

const SILENCE_MS = 300;
const MODES: ListenMode[] = ["free", "guesser", "technique"];
// Each mode's time goes in the log under its own name, in English like the pieces', and translated where it's shown.
// ponytail: a run whose mode is switched partway is logged under the mode it started in; split it on a switch if that matters.
const LOGGED_AS = {
  free: { id: "free-play", title: "Free play", source: "listen", notes: [] },
  guesser: { id: "note-guesser", title: "Note guesser", source: "listen", notes: [] },
  technique: { id: "technique", title: "Technique", source: "listen", notes: [] },
};
// The modes with a score, shown on Listen's Progress.
export const SCORED_MODES = [LOGGED_AS.guesser, LOGGED_AS.technique];

export function createNeedle() {
  const mark = h("i");
  const value = h("span", { textContent: "—" });
  const track = h("div", { className: "needle" }, mark);
  const show = (cents: number | null) => {
    // Green and yellow both clear a note in Practice. Only the outer edge of yellow, Tolerance, decides that.
    const off = Math.abs(cents ?? Infinity);
    const { toleranceCents } = getSettings();
    track.dataset.zone = off <= toleranceCents / 2 ? "green" : off <= toleranceCents ? "yellow" : "out";
    mark.hidden = cents === null;
    mark.style.left = `${50 + Math.max(-50, Math.min(50, cents ?? 0))}%`;
    value.textContent = cents === null ? "—" : `${cents > 0 ? "+" : ""}${centsText(Math.round(cents))}`;
  };
  show(null);

  return { element: h("div", { className: "row" }, "♭", track, "♯", value), show };
}

// goProgress opens the note guesser's and Technique's scores over time.
export function listenScreen(goProgress: () => void): Screen {
  const settings = getSettings();
  const hertz = h("p");
  const needle = createNeedle();
  const volume = createVolumeCurve();
  const staff = createStaff();
  let midi: number | null = null;
  let lastHeard = 0;
  const guesser = createGuesser(staff, () => controls.session, () => controls.finish(() => true));
  const technique = createTechnique(staff, () => controls.session, () => controls.finish(() => true));
  const progressLabel = t.progressOf(t.screens.Listen);
  const progressButton = h("button", { type: "button", className: ICON_BUTTON, innerHTML: CHART_ICON, title: progressLabel, ariaLabel: progressLabel, onclick: goProgress });
  const modeNames = { free: t.freePlay, guesser: t.noteGuesser, technique: t.technique };
  const modeButtons = MODES.map((mode) => h("button", { type: "button", textContent: modeNames[mode], onclick: () => setMode(mode) }));

  // Each mode has its own row of choices under the buttons, hidden in the others. Technique also shows how loud the
  // playing is, under the needle.
  function setMode(mode: ListenMode) {
    settings.listenMode = mode;
    saveSettings();
    modeButtons.forEach((button, index) => (button.ariaPressed = String(MODES[index] === mode)));
    guesser.panel.hidden = mode !== "guesser";
    technique.panel.hidden = mode !== "technique";
    volume.element.hidden = mode !== "technique";
    progressButton.hidden = mode === "free";
    staff.hidePlayed();
    staff.clearTrace();
    // Ends a technique round, before the mode picked draws its own notes.
    technique.stop();
    if (mode === "guesser") guesser.start();
    if (mode === "technique") technique.start();
    renderNote();
  }

  // Free play draws the note heard on the staff, with its finger, name and letter as the toggles say. The other modes
  // draw their own notes.
  function renderNote() {
    if (settings.listenMode === "free") staff.draw(midi === null ? [] : [fillFingering({ pitch: pitchOf(midi) })], 0, toggleLabels());
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
      if (frequency !== null) hear(frequency, now);
      else if (midi !== null && now - lastHeard > SILENCE_MS) goQuiet();
      if (settings.listenMode === "guesser") guesser.read(frequency, now);
      if (settings.listenMode === "technique") {
        volume.add(rms, settings.minRms);
        technique.read(frequency, now, rms);
      }
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
      if (settings.listenMode === "technique") technique.stop();
      goQuiet();
    },
  });

  // Fullscreen hides the header and makes the staff as large as fits; CSS lays it out.
  const fullscreen = createFullscreen(() => {});

  setMode(settings.listenMode);
  goQuiet();

  return {
    element: h(
      "section",
      { className: "listen" },
      // The staff comes first, with how in tune under it.
      staff.element,
      needle.element,
      volume.element,
      hertz,
      h(
        "div",
        { className: "row" },
        h("div", { role: "group", className: "listen-modes" }, ...modeButtons),
        h("div", { className: "row toggles" }, ...(["fingers", "noteNames", "letterNames"] as const).map((key) => createIconToggle(key, relabel))),
        controls.recordToggle,
        controls.startButton,
        fullscreen.button,
        progressButton,
        controls.message,
      ),
      guesser.panel,
      technique.panel,
    ),
    leave() {
      fullscreen.leave();
      return controls.leave();
    },
  };
}
