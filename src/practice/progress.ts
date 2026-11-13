import { entryDay } from "./calendar";
import { scorePercent, type LogEntry } from "./log";

// The most recent practice days a chart shows.
export const CHART_DAYS = 30;
// A note needs this many readings, about 2 seconds of playing it, before its tuning says anything.
export const MIN_READINGS = 120;
// Closer than this on average, a note counts as in tune.
export const OFF_CENTS = 8;

export type DayProgress = { day: string; score: number | null; bpm: number | null };

// A piece over time: how much, how often, and when it was last practised, and each day's "Don't wait" score, from
// all that day's notes, with the fastest tempo it was played at. Only days with a score are charted, the last 30.
export function progressOf(entries: LogEntry[], pieceId: string) {
  const mine = entries.filter((entry) => entry.pieceId === pieceId);
  const days = new Map<string, { hit: number; judged: number; bpm: number | null }>();
  for (const entry of mine.filter((candidate) => candidate.score !== undefined)) {
    const day = days.get(entryDay(entry)) ?? { hit: 0, judged: 0, bpm: null };
    const bpm = entry.bpm === undefined ? day.bpm : Math.max(day.bpm ?? 0, entry.bpm);
    days.set(entryDay(entry), { hit: day.hit + entry.notesHit, judged: day.judged + entry.notesHit + entry.notesSkipped, bpm });
  }
  const scored: DayProgress[] = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-CHART_DAYS)
    .map(([day, { hit, judged, bpm }]) => ({ day, score: judged ? scorePercent(hit, judged) : null, bpm }));
  return {
    minutes: mine.reduce((sum, entry) => sum + entry.minutes, 0),
    daysPractised: new Set(mine.map(entryDay)).size,
    lastDay: mine.map(entryDay).sort().at(-1) ?? null,
    scored,
  };
}

// The notes of a piece played out of tune: each pitch's average over every run, from enough readings, off by 8 cents or
// more, the furthest first. inTune says there was enough to go on and nothing was off.
export function tuningOf(entries: LogEntry[], pieceId: string) {
  const pitches = new Map<string, { cents: number; readings: number }>();
  for (const entry of entries.filter((candidate) => candidate.pieceId === pieceId && candidate.tuning)) {
    for (const [pitch, [cents, readings]] of Object.entries(entry.tuning!)) {
      const sounded = pitches.get(pitch) ?? { cents: 0, readings: 0 };
      pitches.set(pitch, { cents: sounded.cents + cents * readings, readings: sounded.readings + readings });
    }
  }
  const heard = [...pitches]
    .filter(([, { readings }]) => readings >= MIN_READINGS)
    .map(([pitch, { cents, readings }]) => ({ pitch, cents: Math.round(cents / readings) }));
  const off = heard.filter(({ cents }) => Math.abs(cents) >= OFF_CENTS).sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
  return { off, inTune: heard.length > 0 && off.length === 0 };
}
