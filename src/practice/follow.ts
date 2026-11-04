import { midiOf, type PieceNote } from "../music/notes";
import { centsToTarget } from "./judge";

// A note counts once it has sounded in tune for this share of its length, at any point during it.
const HIT_SHARE = 0.5;

export type FollowResult = { index: number; hit: boolean; cents: number };

// Checks each note as the music passes it, for when the lanes keep moving whatever is played.
// Repeated notes need no fresh bow stroke here, because each one is only judged during its own slot.
export function createFollow(notes: PieceNote[], firstIndex: number, toleranceCents: () => number, end = notes.length) {
  const starts = [0];
  for (const note of notes) starts.push(starts.at(-1)! + (note.beats ?? 1));
  let index = firstIndex;
  let heldBeats = 0;
  let heldCents: number[] = [];
  const needed = (noteIndex: number) => (notes[noteIndex].beats ?? 1) * HIT_SHARE;

  return {
    starts,
    get index() {
      return index;
    },
    startBeat: starts[firstIndex],
    get progress() {
      return index < end ? Math.min(1, heldBeats / needed(index)) : 0;
    },

    // beat is where the music has reached, and stepBeats how far it came since the last reading.
    update(frequency: number | null, beat: number, stepBeats: number) {
      const finished: FollowResult[] = [];
      while (index < end && beat >= starts[index + 1]) {
        const cents = heldCents.length ? heldCents.reduce((sum, value) => sum + value, 0) / heldCents.length : 0;
        finished.push({ index, hit: heldBeats >= needed(index), cents });
        index++;
        heldBeats = 0;
        heldCents = [];
      }
      if (frequency !== null && index < end && beat >= starts[index]) {
        const cents = centsToTarget(frequency, midiOf(notes[index].pitch));
        if (Math.abs(cents) <= toleranceCents()) {
          heldBeats += stepBeats;
          heldCents.push(Math.abs(cents));
        }
      }
      return finished;
    },
  };
}
