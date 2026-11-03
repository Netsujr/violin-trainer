import { centsText, localNumber, t } from "../i18n";
import { fingerOn, LOWEST_MIDI, stringFor } from "../music/fingering";
import { centsFrom, nearestMidi, noteLabels, pitchOf } from "../music/notes";
import { getSettings } from "../storage";
import { h, type Screen } from "./dom";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createToggles } from "./toggles";

const SILENCE_MS = 300;
const TRAIL_STABLE_MS = 120;
const TRAIL_LENGTH = 8;
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

function positionGuess(midi: number) {
  if (midi < LOWEST_MIDI) return t.belowOpenG;

  const string = stringFor(midi);
  const finger = fingerOn(string, midi);
  return finger ? t.likely(t.strings[string], t.finger(finger)) : t.aboveFirstPosition;
}

export function listenScreen(): Screen {
  const { toggles } = getSettings();
  const big = h("div", { className: "big-note" });
  const position = h("p");
  const hertz = h("p");
  const trailView = h("p");
  const needle = createNeedle();
  const staff = createStaff();
  const trail: string[] = [];
  let midi: number | null = null;
  let lastHeard = 0;
  let stableSince = 0;

  function renderNote() {
    big.classList.toggle("idle", midi === null);
    staff.element.hidden = !toggles.staff;
    position.hidden = !toggles.fingers;
    if (midi === null) {
      big.textContent = controls.session ? t.listening : t.pressStart;
      position.textContent = "";
      staff.draw([]);
      return;
    }

    const pitch = pitchOf(midi);
    const { solfege, letter, octave } = noteLabels(pitch);
    const names = [toggles.noteNames && `${solfege}${octave}`, toggles.letterNames && `${letter}${octave}`];
    big.textContent = names.filter(Boolean).join(" / ");
    position.textContent = positionGuess(midi);
    staff.draw([{ pitch }]);
  }

  function hear(frequency: number, now: number) {
    const heardMidi = nearestMidi(frequency);
    lastHeard = now;
    if (heardMidi !== midi) {
      midi = heardMidi;
      stableSince = now;
      renderNote();
    }

    needle.show(centsFrom(frequency, heardMidi));
    hertz.textContent = `${localNumber(frequency, 1)} Hz`;

    const { solfege, letter, octave } = noteLabels(pitchOf(heardMidi));
    const label = `${solfege}${octave} (${letter})`;
    if (now - stableSince >= TRAIL_STABLE_MS && trail.at(-1) !== label) {
      trail.push(label);
      trail.splice(0, trail.length - TRAIL_LENGTH);
      trailView.textContent = trail.join(" → ");
    }
  }

  function goQuiet() {
    midi = null;
    needle.show(null);
    hertz.textContent = "";
    renderNote();
  }

  const controls = createRunControls({
    piece: () => FREE_PLAY,
    onReading(frequency, now) {
      if (frequency !== null) hear(frequency, now);
      else if (midi !== null && now - lastHeard > SILENCE_MS) goQuiet();
    },
    onStart: renderNote,
    onStop: goQuiet,
  });

  goQuiet();

  return {
    element: h(
      "section",
      { className: "listen" },
      createToggles(renderNote),
      h("div", { className: "row" }, controls.startButton, controls.recordLabel, controls.message),
      big,
      position,
      needle.element,
      hertz,
      staff.element,
      h("h3", {}, t.recentNotes),
      trailView,
    ),
    leave: controls.leave,
  };
}
