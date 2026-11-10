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
