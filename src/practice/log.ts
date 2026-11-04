import type { Piece } from "../music/notes";
import type { Session } from "./session";

export type LogEntry = {
  id: string;
  startedAt: string;
  pieceId: string;
  pieceTitle: string;
  minutes: number;
  passes: number;
  notesHit: number;
  notesSkipped: number;
  averageCents: number | null;
  averagePassSeconds: number | null;
  slowest: { pitch: string; seconds: number }[];
  recordingId?: string;
  // Only when the lanes kept moving, where notesSkipped holds the missed notes.
  score?: number;
};

export const scorePercent = (hit: number, total: number) => (total === 0 ? 0 : Math.round((hit / total) * 100));

const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildEntry(session: Session, now: number, recordingId?: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    startedAt: session.startedAtIso,
    pieceId: session.piece.id,
    pieceTitle: session.piece.title,
    minutes: (now - session.startedAt) / 60000,
    passes: session.passSeconds.length,
    notesHit: session.hits.length,
    notesSkipped: session.missed,
    averageCents: average(session.hits.map((hit) => hit.cents)),
    averagePassSeconds: average(session.passSeconds),
    slowest: session.following
      ? []
      : [...session.hits]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 3)
          .map((hit) => ({ pitch: hit.pitch, seconds: hit.ms / 1000 })),
    recordingId,
    ...(session.following && { score: scorePercent(session.hits.length, session.hits.length + session.missed) }),
  };
}

function daysOfWeek(today: Date) {
  const monday = today.getDate() - ((today.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, offset) => new Date(today.getFullYear(), today.getMonth(), monday + offset));
}

const sameDay = (entry: LogEntry, day: Date) => new Date(entry.startedAt).toDateString() === day.toDateString();

export function weekMinutes(entries: LogEntry[], today: Date) {
  return daysOfWeek(today).map((day) => ({
    day,
    minutes: entries.filter((entry) => sameDay(entry, day)).reduce((sum, entry) => sum + entry.minutes, 0),
  }));
}

export function plannedThisWeek(pieces: Piece[], targetDays: Record<string, number>, entries: LogEntry[], today: Date) {
  const week = daysOfWeek(today);
  return pieces
    .filter((piece) => targetDays[piece.id] !== undefined)
    .map((piece) => ({
      title: piece.title,
      day: targetDays[piece.id],
      practised: entries.some((entry) => entry.pieceId === piece.id && week.some((day) => sameDay(entry, day))),
    }));
}

export function pieceTrends(entries: LogEntry[]) {
  const trends = new Map<string, LogEntry[]>();
  for (const entry of [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (entry.notesHit > 0) trends.set(entry.pieceTitle, [...(trends.get(entry.pieceTitle) ?? []), entry]);
  }
  return [...trends].map(([title, sessions]) => ({ title, sessions }));
}
