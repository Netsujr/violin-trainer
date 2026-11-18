import { describe, expect, it } from "vitest";
import { boardShare } from "../src/ui/fingerboard";

describe("fingerboard", () => {
  it("puts the nut at the top and the end of first position at the bottom, each semitone shorter than the one before", () => {
    expect(boardShare(0)).toBe(0);
    expect(boardShare(7.5)).toBeCloseTo(1);
    expect(boardShare(1) - boardShare(0)).toBeGreaterThan(boardShare(6) - boardShare(5));
  });
});
