import { afterEach, describe, expect, it, vi } from "vitest";

// A fresh copy of the settings module, with saved settings and a browser language of our choosing.
async function settingsWith(stored: object | null, language = "en-US") {
  vi.resetModules();
  const values = new Map<string, string>(stored ? [["settings", JSON.stringify(stored)]] : []);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("navigator", { language });
  const { getSettings, saveSettings, backupJson, restoreBackup } = await import("../src/storage");
  return { getSettings, saveSettings, backupJson, restoreBackup, values };
}

afterEach(() => vi.unstubAllGlobals());

describe("passCents", () => {
  it("counts out to yellow's edge, or only green with yellow off or set inside green", async () => {
    const { passCents } = await import("../src/storage");
    expect(passCents({ greenCents: 10, toleranceCents: 40, yellowOn: true })).toBe(40);
    expect(passCents({ greenCents: 10, toleranceCents: 40, yellowOn: false })).toBe(10);
    expect(passCents({ greenCents: 20, toleranceCents: 15, yellowOn: true })).toBe(20);
  });
});

describe("count-in", () => {
  it("defaults to one bar, and moves a count no longer offered up to the next choice", async () => {
    expect((await settingsWith(null)).getSettings().countInBeats).toBe(4);
    expect((await settingsWith({ countInBeats: 3 })).getSettings().countInBeats).toBe(4);
    expect((await settingsWith({ countInBeats: 1 })).getSettings().countInBeats).toBe(2);
    expect((await settingsWith({ countInBeats: 6 })).getSettings().countInBeats).toBe(6);
    expect((await settingsWith({ countInBeats: 12 })).getSettings().countInBeats).toBe(10);
  });
});

describe("Listen's mode", () => {
  it("opens on free play, and on the note guesser when it was switched on before Listen had three modes", async () => {
    expect((await settingsWith(null)).getSettings().listenMode).toBe("free");
    expect((await settingsWith({ guesserOn: true })).getSettings().listenMode).toBe("guesser");
    expect((await settingsWith({ guesserOn: true, listenMode: "technique" })).getSettings().listenMode).toBe("technique");
  });
});

describe("Listen's panels", () => {
  it("open with the staff big, the fingerboard small and the tuner on", async () => {
    expect((await settingsWith(null)).getSettings().listenPanels).toEqual({ staff: "big", board: "small", tuner: true });
  });

  it("carry over the view Listen's one button showed before, and the guesser's before that, with the tuner on", async () => {
    expect((await settingsWith({ listenView: "staff" })).getSettings().listenPanels).toEqual({ staff: "big", board: "off", tuner: true });
    expect((await settingsWith({ listenView: "both" })).getSettings().listenPanels).toEqual({ staff: "big", board: "small", tuner: true });
    expect((await settingsWith({ listenView: "board" })).getSettings().listenPanels).toEqual({ staff: "off", board: "big", tuner: true });
    expect((await settingsWith({ guesserView: "board" })).getSettings().listenPanels).toEqual({ staff: "off", board: "big", tuner: true });
  });

  it("let go of the views they replaced once carried over", async () => {
    const { getSettings, saveSettings, values } = await settingsWith({ listenView: "both", staffBig: true, staffOnly: false, todayPlanOpen: false });
    saveSettings();
    const saved = JSON.parse(values.get("settings")!);
    expect(["listenView", "staffBig", "staffOnly", "todayPlanOpen"].some((key) => key in saved)).toBe(false);
    expect(getSettings().practicePanels.staff).toBe("big");
  });

  it("keep panels already saved", async () => {
    const panels = { staff: "small", board: "small", tuner: false };
    expect((await settingsWith({ listenView: "board", listenPanels: panels })).getSettings().listenPanels).toEqual(panels);
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
    expect(groups.map(([key, pieces]) => [key, pieces.length])).toEqual([["scales", 17], ["songs", 8], ["customSongs", 2]]);
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
    expect(getSettings()).toMatchObject({ toleranceCents: 40, holdMs: 200, tempoOn: false, metronomeOn: false, bpm: 60, pattern: 0, staffOpen: false, sidebarIcons: false });
    expect(getSettings().countInOn).toBe(true);
    expect(getSettings().toggles).toMatchObject({ fingers: true, noteNames: true, letterNames: true });
  });

  it("gives a switch added later its default on older saved settings", async () => {
    const { getSettings } = await settingsWith({ toggles: { fingers: false, noteNames: true } });
    expect(getSettings().toggles.fingers).toBe(false);
    expect(getSettings().toggles.letterNames).toBe(true);
  });

  it("picks the language from the browser until one is saved", async () => {
    expect((await settingsWith(null, "pt-BR")).getSettings().language).toBe("pt");
    expect((await settingsWith(null, "fr-FR")).getSettings().language).toBe("en");
    expect((await settingsWith({ language: "en" }, "pt-BR")).getSettings().language).toBe("en");
  });

  it("saves what changed", async () => {
    const { getSettings, saveSettings, values } = await settingsWith(null);
    getSettings().bpm = 72;
    saveSettings();
    expect(JSON.parse(values.get("settings")!).bpm).toBe(72);
  });
});

describe("Practice's panels", () => {
  it("open with the lanes big and the staff small, the fingerboard and tuner off", async () => {
    expect((await settingsWith(null)).getSettings().practicePanels).toEqual({ lanes: "big", staff: "small", board: "off", tuner: false });
  });

  it("carry over a bigger staff, and the staff alone, from before Practice had panels", async () => {
    expect((await settingsWith({ staffBig: true })).getSettings().practicePanels).toEqual({ lanes: "small", staff: "big", board: "off", tuner: false });
    expect((await settingsWith({ staffBig: true, staffOnly: true })).getSettings().practicePanels).toEqual({ lanes: "off", staff: "big", board: "off", tuner: false });
    expect((await settingsWith({ staffBig: false, staffOnly: false })).getSettings().practicePanels).toEqual({ lanes: "big", staff: "small", board: "off", tuner: false });
  });
});

describe("backups", () => {
  it("hold the settings, pieces and log, and put them back in place of what's there", async () => {
    const { backupJson, restoreBackup, values } = await settingsWith({ bpm: 90 });
    values.set("log", JSON.stringify([{ id: "a", minutes: 2 }]));
    values.set("pieceDraft", JSON.stringify({ title: "draft" }));
    const backup = backupJson();
    expect(JSON.parse(backup)).toMatchObject({ app: "violin-trainer", settings: { bpm: 90 }, pieces: null, log: [{ id: "a" }] });
    expect(backup).not.toContain("draft");

    values.set("log", JSON.stringify([]));
    values.set("pieces", JSON.stringify([{ id: "mine" }]));
    expect(restoreBackup(backup)).toBe(true);
    expect(JSON.parse(values.get("log")!)).toEqual([{ id: "a", minutes: 2 }]);
    expect(values.has("pieces")).toBe(false);
  });

  it("refuses a file that isn't one, leaving everything as it was", async () => {
    const { restoreBackup, values } = await settingsWith({ bpm: 90 });
    for (const text of ["not json", "{}", JSON.stringify({ app: "violin-trainer", log: "nope", settings: {} }), JSON.stringify({ app: "other", log: [], settings: {} })]) {
      expect(restoreBackup(text)).toBe(false);
    }
    expect(JSON.parse(values.get("settings")!)).toEqual({ bpm: 90 });
  });
});
