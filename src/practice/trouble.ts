import { BAR_BEATS, type PieceNote } from "../music/notes";

// A spot lasts at most this many bars, so a rough run still points somewhere useful rather than at the whole piece.
const MOST_BARS = 2;
const MOST_SPOTS = 3;

// Lead in and out of a spot, so it's played in its music rather than from cold.
const AROUND_BEATS = 2;

export type TroubleSpot = { firstBar: number; lastBar: number; first: number; last: number; missed: number };

// Where each note starts, in beats from the first.
function startsOf(notes: PieceNote[]) {
  let beat = 0;
  return notes.map((note) => {
    const start = beat;
    beat += note.beats ?? 1;
    return start;
  });
}

// The notes to play for a spot: from the one sounding 2 beats before it, to the last starting within 2 beats after it.
export function aroundSpot(notes: PieceNote[], { first, last }: { first: number; last: number }) {
  const starts = startsOf(notes);
  const from = starts[first] - AROUND_BEATS;
  const to = starts[last] + (notes[last].beats ?? 1) + AROUND_BEATS;
  return { first: starts.findIndex((start, index) => start + (notes[index].beats ?? 1) > from), last: starts.findLastIndex((start) => start < to) };
}

// Where a scored run went wrong: its missed notes, by bar, with neighbouring bars joined into spots, the worst first.
// Bars count from 1, and first and last are the notes the spot spans. results is each judged note: hit or missed.
export function troubleSpots(notes: PieceNote[], results: Map<number, boolean>): TroubleSpot[] {
  const barOf = startsOf(notes).map((start) => Math.floor(start / BAR_BEATS) + 1);
  const missedIn = new Map<number, number>();
  for (const [index, hit] of results) if (!hit) missedIn.set(barOf[index], (missedIn.get(barOf[index]) ?? 0) + 1);

  const spots: TroubleSpot[] = [];
  for (const bar of [...missedIn.keys()].sort((a, b) => a - b)) {
    const spot = spots.at(-1);
    if (spot && spot.lastBar === bar - 1 && bar - spot.firstBar < MOST_BARS) {
      spot.lastBar = bar;
      spot.missed += missedIn.get(bar)!;
    } else spots.push({ firstBar: bar, lastBar: bar, first: 0, last: 0, missed: missedIn.get(bar)! });
  }
  for (const spot of spots) {
    spot.first = barOf.indexOf(spot.firstBar);
    spot.last = barOf.lastIndexOf(spot.lastBar);
  }
  return spots.sort((a, b) => b.missed - a.missed || a.firstBar - b.firstBar).slice(0, MOST_SPOTS);
}
