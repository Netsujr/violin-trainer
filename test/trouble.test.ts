import { describe, expect, it } from "vitest";
import type { PieceNote } from "../src/music/notes";
import { aroundSpot, spotScore, troubleSpots } from "../src/practice/trouble";

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

describe("around a spot", () => {
  it("leads in and out by 2 beats", () => {
    expect(aroundSpot(notes, { first: 4, last: 7 })).toEqual({ first: 2, last: 9 });
  });

  it("stops at the piece's ends", () => {
    expect(aroundSpot(notes, { first: 0, last: 3 })).toEqual({ first: 0, last: 5 });
    expect(aroundSpot(notes, { first: 12, last: 15 })).toEqual({ first: 10, last: 15 });
  });

  it("starts from a long note still sounding 2 beats before", () => {
    const long: PieceNote[] = [{ pitch: "D4", beats: 4 }, { pitch: "E4", beats: 1 }, { pitch: "F#4", beats: 1 }, { pitch: "G4", beats: 4 }];
    expect(aroundSpot(long, { first: 1, last: 2 })).toEqual({ first: 0, last: 3 });
  });
});

describe("a spot's score", () => {
  it("counts only the spot's own notes, not the lead in and out", () => {
    // Notes 2–9 played: the lead-in (2, 3) and lead-out (8, 9) missed, the spot (4–7) three of four hit.
    const results = new Map([[2, false], [3, false], [4, true], [5, false], [6, true], [7, true], [8, false], [9, false]]);
    expect(spotScore(results, { first: 4, last: 7 })).toBe(75);
  });

  it("has none when none of its notes were judged", () => {
    expect(spotScore(new Map([[0, true]]), { first: 4, last: 7 })).toBeNull();
  });
});
