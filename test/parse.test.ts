import { describe, expect, it } from "vitest";
import { parseQuickText } from "../src/music/parse";
import { builtInPieces } from "../src/storage";

describe("quick text", () => {
  it("reads letter names and ignores bar lines", () => {
    const { notes, errors } = parseQuickText("D4 E4 F#4 G4 | A4 B4 C#5 D5");
    expect(errors).toEqual([]);
    expect(notes.map((note) => note.pitch)).toEqual(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5", "D5"]);
  });

  it("reads a note's beats after a colon, and takes 1 when there are none", () => {
    const { notes, errors } = parseQuickText("D4:2 E4 F#4:.5 G4:0.5 A4:1,5");
    expect(errors).toEqual([]);
    expect(notes.map((note) => note.beats)).toEqual([2, 1, 0.5, 0.5, 1.5]);
  });

  it("refuses a length a note can't have", () => {
    const { notes, errors } = parseQuickText("D4:5 E4:0 F4:2");
    expect(notes.map((note) => note.pitch)).toEqual(["F4"]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("D4:5");
  });

  it("keeps a typed finger and string alongside the beats", () => {
    expect(parseQuickText("A4/4@d:2").notes[0]).toMatchObject({ pitch: "A4", finger: "4", string: "D", beats: 2 });
  });

  it("gives the pasted D major line the built-in fingering", () => {
    const { notes } = parseQuickText("D4 E4 F#4 G4 | A4 B4 C#5 D5");
    expect(notes).toMatchObject(builtInPieces()[0].notes.slice(0, 8));
  });

  it("reads solfège the same as letters, with or without accents", () => {
    const letters = parseQuickText("D4 E4 F#4 G4 | A4 B4 C#5 D5").notes;
    expect(parseQuickText("Re4 Mi4 Fa#4 Sol4 | La4 Si4 Do#5 Re5").notes).toEqual(letters);
    expect(parseQuickText("Ré4 Mi4 Fá♯4 Sol4 | Lá4 Si4 Dó♯5 Ré5").notes).toEqual(letters);
  });

  it("tells flats apart from the note B", () => {
    expect(parseQuickText("Bb4 B4 Sib4 Si4").notes.map((note) => note.pitch)).toEqual(["Bb4", "B4", "Bb4", "B4"]);
  });

  it("applies finger and string overrides", () => {
    const { notes } = parseQuickText("C5/L2@A  B4  A4/0 A4/4@D");
    expect(notes).toMatchObject([
      { pitch: "C5", string: "A", finger: "L2" },
      { pitch: "B4", string: "A", finger: "1" },
      { pitch: "A4", string: "A", finger: "0" },
      { pitch: "A4", string: "D", finger: "4" },
    ]);
  });

  it("works out the finger when only the string is forced", () => {
    expect(parseQuickText("A4@D").notes[0]).toMatchObject({ pitch: "A4", string: "D", finger: "4" });
  });

  it("flags notes above first position until a finger is given", () => {
    expect(parseQuickText("C6").flagged).toHaveLength(1);
    expect(parseQuickText("C6/4").flagged).toEqual([]);
  });

  it("reports what it cannot read and keeps the rest", () => {
    const { notes, errors } = parseQuickText("D4 banana F3 E4");
    expect(notes.map((note) => note.pitch)).toEqual(["D4", "E4"]);
    expect(errors).toHaveLength(2);
  });
});
