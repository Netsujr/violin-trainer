import { startReference } from "../../audio/reference";
import { t } from "../../i18n";
import { midiOf, type PieceNote } from "../../music/notes";
import { h } from "../dom";
import { SPEAKER_ICON } from "../toggles";
import { ICON_BUTTON } from "./options";

const REFERENCE_ECHO_MS = 150;

// The Play reference button, a speaker, sounding the current note until pressed again. Its name is its tooltip.
// The speakers mustn't score a hit, so what the mic hears doesn't count while it sounds or just after.
export function createReferenceTone(currentNote: () => PieceNote | undefined) {
  let tone: ReturnType<typeof startReference> | null = null;
  let mutedUntil = 0;

  const button = h("button", {
    className: `${ICON_BUTTON} reference`,
    innerHTML: SPEAKER_ICON,
    title: t.playReference,
    ariaLabel: t.playReference,
    ariaPressed: "false",
    onclick() {
      const note = currentNote();
      if (tone) stop();
      else if (note) {
        tone = startReference(midiOf(note.pitch));
        button.title = button.ariaLabel = t.stopReference;
        button.ariaPressed = "true";
      }
    },
  });

  function stop() {
    if (!tone) return;

    tone.stop();
    tone = null;
    mutedUntil = performance.now() + REFERENCE_ECHO_MS;
    button.title = button.ariaLabel = t.playReference;
    button.ariaPressed = "false";
  }

  return {
    button,
    stop,
    setNote: (midi: number) => tone?.setNote(midi),
    isMuted: (now: number) => tone !== null || now < mutedUntil,
  };
}
