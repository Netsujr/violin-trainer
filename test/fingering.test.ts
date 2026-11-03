import { describe, expect, it } from "vitest";
import { fillFingering, fingerOn, stringFor } from "../src/music/fingering";
import { midiOf } from "../src/music/notes";
import { builtInPieces } from "../src/storage";

const EXPECTED: [string, string, string][] = [
  ["G3", "G", "0"], ["G#3", "G", "L1"], ["A3", "G", "1"], ["A#3", "G", "L2"], ["B3", "G", "2"], ["C4", "G", "3"], ["C#4", "G", "H3"],
  ["D4", "D", "0"], ["D#4", "D", "L1"], ["E4", "D", "1"], ["F4", "D", "L2"], ["F#4", "D", "2"], ["G4", "D", "3"], ["G#4", "D", "H3"],
  ["A4", "A", "0"], ["A#4", "A", "L1"], ["B4", "A", "1"], ["C5", "A", "L2"], ["C#5", "A", "2"], ["D5", "A", "3"], ["D#5", "A", "H3"],
  ["E5", "E", "0"], ["F5", "E", "L1"], ["F#5", "E", "1"], ["G5", "E", "L2"], ["G#5", "E", "2"], ["A5", "E", "3"], ["A#5", "E", "H3"], ["B5", "E", "4"],
];

describe("first-position fingering", () => {
  it.each(EXPECTED)("%s is on the %s string, finger %s", (pitch, string, finger) => {
    expect(stringFor(midiOf(pitch))).toBe(string);
    expect(fingerOn(string as "G", midiOf(pitch))).toBe(finger);
  });

  it("leaves notes above B5 without a finger", () => {
    expect(fillFingering({ pitch: "C6" }).finger).toBeUndefined();
  });

  it("keeps an explicit string and finger", () => {
    expect(fillFingering({ pitch: "A4", string: "D", finger: "4" })).toEqual({ pitch: "A4", string: "D", finger: "4" });
  });
});

const fingersOf = (id: string) => builtInPieces().find((piece) => piece.id === id)!.notes.map((note) => note.finger);

describe("built-in scales match the practice PDF", () => {
  it("D major", () => {
    expect(fingersOf("d-major-1oct")).toEqual(["0", "1", "2", "3", "0", "1", "2", "3", "2", "1", "0", "3", "2", "1", "0"]);
  });

  it("A major", () => {
    expect(fingersOf("a-major-1oct")).toEqual(["0", "1", "2", "3", "0", "1", "2", "3", "2", "1", "0", "3", "2", "1", "0"]);
  });

  it("G major, going up", () => {
    expect(fingersOf("g-major-2oct").slice(0, 15)).toEqual(["0", "1", "2", "3", "0", "1", "2", "3", "0", "1", "L2", "3", "0", "1", "L2"]);
  });

  it("C major", () => {
    expect(fingersOf("c-major-1oct")).toEqual(["3", "0", "1", "L2", "3", "0", "1", "L2", "1", "0", "3", "L2", "1", "0", "3"]);
  });

  it("A minor", () => {
    expect(fingersOf("a-minor-1oct")).toEqual(["0", "1", "L2", "3", "0", "L1", "L2", "3", "L2", "L1", "0", "3", "L2", "1", "0"]);
  });

  it("D minor", () => {
    expect(fingersOf("d-minor-1oct")).toEqual(["0", "1", "L2", "3", "0", "L1", "L2", "3", "L2", "L1", "0", "3", "L2", "1", "0"]);
  });

  it("append the way down without repeating the top note", () => {
    const pitches = builtInPieces().find((piece) => piece.id === "d-major-1oct")!.notes.map((note) => note.pitch);
    expect(pitches).toEqual(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5", "C#5", "B4", "A4", "G4", "F#4", "E4", "D4"]);
  });
});
