import { midiOf, type PieceNote, type StringName } from "./notes";

const OPEN_STRINGS: Record<StringName, number> = { E: 76, A: 69, D: 62, G: 55 };
const FINGERS = ["0", "L1", "1", "L2", "2", "3", "H3", "4"];

export const LOWEST_MIDI = OPEN_STRINGS.G;

export const stringFor = (midi: number) =>
  (Object.keys(OPEN_STRINGS) as StringName[]).find((name) => OPEN_STRINGS[name] <= midi)!;

export const fingerOn = (string: StringName, midi: number) => FINGERS[midi - OPEN_STRINGS[string]];

export function fillFingering(note: PieceNote): PieceNote {
  const midi = midiOf(note.pitch);
  const string = note.string ?? stringFor(midi);
  return { ...note, string, finger: note.finger ?? fingerOn(string, midi) };
}
