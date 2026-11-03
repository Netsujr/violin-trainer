import { Note } from "tonal";
import { t } from "../i18n";

export type StringName = "G" | "D" | "A" | "E";

export type PieceNote = {
  pitch: string;
  string?: StringName;
  finger?: string;
  bar?: number;
};

export type Piece = {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  notes: PieceNote[];
};

const ACCIDENTAL: Record<string, string> = { "": "", "#": "♯", b: "♭" };

export const midiOf = (pitch: string) => Note.midi(pitch)!;
export const pitchOf = (midi: number) => Note.fromMidiSharps(midi);
export const frequencyOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const nearestMidi = (frequency: number) => Math.round(69 + 12 * Math.log2(frequency / 440));
export const centsFrom = (frequency: number, midi: number) => 1200 * Math.log2(frequency / frequencyOf(midi));

export function noteLabels(pitch: string) {
  const { letter, acc, oct } = Note.get(pitch);
  return { solfege: t.solfege[letter] + ACCIDENTAL[acc], letter: letter + ACCIDENTAL[acc], octave: oct as number };
}
