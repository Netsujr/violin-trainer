import { describe, expect, it } from "vitest";
import { barMarks, staffStepsFrom } from "../src/music/notes";

describe("bars", () => {
  const lengths = (...beats: (number | undefined)[]) => barMarks(beats.map((length) => ({ pitch: "D4", beats: length })));

  it("marks the note that fills a bar", () => {
    expect(lengths(2, 2, 1).map((mark) => mark.endsBar)).toEqual([false, true, false]);
    expect(lengths(0.5, 0.5, 1, 2).at(-1)).toEqual({ endsBar: true, crossesBar: false });
  });

  it("marks a note that runs over the bar line", () => {
    expect(lengths(3, 2).map((mark) => mark.crossesBar)).toEqual([false, true]);
    expect(lengths(1.5, 3).map((mark) => mark.crossesBar)).toEqual([false, true]);
  });

  it("counts a note with no written length as one beat", () => {
    expect(lengths(undefined, undefined, undefined, undefined).at(-1)!.endsBar).toBe(true);
  });
});

describe("placing a played pitch on the staff", () => {
  const D4 = 62;
  const FSHARP4 = 66;
  const B4 = 71;

  it("sits on the note when it's right", () => {
    expect(staffStepsFrom(D4, 0)).toBe(0);
    expect(staffStepsFrom(FSHARP4, 0)).toBe(0);
  });

  it("moves up and down by staff positions", () => {
    expect(staffStepsFrom(D4, 200)).toBe(1); // E
    expect(staffStepsFrom(D4, -100)).toBe(-1); // C sharp, on the C position
    expect(staffStepsFrom(D4, 500)).toBe(3); // G
  });

  it("slides smoothly between positions", () => {
    expect(staffStepsFrom(D4, 150)).toBeCloseTo(0.5, 5);
  });

  it("crosses the octave correctly", () => {
    expect(staffStepsFrom(B4, 100)).toBe(1); // C5, the next position up
  });

  it("keeps a sharp on the natural's position", () => {
    expect(staffStepsFrom(FSHARP4, -100)).toBe(0); // F natural, so only the arrow can tell them apart
    expect(staffStepsFrom(D4, 100)).toBe(0); // D sharp
  });
});
