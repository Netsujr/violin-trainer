import { afterEach, describe, expect, it } from "vitest";
import { centsText, localNumber, localTitle, setLanguage, t } from "../src/i18n";
import { noteLabels } from "../src/music/notes";
import { parseQuickText } from "../src/music/parse";

afterEach(() => setLanguage("en"));

describe("language", () => {
  it("swaps every string when the language changes", () => {
    expect(t.start).toBe("Start");
    setLanguage("pt");
    expect(t.start).toBe("Iniciar");
    expect(t.screens.Calendar).toBe("Calendário");
  });

  it("spells note names properly in Portuguese and keeps the spec's list in English", () => {
    expect(noteLabels("F#4").solfege).toBe("Fa♯");
    expect(noteLabels("C4").solfege).toBe("Do");
    setLanguage("pt");
    expect(noteLabels("F#4").solfege).toBe("Fá♯");
    expect(noteLabels("C4").solfege).toBe("Dó");
    expect(noteLabels("F#4").letter).toBe("F♯");
  });

  it("translates built-in piece titles but leaves a user's own alone", () => {
    expect(localTitle("d-major-1oct", "D major")).toBe("D major");
    setLanguage("pt");
    expect(localTitle("d-major-1oct", "D major")).toBe("Ré maior");
    expect(localTitle("free-play", "Free play")).toBe("Prática livre");
    expect(localTitle("my-piece", "Minha peça")).toBe("Minha peça");
  });

  it("writes numbers the local way", () => {
    expect(localNumber(0.25, 1)).toBe("0.3");
    setLanguage("pt");
    expect(localNumber(0.25, 1)).toBe("0,3");
  });

  it("uses the singular for one cent, in either direction", () => {
    expect(centsText(1)).toBe("1 cent");
    expect(centsText(-1)).toBe("-1 cent");
    expect(centsText(0)).toBe("0 cents");
    expect(centsText(12)).toBe("12 cents");
  });

  it("translates fingers and parse messages in Portuguese", () => {
    setLanguage("pt");
    expect(t.finger("L2")).toBe("2 baixo");
    expect(t.finger("H3")).toBe("3 alto");
    expect(t.finger("1")).toBe("1");
    const { errors, flagged } = parseQuickText("banana C6");
    expect(errors[0]).toContain("Não foi possível");
    expect(flagged[0]).toContain("primeira posição");
  });
});
