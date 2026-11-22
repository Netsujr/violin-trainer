import { loadRecordings, startReference } from "../../audio/reference";
import { t } from "../../i18n";
import { midiOf, type PieceNote } from "../../music/notes";
import { h } from "../dom";
import { SPEAKER_ICON } from "../toggles";

const REFERENCE_ECHO_MS = 150;

// Hear the note, a speaker and its words, sounding the current note until pressed again.
// The speakers mustn't score a hit, so what the mic hears doesn't count while it sounds or just after.
export function createReferenceTone(currentNote: () => PieceNote | undefined) {
  // The violin recordings start loading now, so the first press sounds at once.
  loadRecordings();
  let tone: ReturnType<typeof startReference> | null = null;
  let mutedUntil = 0;

  const button = h("button", {
    type: "button",
    className: "ghost-button reference",
    innerHTML: SPEAKER_ICON,
    ariaPressed: "false",
    onclick() {
      const note = currentNote();
      if (tone) stop();
      else if (note?.pitch) {
        tone = startReference(midiOf(note.pitch));
        button.ariaPressed = "true";
      }
    },
  });

  function stop() {
    if (!tone) return;

    tone.stop();
    tone = null;
    mutedUntil = performance.now() + REFERENCE_ECHO_MS;
    button.ariaPressed = "false";
  }
  button.append(t.hearTheNote);

  return {
    button,
    stop,
    setNote: (midi: number) => tone?.setNote(midi),
    isMuted: (now: number) => tone !== null || now < mutedUntil,
  };
}
