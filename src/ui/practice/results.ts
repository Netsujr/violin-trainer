import { localNumber, t } from "../../i18n";
import { noteLabels } from "../../music/notes";
import { buildEntry, scorePercent } from "../../practice/log";
import type { Session } from "../../practice/session";
import { h } from "../dom";
import type { Section } from "../highway";

function tally(results: Map<number, boolean>) {
  const hit = [...results.values()].filter(Boolean).length;
  return { hit, missed: results.size - hit, percent: scorePercent(hit, results.size) };
}

// The score and its counts on one line, for the bar above the lanes. Empty until a note is judged.
export function scoreLine(results: Map<number, boolean> | null) {
  if (!results?.size) return "";
  const { hit, missed, percent } = tally(results);
  return `${t.score(percent)} · ${t.hitMissed(hit, missed)}`;
}

// The card after a "Don't wait" run: the score, and how many notes were hit and missed.
export function scoreCard(results: Map<number, boolean>) {
  const { hit, missed, percent } = tally(results);
  return [h("p", { className: "score" }, t.score(percent)), h("p", {}, t.hitMissed(hit, missed))];
}

// Any of the cards above, with Play again, and a ✕ to close it. The ✕ only shows in fullscreen, where it covers the lanes.
export function resultsCard(card: Node[], onPlayAgain: () => void, onClose: () => void) {
  return [
    h("button", { type: "button", className: "stats-close", textContent: "✕", title: t.close, ariaLabel: t.close, onclick: onClose }),
    ...card,
    h("button", { textContent: t.playAgain, onclick: onPlayAgain }),
  ];
}

// The card after playing along with a backing track, with nothing heard.
export const playedAlongCard = () => [h("p", {}, t.playedAlong)];

type Run = { section: Section | null; pattern?: number; startIndex: number };

// What a run that waited for each note comes to: how long it took, how in tune it was, and the slowest notes.
function summary(session: Session, run: Run) {
  const entry = buildEntry(session, performance.now());
  const seconds = localNumber(session.lastRunSeconds, 0);
  return {
    done: runSummary(entry.passes, seconds, run),
    totals: t.summary(t.hitSkipped(entry.notesHit, 0), Math.round(entry.averageCents ?? 0)),
    slowest: t.slowest(entry.slowest.map((note) => `${noteLabels(note.pitch).solfege} (${localNumber(note.seconds, 1)} s)`).join(", ")),
  };
}

// A run's result: on the bar above the lanes, and in fullscreen, where that bar is hidden, as a card over the lanes.
export function createResults(board: { showScore(text: string): void }, onPlayAgain: () => void) {
  const element = h("div", { className: "stats" });
  return {
    element,
    // The score so far, as notes are judged. A play-along with nothing heard has none.
    live: (results: Map<number, boolean> | null) => board.showScore(scoreLine(results)),
    show(session: Session, { results, listening, ...run }: Run & { results: Map<number, boolean> | null; listening: boolean }) {
      const waited = !results && listening ? summary(session, run) : null;
      board.showScore(!listening ? t.playedAlong : waited ? `${waited.done} ${waited.totals}` : scoreLine(results));
      const card = !listening ? playedAlongCard() : waited ? [waited.done, waited.totals, waited.slowest].map((line) => h("p", {}, line)) : scoreCard(results!);
      element.replaceChildren(...resultsCard(card, onPlayAgain, () => element.replaceChildren()));
    },
    clear() {
      element.replaceChildren();
      board.showScore("");
    },
  };
}

function runSummary(passes: number, seconds: string, { section, pattern, startIndex }: { section: Section | null; pattern?: number; startIndex: number }) {
  if (section) return t.sectionDone(section.first + 1, section.last + 1, seconds);
  if (pattern) return t.patternDone(pattern + 1, seconds);
  return startIndex === 0 ? t.passDone(passes, seconds) : t.partialDone(startIndex + 1, seconds);
}
