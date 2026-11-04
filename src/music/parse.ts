import { t } from "../i18n";
import { fillFingering, LOWEST_MIDI } from "./fingering";
import { BEAT_LENGTHS, midiOf, type PieceNote, type StringName } from "./notes";

const TOKEN = /^(do|re|mi|fa|sol|la|si|[a-g])([#b]?)(\d)(?:\/(0|[lh]?[1-4]))?(?:@([gdae]))?(?::(\d*[.,]?\d+))?$/i;
const LETTERS: Record<string, string> = { do: "C", re: "D", mi: "E", fa: "F", sol: "G", la: "A", si: "B" };

const plainToken = (token: string) =>
  token.normalize("NFD").replace(/\p{M}/gu, "").replaceAll("♯", "#").replaceAll("♭", "b");

export function parseQuickText(text: string) {
  const notes: PieceNote[] = [];
  const errors: string[] = [];
  const flagged: string[] = [];

  for (const token of text.replaceAll("|", " ").split(/\s+/).filter(Boolean)) {
    const match = plainToken(token).match(TOKEN);
    if (!match) {
      errors.push(t.cantRead(token));
      continue;
    }

    const [, name, accidental, octave, finger, string, beatText] = match;
    const pitch = (LETTERS[name.toLowerCase()] ?? name.toUpperCase()) + accidental + octave;
    if (midiOf(pitch) < LOWEST_MIDI) {
      errors.push(t.tokenBelowOpenG(token));
      continue;
    }

    const beats = beatText ? Number(beatText.replace(",", ".")) : 1;
    if (!BEAT_LENGTHS.includes(beats)) {
      errors.push(t.badBeats(token));
      continue;
    }

    const note = fillFingering({
      pitch,
      beats,
      ...(string && { string: string.toUpperCase() as StringName }),
      ...(finger && { finger: finger.toUpperCase() }),
    });
    if (!note.finger) flagged.push(t.outsideFirstPosition(token, pitch));

    notes.push(note);
  }

  return { notes, errors, flagged };
}
