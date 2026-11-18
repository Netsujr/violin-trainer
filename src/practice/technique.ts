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
    const cents = noteReadings.flatMap(({ frequency }) => (frequency === null ? [] : [centsFrom(frequency, midiOf(note.pitch!))]));
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
    inTune: heard.filter(({ note, readings: noteReadings }) => playedInTune(midiOf(note.pitch!), noteReadings, options)).length,
    notes: notes.length,
    smooth: bows.filter((bow) => smoothBow(bow, options.minRms)).length,
    bows: bows.length,
    ...heldBeats(heard, options.minRms),
  };
}

// A finger this close to its moment, late or early, is on time: good players differ by about this much, unheard.
export const ON_TIME_MS = 60;
// How far either side of a note change to look for the bow changing, at most.
const CHANGE_REACH_MS = 400;
// The new note counts as arrived once this many readings in a row are on it.
const ARRIVED_READINGS = 3;

// How a change from one note to the next was timed by the finger: ms late, or early below 0, or null when the new note
// wasn't heard; whether the finger lifted, going down the string; and the beats where the wrong note sounded, if any.
export type NoteChange = { lift: boolean; ms: number | null; wrong: [from: number, to: number] | null };

// Each change of note, timed. Between bows, or across a rest, the bow change is found as the dip in loudness: a late
// finger leaves the old note sounding on the new bow, and an early one plays the new note on the old bow. Inside a slur,
// or when the bow changed too smoothly to find, the new note is timed against the beat it should come on.
// ponytail: a bow change with no dip falls back to the beat, which mixes the bow's timing in; fine while bow changes dip.
export function noteChanges(
  notes: PieceNote[],
  perBow: number,
  readings: TechniqueReading[],
  { beatMs, toleranceCents }: { beatMs: number; toleranceCents: number },
) {
  const starts = noteStarts(notes);
  const pitched = notes.flatMap((note, index) => (note.pitch ? [index] : []));
  return pitched.slice(1).flatMap((next, count): NoteChange[] => {
    const previous = pitched[count];
    if (notes[previous].pitch === notes[next].pitch) return [];
    const midi = midiOf(notes[next].pitch!);
    const lift = midi < midiOf(notes[previous].pitch!);
    const reach = Math.min(CHANGE_REACH_MS / beatMs, Math.min(notes[previous].beats!, notes[next].beats!) / 2);
    // From just before the old note ends to halfway through the new one, so a very late finger is still found.
    const near = readings.filter(({ beat }) => beat >= starts[previous + 1] - reach && beat < starts[next] + notes[next].beats! / 2);
    const onNew = ({ frequency }: TechniqueReading) => frequency !== null && Math.abs(centsFrom(frequency, midi)) <= toleranceCents;
    const arrival = near.findIndex((_, index) => index + ARRIVED_READINGS <= near.length && near.slice(index, index + ARRIVED_READINGS).every(onNew));
    if (arrival < 0) return [{ lift, ms: null, wrong: null }];

    const timed = (from: number, to: number, sign: number): NoteChange => ({ lift, ms: sign * (to - from) * beatMs, wrong: to > from ? [from, to] : null });
    const arrivedAt = near[arrival].beat;
    const newBow = Math.floor(count / perBow) !== Math.floor((count + 1) / perBow);
    const aroundChange = near.filter(({ beat }) => beat < starts[next] + reach);
    const average = mean(aroundChange.map(({ rms }) => rms));
    const dip = aroundChange.reduce((lowest, reading) => (reading.rms < lowest.rms ? reading : lowest), aroundChange[0]);
    if (!newBow || !dip || dip.rms >= DIP_SHARE * average) return [arrivedAt >= starts[next] ? timed(starts[next], arrivedAt, 1) : timed(arrivedAt, starts[next], -1)];
    if (arrivedAt < dip.beat) return [timed(arrivedAt, dip.beat, -1)];
    const sounded = near.find(({ beat, frequency }) => beat >= dip.beat && frequency !== null)!;
    return [timed(sounded.beat, arrivedAt, 1)];
  });
}
