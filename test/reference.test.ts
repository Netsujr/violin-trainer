import { describe, expect, it } from "vitest";
import { sampleFor, SAMPLE_MIDIS } from "../src/audio/reference";
import { HIGHEST_MIDI, LOWEST_MIDI } from "../src/music/fingering";

describe("violin recordings", () => {
  it("has one for every note of first position", () => {
    expect(SAMPLE_MIDIS).toEqual(Array.from({ length: HIGHEST_MIDI - LOWEST_MIDI + 1 }, (_, index) => LOWEST_MIDI + index));
  });

  it("plays a note's own recording, or outside first position the nearest one, retuned", () => {
    expect(sampleFor(62)).toEqual({ midi: 62, rate: 1 });
    expect(sampleFor(HIGHEST_MIDI + 2)).toEqual({ midi: HIGHEST_MIDI, rate: 2 ** (2 / 12) });
    expect(sampleFor(LOWEST_MIDI - 5)).toEqual({ midi: LOWEST_MIDI, rate: 2 ** (-5 / 12) });
  });
});
