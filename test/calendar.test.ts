import { describe, expect, it } from "vitest";
import { dayKey, minutesByDay, monthGrid, piecesOn, planProgress, summarise } from "../src/practice/calendar";
import type { LogEntry } from "../src/practice/log";

const entry = (startedAt: Date, pieceId: string, minutes: number): LogEntry => ({
  id: `${pieceId}-${startedAt.getTime()}`,
  startedAt: startedAt.toISOString(),
  pieceId,
  pieceTitle: pieceId.toUpperCase(),
  minutes,
  passes: 1,
  notesHit: 10,
  notesSkipped: 0,
  averageCents: 5,
  averagePassSeconds: 20,
  slowest: [],
});

describe("calendar", () => {
  it("names a day by its local date", () => {
    expect(dayKey(new Date(2026, 10, 10, 23, 59))).toBe("2026-11-10");
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("lays a month out in whole weeks from Monday", () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const days = monthGrid(2026, 10);
    expect(days.length % 7).toBe(0);
    expect(days[0].getDay()).toBe(1);
    expect(dayKey(days[0])).toBe("2026-10-26");
    expect(dayKey(days.at(-1)!)).toBe("2026-12-06");
    expect(days.filter((day) => day.getMonth() === 10)).toHaveLength(30);
  });

  it("adds up the minutes on each day", () => {
    const minutes = minutesByDay([entry(new Date(2026, 10, 10, 9), "a", 2), entry(new Date(2026, 10, 10, 21), "b", 3.5), entry(new Date(2026, 10, 11, 8), "a", 1)]);
    expect(minutes.get("2026-11-10")).toBe(5.5);
    expect(minutes.get("2026-11-11")).toBe(1);
    expect(minutes.get("2026-11-12")).toBeUndefined();
  });

  it("groups a day's sessions by piece, the longest practised first", () => {
    const pieces = piecesOn([entry(new Date(2026, 10, 10, 9), "a", 1), entry(new Date(2026, 10, 10, 10), "b", 4), entry(new Date(2026, 10, 10, 11), "a", 2), entry(new Date(2026, 10, 11, 9), "a", 9)], "2026-11-10");
    expect(pieces.map((piece) => [piece.pieceId, piece.minutes, piece.sessions.length])).toEqual([
      ["b", 4, 1],
      ["a", 3, 2],
    ]);
  });

  it("adds a piece's runs up into one line per kind, the score and cents weighted by the notes", () => {
    const scored = (minutes: number, hit: number, missed: number, cents: number | null): LogEntry => ({ ...entry(new Date(2026, 10, 10, 9), "a", minutes), passes: 0, notesHit: hit, notesSkipped: missed, averageCents: cents, score: 0 });
    const lines = summarise([scored(1, 45, 5, 10), scored(0.5, 5, 45, 20), scored(0.1, 0, 10, null), entry(new Date(2026, 10, 10, 10), "a", 2)]);
    expect(lines).toHaveLength(2);
    const [moving, waited] = lines;
    expect(moving).toMatchObject({ scored: true, runs: 3, passes: 0, hit: 50, missed: 60 });
    expect(moving.minutes).toBeCloseTo(1.6);
    expect(moving.averageCents).toBe(11);
    expect(waited).toMatchObject({ scored: false, runs: 1, minutes: 2, passes: 1, hit: 10, missed: 0, averageCents: 5 });
  });

  it("marks a planned piece done at its target, or with none once practised, and part done in between", () => {
    expect(planProgress(0, 10)).toEqual({ status: "○", percent: 0 });
    expect(planProgress(5, 10)).toEqual({ status: "◐", percent: 50 });
    expect(planProgress(12, 10)).toEqual({ status: "✓", percent: 100 });
    expect(planProgress(0)).toEqual({ status: "○", percent: 0 });
    expect(planProgress(2)).toEqual({ status: "✓", percent: 0 });
  });
});
