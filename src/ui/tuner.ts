import { localNumber, t } from "../i18n";
import { centsFrom, nearestMidi, noteLabels, pitchOf } from "../music/notes";
import { getSettings, passCents } from "../storage";
import { h } from "./dom";
import { createNeedle } from "./needle";

// How in tune a note is, in a word or two: in tune, a little off while it still counts, or off.
function tuningWord(cents: number) {
  const off = Math.abs(cents);
  if (off <= getSettings().greenCents) return t.tuningWords.inTune;
  if (off <= passCents()) return cents > 0 ? t.tuningWords.littleSharp : t.tuningWords.littleFlat;
  return cents > 0 ? t.tuningWords.sharp : t.tuningWords.flat;
}

// The tuner, a panel of its own: the dial, the note heard large with its Do Ré Mi name, and its pitch in words. parts
// go under it.
export function createTuner(...parts: Node[]) {
  const dial = createNeedle();
  const letter = h("span", { className: "tuner-letter" });
  const solfege = h("span", { className: "tuner-solfege" });
  const caption = h("p", { className: "tuner-caption" });
  const element = h(
    "div",
    { className: "stage-panel stage-tuner" },
    h("p", { className: "dock-label" }, t.youArePlaying),
    dial.element,
    h("div", { className: "tuner-note" }, letter, solfege),
    caption,
    ...parts,
  );

  // The note heard, by its nearest note: its letter, with any sharp or flat small, and its name. The dial shows how far
  // off it is from targetMidi, the note to play, or else from that nearest note.
  function hear(frequency: number | null, targetMidi?: number) {
    if (frequency === null) {
      dial.show(null);
      letter.textContent = "—";
      solfege.textContent = caption.textContent = "";
      return;
    }
    const midi = nearestMidi(frequency);
    const cents = centsFrom(frequency, targetMidi ?? midi);
    const labels = noteLabels(pitchOf(midi));
    dial.show(cents);
    letter.replaceChildren(labels.letter[0], h("small", {}, labels.letter.slice(1)));
    solfege.textContent = labels.solfege;
    caption.textContent = t.tunerCaption(localNumber(frequency, 1), tuningWord(cents));
  }

  hear(null);
  return { element, hear };
}
