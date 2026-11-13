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
  // A play-along with nothing heard: only its minutes count.
  playedAlong?: true;
  // The tempo of a "Don't wait" run.
  bpm?: number;
  // Each pitch's average cents off, sharp above 0, and how many readings that's from. Older entries have none.
  tuning?: Record<string, [cents: number, readings: number]>;
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
    ...(session.following && { score: scorePercent(session.hits.length, session.hits.length + session.missed), bpm: session.bpm }),
    ...(session.tuning.size > 0 && {
      tuning: Object.fromEntries([...session.tuning].map(([pitch, { cents, readings }]) => [pitch, [Math.round((cents / readings) * 10) / 10, readings]])),
    }),
  };
}
