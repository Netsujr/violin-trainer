import { describe, expect, it } from "vitest";
import type { Piece } from "../src/music/notes";
import { buildEntry, scorePercent } from "../src/practice/log";
import { Session } from "../src/practice/session";

const piece: Piece = { id: "p", title: "P", source: "test", notes: [{ pitch: "D4" }, { pitch: "E4" }, { pitch: "F#4" }, { pitch: "G4" }] };

describe("session and log entry", () => {
  it("in tempo mode, starts the next note on the beat but keeps the real time of the hit", () => {
    const session = new Session(piece, 0);
    session.hit(10, 300, 1000);
    expect(session.hits[0]).toMatchObject({ ms: 300, at: 300 });
    session.hit(10, 1250, 2000);
    expect(session.hits[1].ms).toBe(250);
  });

  it("does not time a rhythm pattern as a pass, so pass times stay comparable", () => {
    const session = new Session({ ...piece, pattern: 3 }, 0);
    session.jumpTo(0, 0);
    for (const now of [1000, 2000, 3000, 4000]) session.hit(10, now);
    expect(session.finished).toBe(true);
    expect(session.lastRunSeconds).toBe(4);
    expect(session.passSeconds).toEqual([]);
  });

  it("jumps without counting a hit or a miss, and times a partial run but not as a pass", () => {
    const session = new Session(piece, 0);
    session.hit(10, 1000);
    session.jumpTo(2, 5000);
    expect(session.current.pitch).toBe("F#4");
    session.hit(10, 6000);
    session.hit(10, 8000);
    expect(session.finished).toBe(true);
    expect(session.lastRunSeconds).toBe(3);
    expect(session.passSeconds).toEqual([]);
    expect(session.missed).toBe(0);
    expect(session.hits.map((hit) => hit.ms)).toEqual([1000, 1000, 2000]);
    expect(buildEntry(session, 8000).passes).toBe(0);
    expect(buildEntry(session, 8000).averagePassSeconds).toBeNull();
  });

  it("counts a whole pass again after jumping back to note 1", () => {
    const session = new Session(piece, 0);
    session.jumpTo(2, 1000);
    session.jumpTo(0, 2000);
    for (const now of [3000, 4000, 5000, 6000]) session.hit(10, now);
    expect(session.passSeconds).toEqual([4]);
  });

  it("finishes at the end of a section, which isn't timed as a pass", () => {
    const session = new Session(piece, 0);
    session.jumpTo(0, 0, 1);
    expect(session.finished).toBe(false);
    session.hit(10, 1000);
    expect(session.finished).toBe(true);
    expect(session.index).toBe(1);
    expect(session.lastRunSeconds).toBe(1);
    expect(session.passSeconds).toEqual([]);
    session.jumpTo(0, 2000);
    expect(session.finished).toBe(false);
  });

  it("records a score, not a timed pass or slowest notes, when the lanes keep moving", () => {
    const session = new Session(piece, 0);
    session.following = true;
    session.jumpTo(0, 0);
    session.hit(10, 1000);
    session.miss(2000);
    session.hit(10, 3000);
    session.hit(10, 4000);
    expect(session.finished).toBe(true);
    expect(buildEntry(session, 60000)).toMatchObject({ score: 75, passes: 0, averagePassSeconds: null, slowest: [], notesHit: 3, notesSkipped: 1 });
  });

  it("has no score when waiting for each note", () => {
    const session = new Session(piece, 0);
    expect(buildEntry(session, 1000).score).toBeUndefined();
  });

  it("works out a percentage, rounded, with nothing played as 0", () => {
    expect(scorePercent(13, 15)).toBe(87);
    expect(scorePercent(15, 15)).toBe(100);
    expect(scorePercent(0, 0)).toBe(0);
  });

  it("summarises a session", () => {
    const session = new Session(piece, 0);
    session.hit(10, 1000);
    session.hit(20, 6000);
    session.miss(7000);
    session.hit(30, 9000);
    expect(session.finished).toBe(true);

    const log = buildEntry(session, 60000, "recording");
    expect(log).toMatchObject({
      pieceId: "p",
      minutes: 1,
      passes: 1,
      notesHit: 3,
      notesSkipped: 1,
      averageCents: 20,
      averagePassSeconds: 9,
      recordingId: "recording",
    });
    expect(log.slowest).toEqual([
      { pitch: "E4", seconds: 5 },
      { pitch: "G4", seconds: 2 },
      { pitch: "D4", seconds: 1 },
    ]);
  });

  it("counts each finished pass", () => {
    const session = new Session(piece, 0);
    for (const now of [1, 2, 3, 4]) session.hit(0, now * 1000);
    session.jumpTo(0, 5000);
    expect(session.index).toBe(0);
    for (const now of [6, 7, 8, 9]) session.hit(0, now * 1000);
    expect(buildEntry(session, 10000).passes).toBe(2);
    expect(session.passSeconds).toEqual([4, 4]);
  });

  it("has no averages for free play", () => {
    const log = buildEntry(new Session({ ...piece, notes: [] }, 0), 1000);
    expect(log).toMatchObject({ passes: 0, notesHit: 0, averageCents: null, averagePassSeconds: null, slowest: [] });
  });
});
