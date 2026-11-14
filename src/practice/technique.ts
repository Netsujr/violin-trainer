import { centsFrom, midiOf, type PieceNote } from "../music/notes";

// A note's first moments are the bow catching the string, not the note held, so its scoring starts this long in.
const ATTACK_MS = 150;
// A beat counts as held when the sound stays above the mic's gate for this share of it.
const HELD_SHARE = 0.9;
// Inside a slur, the sound falling below this share of the bow's average loudness is a bow change.
// ponytail: a fixed share, and a smooth bow change barely dips, so slur scores are approximate. Make it a setting if
// real playing shows it's needed.
const DIP_SHARE = 0.5;

// One reading from the mic during an exercise: when it was played, in beats from the first note, the pitch heard, if
// any, and how loud it was.
export type TechniqueReading = { beat: number; frequency: number | null; rms: number };

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
// How far values stray from their average, as a standard deviation.
function spread(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

// Each note's readings after its attack, with where the note starts and ends, in beats.
function notesHeard(notes: PieceNote[], readings: TechniqueReading[], beatMs: number) {
  const attack = ATTACK_MS / beatMs;
  let start = 0;
  return notes.map((note) => {
    const end = start + note.beats!;
    const heard = { note, start, end, readings: readings.filter(({ beat }) => beat >= start + attack && beat < end) };
    start = end;
    return heard;
  });
}

// How many of the beats were held, each one with the sound above the gate for nearly all of it.
function heldBeats(heard: ReturnType<typeof notesHeard>, minRms: number) {
  let held = 0;
  let beats = 0;
  for (const { start, end, readings } of heard) {
    for (let beat = start; beat < end; beat++, beats++) {
      const inBeat = readings.filter((reading) => reading.beat >= beat && reading.beat < beat + 1);
      if (inBeat.length && inBeat.filter(({ rms }) => rms >= minRms).length >= HELD_SHARE * inBeat.length) held++;
    }
  }
  return { held, beats };
}

// How steady a long bow was: how far the pitch wandered, in cents either way, how evenly loud it stayed, as a
// percentage where 100 is perfectly even, and how many beats were held. Each is the average over the notes.
export function scoreLongBow(notes: PieceNote[], readings: TechniqueReading[], { beatMs, minRms }: { beatMs: number; minRms: number }) {
  const heard = notesHeard(notes, readings, beatMs);
  const spreads: number[] = [];
  const steadiness: number[] = [];
  for (const { note, readings: noteReadings } of heard) {
    const cents = noteReadings.flatMap(({ frequency }) => (frequency === null ? [] : [centsFrom(frequency, midiOf(note.pitch))]));
    if (cents.length > 1) spreads.push(spread(cents));
    const loudness = noteReadings.flatMap(({ rms }) => (rms >= minRms ? [rms] : []));
    if (loudness.length > 1) steadiness.push(Math.max(0, 1 - spread(loudness) / mean(loudness)));
  }
  return {
    pitchSpread: spreads.length ? Math.round(mean(spreads)) : null,
    steadiness: steadiness.length ? Math.round(100 * mean(steadiness)) : null,
    ...heldBeats(heard, minRms),
  };
}

// Whether a note was played in tune: within the tolerance for the hold time without a break.
function playedInTune(midi: number, readings: TechniqueReading[], { beatMs, toleranceCents, holdMs }: { beatMs: number; toleranceCents: number; holdMs: number }) {
  let since: number | null = null;
  for (const { beat, frequency } of readings) {
    if (frequency === null || Math.abs(centsFrom(frequency, midi)) > toleranceCents) {
      since = null;
      continue;
    }
    since ??= beat;
    if ((beat - since) * beatMs >= holdMs) return true;
  }
  return false;
}

// Whether a bow was played without a break: inside it, away from the bow changes at either end, the sound never dips
// well below its average for more than a reading. A bow with no sound wasn't played smoothly either.
function smoothBow(readings: TechniqueReading[], minRms: number) {
  if (!readings.length) return false;
  const average = mean(readings.map(({ rms }) => rms));
  const dipped = readings.some(({ rms }, index) => index > 0 && rms < DIP_SHARE * average && readings[index - 1].rms < DIP_SHARE * average);
  return average >= minRms && !dipped;
}

// How slurs went: the notes played in tune, the bows played without a break between their notes, and the beats held.
// A dip between bows is a bow change, as it should be.
export function scoreSlurs(
  notes: PieceNote[],
  perBow: number,
  readings: TechniqueReading[],
  options: { beatMs: number; minRms: number; toleranceCents: number; holdMs: number },
) {
  const heard = notesHeard(notes, readings, options.beatMs);
  const attack = ATTACK_MS / options.beatMs;
  const bows = Array.from({ length: Math.ceil(notes.length / perBow) }, (_, bow) => {
    const start = heard[bow * perBow].start;
    const end = heard[Math.min(notes.length, (bow + 1) * perBow) - 1].end;
    return readings.filter(({ beat }) => beat >= start + attack && beat < end - attack);
  });
  return {
    inTune: heard.filter(({ note, readings: noteReadings }) => playedInTune(midiOf(note.pitch), noteReadings, options)).length,
    notes: notes.length,
    smooth: bows.filter((bow) => smoothBow(bow, options.minRms)).length,
    bows: bows.length,
    ...heldBeats(heard, options.minRms),
  };
}
