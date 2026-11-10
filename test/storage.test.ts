import { afterEach, describe, expect, it, vi } from "vitest";

// A fresh copy of the settings module, on a screen and with saved settings of our choosing.
async function settingsWith(stored: object | null, screen = { width: 1440, height: 900 }, language = "en-US") {
  vi.resetModules();
  const values = new Map<string, string>(stored ? [["settings", JSON.stringify(stored)]] : []);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal("navigator", { language });
  vi.stubGlobal("innerWidth", screen.width);
  vi.stubGlobal("innerHeight", screen.height);
  const { getSettings, saveSettings } = await import("../src/storage");
  return { getSettings, saveSettings, values };
}

afterEach(() => vi.unstubAllGlobals());

describe("count-in", () => {
  it("defaults to one bar, and moves a count no longer offered up to the next choice", async () => {
    expect((await settingsWith(null)).getSettings().countInBeats).toBe(4);
    expect((await settingsWith({ countInBeats: 3 })).getSettings().countInBeats).toBe(4);
    expect((await settingsWith({ countInBeats: 1 })).getSettings().countInBeats).toBe(2);
    expect((await settingsWith({ countInBeats: 6 })).getSettings().countInBeats).toBe(6);
    expect((await settingsWith({ countInBeats: 12 })).getSettings().countInBeats).toBe(10);
  });
});

describe("highlighted pieces", () => {
  it("keeps pieces that had a target day marked", async () => {
    const { getSettings } = await settingsWith({ targetDays: { "twinkle-twinkle": 2 } });
    expect(getSettings().highlighted).toEqual(["twinkle-twinkle"]);
  });

  it("toggles a mark on and off, and groups pieces in their own order", async () => {
    await settingsWith(null);
    const { allPieces, isHighlighted, pieceGroups, toggleHighlighted } = await import("../src/storage");
    const groups = pieceGroups(allPieces());
    const hills = groups[2][1].find((piece) => piece.id === "hills-and-dales")!;
    toggleHighlighted(hills);
    expect(isHighlighted(hills)).toBe(true);
    expect(pieceGroups(allPieces())[2][1].map((piece) => piece.id)).toEqual(groups[2][1].map((piece) => piece.id));
    toggleHighlighted(hills);
    expect(isHighlighted(hills)).toBe(false);
    expect(groups.map(([key, pieces]) => [key, pieces.length])).toEqual([["scales", 17], ["songs", 6], ["customSongs", 2]]);
  });
});

describe("saved pieces", () => {
  const piece = (id: string, title: string) => ({ id, title, source: "imported", notes: [{ pitch: "D4", beats: 1 }] });

  it("updates a piece where it is, leaving the others alone", async () => {
    await settingsWith(null);
    const { allPieces, savePiece, updatePiece } = await import("../src/storage");
    savePiece(piece("a", "A"));
    savePiece(piece("b", "B"));
    updatePiece({ ...piece("a", "Renamed"), notes: [{ pitch: "E4", beats: 2 }] });
    const mine = allPieces().filter((saved) => saved.source === "imported");
    expect(mine.map((saved) => saved.title)).toEqual(["Renamed", "B"]);
    expect(mine[0].notes).toEqual([{ pitch: "E4", beats: 2 }]);
  });

  it("remembers the draft on the staff, and which piece it's editing", async () => {
    await settingsWith(null);
    const { loadDraft, saveDraft } = await import("../src/storage");
    expect(loadDraft()).toEqual({ title: "", notes: [] });
    saveDraft({ title: "Mine", notes: [{ pitch: "D4", beats: 1 }], editingId: "a" });
    expect(loadDraft()).toEqual({ title: "Mine", notes: [{ pitch: "D4", beats: 1 }], editingId: "a" });
  });
});

describe("settings", () => {
  it("starts with sensible defaults", async () => {
    const { getSettings } = await settingsWith(null);
    expect(getSettings()).toMatchObject({ toleranceCents: 40, holdMs: 200, tempoOn: false, metronomeOn: false, bpm: 60, pattern: 0, staffOpen: false, optionsOpen: true });
    expect(getSettings().countInOn).toBe(true);
    expect(getSettings().toggles).toMatchObject({ fingers: true, staff: true });
  });

  it("gives a switch added later its default on older saved settings", async () => {
    const { getSettings } = await settingsWith({ toggles: { fingers: false, noteNames: true, letterNames: true } });
    expect(getSettings().toggles.fingers).toBe(false);
    expect(getSettings().toggles.staff).toBe(true);
  });

  it("picks the language from the browser until one is saved", async () => {
    expect((await settingsWith(null, undefined, "pt-BR")).getSettings().language).toBe("pt");
    expect((await settingsWith(null, undefined, "fr-FR")).getSettings().language).toBe("en");
    expect((await settingsWith({ language: "en" }, undefined, "pt-BR")).getSettings().language).toBe("en");
  });

  it("starts the options closed on phones, but respects a saved choice", async () => {
    expect((await settingsWith(null, { width: 390, height: 844 })).getSettings().optionsOpen).toBe(false);
    expect((await settingsWith(null, { width: 844, height: 390 })).getSettings().optionsOpen).toBe(false);
    expect((await settingsWith(null, { width: 768, height: 1024 })).getSettings().optionsOpen).toBe(true);
    expect((await settingsWith({ optionsOpen: true }, { width: 390, height: 844 })).getSettings().optionsOpen).toBe(true);
  });

  it("saves what changed", async () => {
    const { getSettings, saveSettings, values } = await settingsWith(null);
    getSettings().bpm = 72;
    saveSettings();
    expect(JSON.parse(values.get("settings")!).bpm).toBe(72);
  });
});

describe("timeline scale", () => {
  async function scaleOn(width: number, height: number) {
    await settingsWith(null, { width, height });
    return (await import("../src/ui/layout")).timelineScale();
  }

  it("bigger staff gives the staff most of the room and shrinks the lanes", async () => {
    await settingsWith({ staffBig: true });
    const { staffScale, timelineScale } = await import("../src/ui/layout");
    expect(staffScale()).toBeGreaterThan(1);
    expect(timelineScale()).toBeLessThan(1);
  });

  it("keeps full size from tablets up, and shrinks on phones and short screens", async () => {
    expect(await scaleOn(1440, 900)).toBe(1);
    expect(await scaleOn(768, 1024)).toBe(1);
    expect(await scaleOn(390, 844)).toBe(0.75);
    expect(await scaleOn(844, 390)).toBe(0.6);
  });
});
