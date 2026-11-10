import { localNumber, t } from "../../i18n";
import { noteLabels } from "../../music/notes";
import { buildEntry, scorePercent } from "../../practice/log";
import type { Session } from "../../practice/session";
import { h } from "../dom";
import type { Section } from "../highway";

// The card after a "Don't wait" run: the score, and how many notes were hit and missed.
export function scoreCard(results: Map<number, boolean>) {
  const hit = [...results.values()].filter(Boolean).length;
  return [h("p", { className: "score" }, t.score(scorePercent(hit, results.size))), h("p", {}, t.hitMissed(hit, results.size - hit))];
}

// The card after playing along with a backing track, with nothing heard.
export const playedAlongCard = () => [h("p", {}, t.playedAlong)];

// The card after a run that waited for each note: how long it took, how in tune it was, and the slowest notes.
export function statsCard(session: Session, run: { section: Section | null; pattern?: number; startIndex: number }) {
  const entry = buildEntry(session, performance.now());
  const slowest = entry.slowest.map((note) => `${noteLabels(note.pitch).solfege} (${localNumber(note.seconds, 1)} s)`).join(", ");
  const seconds = localNumber(session.lastRunSeconds, 0);
  return [
    h("p", {}, runSummary(entry.passes, seconds, run)),
    h("p", {}, t.summary(t.hitSkipped(entry.notesHit, 0), Math.round(entry.averageCents ?? 0))),
    h("p", {}, t.slowest(slowest)),
  ];
}

function runSummary(passes: number, seconds: string, { section, pattern, startIndex }: { section: Section | null; pattern?: number; startIndex: number }) {
  if (section) return t.sectionDone(section.first + 1, section.last + 1, seconds);
  if (pattern) return t.patternDone(pattern + 1, seconds);
  return startIndex === 0 ? t.passDone(passes, seconds) : t.partialDone(startIndex + 1, seconds);
}
