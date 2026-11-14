import { centsText, localNumber, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { centsFrom, nearestMidi, pitchOf } from "../music/notes";
import { getSettings, saveSettings, type ListenMode } from "../storage";
import { h, type Screen } from "./dom";
import { createGuesser, toggleLabels } from "./guesser";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createTechnique } from "./technique";
import { createIconToggle } from "./toggles";
import { createVolumeCurve } from "./volumeCurve";

const SILENCE_MS = 300;
const FREE_PLAY = { id: "free-play", title: "Free play", source: "listen", notes: [] };
const MODES: ListenMode[] = ["free", "guesser", "technique"];

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

export function listenScreen(): Screen {
  const settings = getSettings();
  const hertz = h("p");
  const needle = createNeedle();
  const volume = createVolumeCurve();
  const staff = createStaff();
  let midi: number | null = null;
  let lastHeard = 0;
  const guesser = createGuesser(staff, () => controls.finish(() => true));
  const technique = createTechnique(staff, () => controls.finish(() => true));
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
    piece: () => FREE_PLAY,
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
        controls.message,
      ),
      guesser.panel,
      technique.panel,
    ),
    leave: controls.leave,
  };
}
