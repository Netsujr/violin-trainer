import { Note } from "tonal";
import { t } from "../i18n";

export type StringName = "G" | "D" | "A" | "E";

export type PieceNote = {
  pitch: string;
  string?: StringName;
  finger?: string;
  beats?: number;
};

export type Piece = {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  notes: PieceNote[];
  pattern?: number;
  // Beats to a bar, when it isn't 4, and the beats before the first whole bar, when it starts with a pickup.
  beatsPerBar?: number;
  pickup?: number;
};

const ACCIDENTAL: Record<string, string> = { "": "", "#": "♯", b: "♭" };

export const midiOf = (pitch: string) => Note.midi(pitch)!;
export const pitchOf = (midi: number) => Note.fromMidiSharps(midi);
export const frequencyOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export const nearestMidi = (frequency: number) => Math.round(69 + 12 * Math.log2(frequency / 440));
export const BEAT_LENGTHS = [0.5, 1, 1.5, 2, 3, 4];
export const BEAT_LABELS: Record<number, string> = { 0.5: "½", 1: "1", 1.5: "1½", 2: "2", 3: "3", 4: "4" };
export const BAR_BEATS = 4;

// How a piece is counted in bars.
export type Meter = { beatsPerBar: number; pickup: number };
export const COMMON_TIME: Meter = { beatsPerBar: BAR_BEATS, pickup: 0 };
export const meterOf = ({ beatsPerBar = BAR_BEATS, pickup = 0 }: Pick<Piece, "beatsPerBar" | "pickup">): Meter => ({ beatsPerBar, pickup });
// Where a beat falls in its bar, from 0 on the bar's first beat. A pickup is the end of a bar before the first.
export const beatInBar = (beat: number, { beatsPerBar, pickup }: Meter) => (((beat - pickup) % beatsPerBar) + beatsPerBar) % beatsPerBar;

// Where each note ends a bar, and whether it runs over one, which the staff has no way to draw without ties.
export function barMarks(notes: PieceNote[]) {
  let beat = 0;
  return notes.map((note) => {
    const inBar = beat % BAR_BEATS;
    const beats = note.beats ?? 1;
    beat += beats;
    return { endsBar: beat % BAR_BEATS === 0, crossesBar: inBar + beats > BAR_BEATS };
  });
}

const LETTER_STEPS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const staffStep = (midi: number) => {
  const { letter, oct } = Note.get(pitchOf(midi));
  return oct! * 7 + LETTER_STEPS[letter];
};

// How many staff positions a pitch sits from a note, up being positive, sliding smoothly between them.
// A sharp shares its position with the natural below it, as it does on paper.
export function staffStepsFrom(midi: number, cents: number) {
  const pitch = midi + cents / 100;
  const below = Math.floor(pitch);
  return staffStep(below) + (staffStep(below + 1) - staffStep(below)) * (pitch - below) - staffStep(midi);
}

export const centsFrom = (frequency: number, midi: number) => 1200 * Math.log2(frequency / frequencyOf(midi));

export function noteLabels(pitch: string) {
  const { letter, acc, oct } = Note.get(pitch);
  return { solfege: t.solfege[letter] + ACCIDENTAL[acc], letter: letter + ACCIDENTAL[acc], octave: oct as number };
}
