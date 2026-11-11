import { describe, expect, it } from "vitest";
import type { PieceNote } from "../src/music/notes";
import { troubleSpots } from "../src/practice/trouble";

// Four bars of four quarter notes: bar 1 is notes 0–3, bar 2 notes 4–7, and so on.
const notes: PieceNote[] = Array.from({ length: 16 }, () => ({ pitch: "D4", beats: 1 }));
const judged = (missed: number[]) => new Map(notes.map((_, index) => [index, !missed.includes(index)]));

describe("trouble spots", () => {
  it("has none for a clean run", () => {
    expect(troubleSpots(notes, judged([]))).toEqual([]);
  });

  it("joins neighbouring bars with misses, and puts the worst first", () => {
    expect(troubleSpots(notes, judged([2, 5, 6, 13]))).toEqual([
      { firstBar: 1, lastBar: 2, first: 0, last: 7, missed: 3 },
      { firstBar: 4, lastBar: 4, first: 12, last: 15, missed: 1 },
    ]);
  });

  it("keeps a spot to two bars, and shows the three worst", () => {
    const spots = troubleSpots(notes, judged([0, 1, 4, 8, 9, 10, 12]));
    expect(spots.map((spot) => [spot.firstBar, spot.lastBar, spot.missed])).toEqual([
      [3, 4, 4],
      [1, 2, 3],
    ]);
  });

  it("counts bars by the notes' lengths", () => {
    const long: PieceNote[] = [{ pitch: "D4", beats: 4 }, { pitch: "E4", beats: 2 }, { pitch: "F#4", beats: 2 }, { pitch: "G4", beats: 4 }];
    expect(troubleSpots(long, new Map([[0, true], [1, true], [2, false], [3, true]]))).toEqual([{ firstBar: 2, lastBar: 2, first: 1, last: 2, missed: 1 }]);
  });
});
