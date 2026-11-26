import { describe, expect, it } from "vitest";
import { beatClock } from "../src/ui/recordingDialog";

describe("playing a recording back on the moving line", () => {
  // A half note, then two quarters, hit at 2 s, 4 s and 5 s.
  const notes = [{ pitch: "A4", beats: 2 }, { pitch: "B4" }, { pitch: "C#5" }];
  const beatAt = beatClock(notes, [
    { seconds: 2, index: 0 },
    { seconds: 4, index: 1 },
    { seconds: 5, index: 2 },
  ]);

  it("waits on the first note until it's hit, then glides from hit to hit", () => {
    expect([beatAt(0), beatAt(2), beatAt(3), beatAt(4), beatAt(4.5)]).toEqual([0, 0, 1, 2, 2.5]);
  });

  it("moves through the last note at the run's pace, 1 s a beat here, and stops at its end", () => {
    expect([beatAt(5.5), beatAt(6), beatAt(9)]).toEqual([3.5, 4, 4]);
  });
});
