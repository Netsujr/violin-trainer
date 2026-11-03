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
    track.classList.toggle("in-tune", cents !== null && Math.abs(cents) <= getSettings().toleranceCents);
    mark.hidden = cents === null;
    mark.style.left = `${50 + Math.max(-50, Math.min(50, cents ?? 0))}%`;
    value.textContent = cents === null ? "—" : `${cents > 0 ? "+" : ""}${Math.round(cents)} cents`;
  };
  show(null);

  return { element: h("div", { className: "row" }, "♭", track, "♯", value), show };
}

function positionGuess(midi: number) {
  if (midi < LOWEST_MIDI) return "Below the open G string";

  const string = stringFor(midi);
  const finger = fingerOn(string, midi);
  return finger ? `Likely ${string} string, finger ${finger}` : "Above first position";
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
    staff.element.hidden = !toggles.staff;
    position.hidden = !toggles.fingers;
    if (midi === null) {
      big.textContent = controls.session ? "Listening…" : "Press Start and play";
      position.textContent = "";
      staff.draw([]);
      return;
    }

    const pitch = pitchOf(midi);
    const { solfege, letter, octave } = noteLabels(pitch);
    const names = [toggles.noteNames && `${solfege}${octave}`, toggles.letterNames && `${letter}${octave}`];
    big.textContent = names.filter(Boolean).join(" / ");
    position.textContent = positionGuess(midi);
    staff.draw([pitch]);
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
    hertz.textContent = `${frequency.toFixed(1)} Hz`;

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
      {},
      createToggles(renderNote),
      controls.element,
      big,
      position,
      needle.element,
      hertz,
      staff.element,
      h("h3", {}, "Recent notes"),
      trailView,
    ),
    leave: controls.leave,
  };
}
