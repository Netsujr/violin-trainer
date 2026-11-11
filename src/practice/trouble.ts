import { BAR_BEATS, type PieceNote } from "../music/notes";

// A spot lasts at most this many bars, so a rough run still points somewhere useful rather than at the whole piece.
const MOST_BARS = 2;
const MOST_SPOTS = 3;

export type TroubleSpot = { firstBar: number; lastBar: number; first: number; last: number; missed: number };

// Where a scored run went wrong: its missed notes, by bar, with neighbouring bars joined into spots, the worst first.
// Bars count from 1, and first and last are the notes the spot spans. results is each judged note: hit or missed.
export function troubleSpots(notes: PieceNote[], results: Map<number, boolean>): TroubleSpot[] {
  let beat = 0;
  const barOf = notes.map((note) => {
    const bar = Math.floor(beat / BAR_BEATS) + 1;
    beat += note.beats ?? 1;
    return bar;
  });
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
