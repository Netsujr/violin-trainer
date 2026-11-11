import type { LogEntry } from "./log";

// A day as "2026-11-10", in local time, so a session late in the evening counts for the day it was played.
export function dayKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const entryDay = (entry: LogEntry) => dayKey(new Date(entry.startedAt));

// The days to show for a month: whole weeks, Monday to Sunday, from the week of its first day to the week of its last.
export function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const days: Date[] = [];
  for (let day = start; day <= last || days.length % 7 !== 0; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) days.push(day);
  return days;
}

export function minutesByDay(entries: LogEntry[]) {
  const minutes = new Map<string, number>();
  for (const entry of entries) minutes.set(entryDay(entry), (minutes.get(entryDay(entry)) ?? 0) + entry.minutes);
  return minutes;
}

// What was practised on a day: each piece once, with its time and its sessions, the longest first.
export function piecesOn(entries: LogEntry[], day: string) {
  const pieces = new Map<string, { pieceId: string; title: string; minutes: number; sessions: LogEntry[] }>();
  for (const entry of entries.filter((candidate) => entryDay(candidate) === day)) {
    const piece = pieces.get(entry.pieceId) ?? { pieceId: entry.pieceId, title: entry.pieceTitle, minutes: 0, sessions: [] };
    piece.minutes += entry.minutes;
    piece.sessions.push(entry);
    pieces.set(entry.pieceId, piece);
  }
  return [...pieces.values()].sort((a, b) => b.minutes - a.minutes);
}

// A piece's sessions on a day, added up into one line for each kind: runs that kept moving and were scored, and runs that
// waited for each note. The score comes from all the notes together, so a long run counts for more than a short one,
// and the cents are the average over every note hit.
export function summarise(sessions: LogEntry[]) {
  const kinds = [sessions.filter((session) => session.score !== undefined), sessions.filter((session) => session.score === undefined)];
  return kinds
    .filter((runs) => runs.length > 0)
    .map((runs) => {
      const sum = (pick: (run: LogEntry) => number) => runs.reduce((total, run) => total + pick(run), 0);
      const hit = sum((run) => run.notesHit);
      const centsWeight = sum((run) => (run.averageCents === null ? 0 : run.notesHit));
      return {
        scored: runs[0].score !== undefined,
        runs: runs.length,
        minutes: sum((run) => run.minutes),
        passes: sum((run) => run.passes),
        hit,
        // The missed notes of a scored run, or the skipped ones of a run that waited.
        missed: sum((run) => run.notesSkipped),
        averageCents: centsWeight === 0 ? null : sum((run) => (run.averageCents ?? 0) * run.notesHit) / centsWeight,
      };
    });
}

// How far a planned piece has got: ✓ once its target is met (or, with none, once it's practised at all), ◐ partway,
// ○ not started; and the share of its target done, as a percentage.
export function planProgress(done: number, target?: number) {
  const met = target === undefined ? done > 0 : done >= target;
  return { status: met ? "✓" : done > 0 ? "◐" : "○", percent: target ? Math.min(100, (done / target) * 100) : 0 };
}
