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
  // Only when the lanes kept moving, where notesSkipped holds the missed notes, or for a Listen exercise.
  score?: number;
  // A Listen exercise, the note guesser or Technique: it has no notes, only its score.
  exercise?: true;
  // A play-along with nothing heard: only its minutes count.
  playedAlong?: true;
  // The tempo of a Keep moving run.
  bpm?: number;
  // Each pitch's average cents off, sharp above 0, and how many readings that's from. Older entries have none.
  tuning?: Record<string, [cents: number, readings: number]>;
};

export const scorePercent = (hit: number, total: number) => (total === 0 ? 0 : Math.round((hit / total) * 100));

// A scored run as notes hit out of notes judged, to add up with others. A Listen exercise counts as its score out of 100.
export const scoredNotes = (entry: LogEntry) =>
  entry.exercise ? { hit: entry.score!, judged: 100 } : { hit: entry.notesHit, judged: entry.notesHit + entry.notesSkipped };

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
      : session.hits
          .toSorted((a, b) => b.ms - a.ms)
          .slice(0, 3)
          .map((hit) => ({ pitch: hit.pitch, seconds: hit.ms / 1000 })),
    recordingId,
    ...(session.following && { score: scorePercent(session.hits.length, session.hits.length + session.missed), bpm: session.bpm }),
    ...(session.exerciseScore !== undefined && { score: session.exerciseScore, exercise: true as const }),
    ...(session.tuning.size > 0 && {
      tuning: Object.fromEntries([...session.tuning].map(([pitch, { cents, readings }]) => [pitch, [Math.round((cents / readings) * 10) / 10, readings]])),
    }),
  };
}
