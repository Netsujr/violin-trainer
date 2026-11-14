import { describe, expect, it } from "vitest";
import { levelNotes, nextTargets } from "../src/ui/guesser";

const rolls = (...values: number[]) => () => values.shift()!;

describe("note guesser", () => {
  it("picks random notes from the level's, never the same twice running", () => {
    const hard = levelNotes("hard");
    expect(nextTargets(3, hard, undefined, rolls(0, 0, 0.5, 0.99))).toEqual(["G3", "A4", "B5"]);
    expect(nextTargets(1, hard, "G3", rolls(0, 0.04))).toEqual(["G#3"]);
  });

  it("draws each level from its own notes", () => {
    expect(levelNotes("easy")).toEqual(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5"]);
    expect(levelNotes("medium")).toEqual(["G3", "A3", "B3", "C4", ...levelNotes("easy"), "E5", "F#5", "G#5", "A5"]);
    expect(levelNotes("hard")).toHaveLength(29);
  });
});
