import { centsText, localNumber, t } from "../i18n";
import { fillFingering } from "../music/fingering";
import { centsFrom, nearestMidi, pitchOf } from "../music/notes";
import { getSettings, saveSettings } from "../storage";
import { h, type Screen } from "./dom";
import { createGuesser, toggleLabels } from "./guesser";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createIconToggle } from "./toggles";

const SILENCE_MS = 300;
const FREE_PLAY = { id: "free-play", title: "Free play", source: "listen", notes: [] };

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
  const staff = createStaff();
  let midi: number | null = null;
  let lastHeard = 0;
  const guesser = createGuesser(staff, () => controls.finish(() => true));
  const modeButtons = [false, true].map((guessing) =>
    h("button", { type: "button", textContent: guessing ? t.noteGuesser : t.freePlay, onclick: () => setMode(guessing) }),
  );

  function setMode(guessing: boolean) {
    settings.guesserOn = guessing;
    saveSettings();
    modeButtons.forEach((button, index) => (button.ariaPressed = String(Boolean(index) === guessing)));
    guesser.panel.hidden = !guessing;
    staff.hidePlayed();
    if (guessing) guesser.start();
    renderNote();
  }

  // Free play draws the note heard on the staff, with its finger, name and letter as the toggles say. The guesser
  // draws its own notes.
  function renderNote() {
    if (!settings.guesserOn) staff.draw(midi === null ? [] : [fillFingering({ pitch: pitchOf(midi) })], 0, toggleLabels());
  }

  // A toggle changed: the notes drawn again with the labels now on.
  const relabel = () => (settings.guesserOn ? guesser.relabel() : renderNote());

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
    onReading(frequency, now) {
      if (frequency !== null) hear(frequency, now);
      else if (midi !== null && now - lastHeard > SILENCE_MS) goQuiet();
      if (settings.guesserOn) guesser.read(frequency, now);
    },
    onStart() {
      if (settings.guesserOn) guesser.start();
      renderNote();
    },
    onStop: goQuiet,
  });

  setMode(settings.guesserOn);
  goQuiet();

  return {
    element: h(
      "section",
      { className: "listen" },
      // The staff comes first, with how in tune under it.
      staff.element,
      needle.element,
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
    ),
    leave: controls.leave,
  };
}
