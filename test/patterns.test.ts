import { describe, expect, it } from "vitest";
import type { Piece } from "../src/music/notes";
import { PATTERNS, withPattern } from "../src/music/patterns";

const piece: Piece = { id: "p", title: "P", source: "test", notes: [{ pitch: "D4", string: "D", finger: "0" }, { pitch: "E4", string: "D", finger: "1" }] };

describe("rhythm patterns", () => {
  it("leaves the piece untouched on pattern 1", () => {
    expect(withPattern(piece, 0)).toBe(piece);
  });

  it("holds each note for its beats on patterns 2 and 3", () => {
    expect(withPattern(piece, 1).notes.map((note) => note.beats)).toEqual([2, 2]);
    expect(withPattern(piece, 2).notes.map((note) => note.beats)).toEqual([4, 4]);
  });

  it("plays each note through the whole figure, keeping its string and finger", () => {
    const { notes, pattern } = withPattern(piece, 3);
    expect(pattern).toBe(3);
    expect(notes).toHaveLength(12);
    expect(notes.slice(0, 6).every((note) => note.pitch === "D4" && note.finger === "0" && note.string === "D")).toBe(true);
    expect(notes.slice(6).every((note) => note.pitch === "E4" && note.finger === "1")).toBe(true);
  });

  it("only uses lengths the staff can draw, and fills whole bars", () => {
    const beats = (figure: number[]) => figure.reduce((sum, length) => sum + length, 0);
    for (const figure of PATTERNS.slice(1)) {
      expect(figure.every((length) => [0.5, 1, 2, 4].includes(length))).toBe(true);
      expect(4 % beats(figure)).toBe(0);
    }
  });

  it("does not change the original piece", () => {
    withPattern(piece, 3);
    expect(piece.notes).toHaveLength(2);
    expect(piece.notes[0].beats).toBeUndefined();
  });
});
