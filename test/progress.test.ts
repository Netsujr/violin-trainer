import { describe, expect, it } from "vitest";
import type { Piece } from "../src/music/notes";
import { buildEntry, type LogEntry } from "../src/practice/log";
import { CHART_DAYS, progressOf, tuningOf } from "../src/practice/progress";
import { Session } from "../src/practice/session";

const run = (day: number, extra: Partial<LogEntry> = {}, pieceId = "hills"): LogEntry => ({
  id: `${pieceId}-${day}-${Math.random()}`,
  startedAt: new Date(2026, 10, day, 10).toISOString(),
  pieceId,
  pieceTitle: pieceId,
  minutes: 2,
  passes: 0,
  notesHit: 8,
  notesSkipped: 2,
  averageCents: 5,
  averagePassSeconds: null,
  slowest: [],
  ...extra,
});

describe("progress", () => {
  it("scores each day from all its notes, with the fastest tempo, and leaves out waited runs and other pieces", () => {
    const entries = [
      run(3, { score: 80, bpm: 60 }),
      run(3, { score: 100, notesHit: 10, notesSkipped: 0, bpm: 72 }),
      run(4), // waited, so no score
      run(5, { score: 50, notesHit: 5, notesSkipped: 5 }), // before tempo was logged
      run(5, { score: 100 }, "ode"),
    ];
    const progress = progressOf(entries, "hills");
    expect(progress.scored).toEqual([
      { day: "2026-11-03", score: 90, bpm: 72 },
      { day: "2026-11-05", score: 50, bpm: null },
    ]);
    expect(progress).toMatchObject({ minutes: 8, daysPractised: 3, lastDay: "2026-11-05" });
  });

  it("charts only the last 30 scored days", () => {
    const entries = Array.from({ length: 40 }, (_, day) => run(day + 1, { score: 90 }));
    const { scored } = progressOf(entries, "hills");
    expect(scored).toHaveLength(CHART_DAYS);
    expect(scored[0].day).toBe(progressOf(entries.slice(10), "hills").scored[0].day);
  });

  it("has nothing for a piece never played", () => {
    expect(progressOf([run(3)], "ode")).toEqual({ minutes: 0, daysPractised: 0, lastDay: null, scored: [] });
  });

  it("finds the notes played out of tune across runs, weighted by readings, the furthest first", () => {
    const entries = [
      run(3, { tuning: { "F#4": [20, 100], E4: [-12, 200], D4: [3, 300], G4: [-30, 50] } }),
      run(4, { tuning: { "F#4": [10, 100] } }),
    ];
    // G4 has too few readings to say.
    expect(tuningOf(entries, "hills")).toEqual({ off: [{ pitch: "F#4", cents: 15 }, { pitch: "E4", cents: -12 }], inTune: false });
  });

  it("says in tune once there's enough to go on and nothing is off, and nothing before then", () => {
    expect(tuningOf([run(3, { tuning: { D4: [4, 500] } })], "hills")).toEqual({ off: [], inTune: true });
    expect(tuningOf([run(3, { tuning: { D4: [20, 10] } }), run(4)], "hills")).toEqual({ off: [], inTune: false });
  });
});

describe("what a run keeps for progress", () => {
  const piece: Piece = { id: "p", title: "P", source: "test", notes: [{ pitch: "D4" }, { pitch: "E4" }] };

  it("keeps each pitch's signed cents, near misses included, and leaves out wrong notes and silence", () => {
    const session = new Session(piece, 0);
    [10, 30, 70, null, -40].forEach((cents) => session.heard(cents));
    session.hit(10, 1000);
    session.heard(-6);
    expect(buildEntry(session, 2000).tuning).toEqual({ D4: [0, 3], E4: [-6, 1] });
  });

  it("keeps the tempo of a Don't wait run, but not of a waited one", () => {
    const session = new Session(piece, 0);
    session.bpm = 80;
    expect(buildEntry(session, 1000).bpm).toBeUndefined();
    session.following = true;
    expect(buildEntry(session, 1000)).toMatchObject({ bpm: 80, score: 0 });
    expect(buildEntry(session, 1000).tuning).toBeUndefined();
  });
});
