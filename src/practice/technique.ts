import { centsFrom, midiOf, type PieceNote } from "../music/notes";

// A note's first moments are the bow catching the string, not the note held, so its scoring starts this long in.
const ATTACK_MS = 150;
// Inside a slur, the sound falling below this share of the bow's average loudness is a bow change.
// ponytail: a fixed share, and a smooth bow change barely dips, so slur scores are approximate. Make it a setting if
// real playing shows it's needed.
const DIP_SHARE = 0.5;

// One reading from the mic during an exercise: how far through the round it came, in beats held, the pitch heard, if
// any, and how loud it was.
export type TechniqueReading = { beat: number; frequency: number | null; rms: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
// A round's score out of 100, from its shares, each 0 to 1, weighed alike.
export const roundScore = (shares: number[]) => Math.round(100 * mean(shares));

// How far values stray from their average, as a standard deviation.
function spread(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

// Where each note starts, in beats, and then where the last one ends.
export const noteStarts = (notes: PieceNote[]) => notes.reduce((starts, note) => [...starts, starts.at(-1)! + note.beats!], [0]);

// Each note's readings after its attack, with where the note starts and ends, in beats. A rest is passed over.
function notesHeard(notes: PieceNote[], readings: TechniqueReading[], beatMs: number) {
  const attack = ATTACK_MS / beatMs;
  const starts = noteStarts(notes);
  return notes.flatMap((note, index) => {
    const [start, end] = [starts[index], starts[index + 1]];
    return note.pitch ? [{ note, start, end, readings: readings.filter(({ beat }) => beat >= start + attack && beat < end) }] : [];
  });
}

// How steady a long bow was: how far the pitch wandered, in cents either way, and how evenly loud it stayed, as a
// percentage where 100 is perfectly even. Each is the average over the notes.
export function scoreLongBow(notes: PieceNote[], readings: TechniqueReading[], { beatMs, minRms }: { beatMs: number; minRms: number }) {
  const heard = notesHeard(notes, readings, beatMs);
  const spreads: number[] = [];
  const steadiness: number[] = [];
  for (const { note, readings: noteReadings } of heard) {
    const cents = noteReadings.flatMap(({ frequency }) => (frequency === null ? [] : [centsFrom(frequency, midiOf(note.pitch!))]));
    if (cents.length > 1) spreads.push(spread(cents));
    const loudness = noteReadings.flatMap(({ rms }) => (rms >= minRms ? [rms] : []));
    if (loudness.length > 1) steadiness.push(Math.max(0, 1 - spread(loudness) / mean(loudness)));
  }
  return {
    pitchSpread: spreads.length ? Math.round(mean(spreads)) : null,
    steadiness: steadiness.length ? Math.round(100 * mean(steadiness)) : null,
  };
}

// Whether a bow was played without a break: inside it, away from the bow changes at either end, the sound never dips
// well below its average for more than a reading. A bow with no sound wasn't played smoothly either.
function smoothBow(readings: TechniqueReading[], minRms: number) {
  if (!readings.length) return false;
  const average = mean(readings.map(({ rms }) => rms));
  const dipped = readings.some(({ rms }, index) => index > 0 && rms < DIP_SHARE * average && readings[index - 1].rms < DIP_SHARE * average);
  return average >= minRms && !dipped;
}

// How slurs went: the bows played without a break between their notes. A dip between bows is a bow change, as it
// should be.
export function scoreSlurs(notes: PieceNote[], perBow: number, readings: TechniqueReading[], options: { beatMs: number; minRms: number }) {
  const heard = notesHeard(notes, readings, options.beatMs);
  const attack = ATTACK_MS / options.beatMs;
  const bows = Array.from({ length: Math.ceil(notes.length / perBow) }, (_, bow) => {
    const start = heard[bow * perBow].start;
    const end = heard[Math.min(notes.length, (bow + 1) * perBow) - 1].end;
    return readings.filter(({ beat }) => beat >= start + attack && beat < end - attack);
  });
  return { smooth: bows.filter((bow) => smoothBow(bow, options.minRms)).length, bows: bows.length };
}

// A slip out of tune this short doesn't lose the time a note's been held; a longer one starts it again.
export const SLIP_MS = 250;

// How long the note being played has been held in tune: ms in all, when it last went out of tune, if it's out now,
// and when the last reading was.
export type Hold = { ms: number; outSince: number | null; at: number };

// The hold after a reading at now, in tune or not. Time out of tune never counts.
export function holdAfter(hold: Hold, inTune: boolean, now: number): Hold {
  if (inTune) return { ms: hold.outSince === null ? hold.ms + now - hold.at : hold.ms, outSince: null, at: now };
  const outSince = hold.outSince ?? now;
  return { ms: now - outSince > SLIP_MS ? 0 : hold.ms, outSince, at: now };
}
