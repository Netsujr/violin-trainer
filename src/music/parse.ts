import { fillFingering, LOWEST_MIDI } from "./fingering";
import { midiOf, type PieceNote, type StringName } from "./notes";

const TOKEN = /^(do|re|mi|fa|sol|la|si|[a-g])([#b]?)(\d)(?:\/(0|[lh]?[1-4]))?(?:@([gdae]))?$/i;
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
      errors.push(`Can't read "${token}"`);
      continue;
    }

    const [, name, accidental, octave, finger, string] = match;
    const pitch = (LETTERS[name.toLowerCase()] ?? name.toUpperCase()) + accidental + octave;
    if (midiOf(pitch) < LOWEST_MIDI) {
      errors.push(`"${token}" is below the open G string`);
      continue;
    }

    const note = fillFingering({
      pitch,
      ...(string && { string: string.toUpperCase() as StringName }),
      ...(finger && { finger: finger.toUpperCase() }),
    });
    if (!note.finger) flagged.push(`"${token}" is outside first position: add a finger like ${pitch}/4`);

    notes.push(note);
  }

  return { notes, errors, flagged };
}
