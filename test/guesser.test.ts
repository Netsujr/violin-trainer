import { describe, expect, it } from "vitest";
import { nextTargets } from "../src/ui/guesser";

describe("note guesser", () => {
  it("takes written notes in order, going round", () => {
    expect(nextTargets(2, ["G3", "A3", "B3"], 0)).toEqual(["G3", "A3"]);
    expect(nextTargets(4, ["G3", "A3", "B3"], 2)).toEqual(["B3", "G3", "A3", "B3"]);
  });

  it("picks random notes in first position, never the same twice running", () => {
    const rolls = [0, 0, 0.5, 0.99];
    const targets = nextTargets(3, [], 0, undefined, () => rolls.shift()!);
    expect(targets).toEqual(["G3", "A4", "B5"]);
    expect(nextTargets(1, [], 0, "G3", (() => { const r = [0, 0.04]; return () => r.shift()!; })())).toEqual(["G#3"]);
  });
});
