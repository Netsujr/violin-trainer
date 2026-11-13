import { describe, expect, it } from "vitest";
import { beatInBar, COMMON_TIME, meterOf } from "../src/music/notes";
import { troubleSpots } from "../src/practice/trouble";

const waltz = meterOf({ beatsPerBar: 3, pickup: 1 });

describe("meter", () => {
  it("is 4/4 with no pickup unless a piece says otherwise", () => {
    expect(meterOf({})).toEqual(COMMON_TIME);
    expect(waltz).toEqual({ beatsPerBar: 3, pickup: 1 });
  });

  it("puts a pickup at the end of a bar, so the first whole bar starts after it", () => {
    expect([0, 1, 2, 3, 4].map((beat) => beatInBar(beat, waltz))).toEqual([2, 0, 1, 2, 0]);
    expect([0, 3, 4, 5.5].map((beat) => beatInBar(beat, COMMON_TIME))).toEqual([0, 3, 0, 1.5]);
  });

  it("numbers trouble spots by its bars, the pickup counting with the first", () => {
    // A pickup, then bars of 3: notes 1–3 are bar 1, 4–6 bar 2, 7–9 bar 3.
    const notes = Array.from({ length: 10 }, () => ({ pitch: "D4", beats: 1 }));
    const judged = (missed: number[]) => new Map(notes.map((_, index) => [index, !missed.includes(index)]));
    expect(troubleSpots(notes, judged([0, 7]), waltz).map(({ firstBar, lastBar }) => [firstBar, lastBar])).toEqual([[1, 1], [3, 3]]);
    expect(troubleSpots(notes, judged([4]), waltz)[0]).toMatchObject({ firstBar: 2, first: 4, last: 6 });
  });

});
