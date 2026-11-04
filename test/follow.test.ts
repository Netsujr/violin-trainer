import { describe, expect, it } from "vitest";
import { frequencyOf, type PieceNote } from "../src/music/notes";
import { createFollow, type FollowResult } from "../src/practice/follow";

const A4 = 69;
const notes: PieceNote[] = [{ pitch: "A4" }, { pitch: "A4", beats: 2 }, { pitch: "B4", beats: 0.5 }];
const STEP = 0.01;

// Plays through the notes, asking what sounds at each beat.
function play(pieceNotes: PieceNote[], heard: (beat: number) => number | null, { first = 0, tolerance = 40, from = 0, step = STEP } = {}) {
  const follow = createFollow(pieceNotes, first, () => tolerance);
  const results: FollowResult[] = [];
  const end = pieceNotes.reduce((sum, note) => sum + (note.beats ?? 1), 0) + step;
  for (let beat = from; beat <= end; beat += step) results.push(...follow.update(heard(beat), beat, step));
  return results;
}
const hits = (results: FollowResult[]) => results.map((result) => result.hit);

describe("following along", () => {
  it("counts every note played all the way through", () => {
    const midi = [A4, A4, A4 + 2];
    expect(hits(play(notes, (beat) => frequencyOf(beat < 1 ? midi[0] : beat < 3 ? midi[1] : midi[2])))).toEqual([true, true, true]);
  });

  it("misses everything in silence, and doesn't wait for it", () => {
    expect(hits(play(notes, () => null))).toEqual([false, false, false]);
  });

  it("needs half the note's length, not more", () => {
    const one: PieceNote[] = [{ pitch: "A4", beats: 2 }];
    expect(hits(play(one, (beat) => (beat < 1.02 ? frequencyOf(A4) : null)))).toEqual([true]);
    expect(hits(play(one, (beat) => (beat < 0.97 ? frequencyOf(A4) : null)))).toEqual([false]);
  });

  it("forgives a late start", () => {
    const one: PieceNote[] = [{ pitch: "A4" }];
    expect(hits(play(one, (beat) => (beat > 0.4 ? frequencyOf(A4) : null)))).toEqual([true]);
  });

  it("adds up time in tune across a gap", () => {
    const one: PieceNote[] = [{ pitch: "A4", beats: 2 }];
    expect(hits(play(one, (beat) => (beat < 0.6 || beat > 1.4 ? frequencyOf(A4) : null)))).toEqual([true]);
  });

  it("doesn't count a wrong note, or one outside the tolerance", () => {
    const one: PieceNote[] = [{ pitch: "A4" }];
    expect(hits(play(one, () => frequencyOf(A4 + 2)))).toEqual([false]);
    const sharp = frequencyOf(A4) * 2 ** (50 / 1200);
    expect(hits(play(one, () => sharp, { tolerance: 40 }))).toEqual([false]);
    expect(hits(play(one, () => sharp, { tolerance: 60 }))).toEqual([true]);
  });

  it("accepts the octave, as the wait mode does", () => {
    expect(hits(play([{ pitch: "A4" }], () => frequencyOf(A4 + 12)))).toEqual([true]);
  });

  it("needs no break between repeated notes", () => {
    expect(hits(play([{ pitch: "A4" }, { pitch: "A4" }], () => frequencyOf(A4)))).toEqual([true, true]);
  });

  it("ignores what is played before a note's slot", () => {
    expect(hits(play([{ pitch: "A4" }], (beat) => (beat < 0 ? frequencyOf(A4) : null), { from: -4 }))).toEqual([false]);
  });

  it("starts from the chosen note", () => {
    const results = play(notes, () => frequencyOf(A4 + 2), { first: 2, from: 3 });
    expect(results.map((result) => result.index)).toEqual([2]);
    expect(results[0].hit).toBe(true);
  });

  it("gives a result for every note even after a long stall", () => {
    const follow = createFollow(notes, 0, () => 40);
    expect(follow.update(null, 10, 10).map((result) => result.index)).toEqual([0, 1, 2]);
    expect(follow.index).toBe(3);
  });

  it("reports the average distance from the note", () => {
    const sharp = frequencyOf(A4) * 2 ** (10 / 1200);
    const [result] = play([{ pitch: "A4" }], () => sharp);
    expect(result.cents).toBeCloseTo(10, 5);
  });
});
