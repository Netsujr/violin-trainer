import { localNumber, localTitle, t } from "../i18n";
import { noteLabels, type Piece } from "../music/notes";
import type { LogEntry } from "../practice/log";
import { progressOf, tuningOf } from "../practice/progress";
import { allPieces, loadLog, pieceGroups } from "../storage";
import { h, type Screen } from "./dom";
import { lineChart } from "./progressChart";

export type GroupKey = ReturnType<typeof pieceGroups>[number][0];

// The tempo chart spans the tempos played, to the nearest 10 either side.
const TEMPO_STEP = 10;

const shortDay = (day: string) => new Date(`${day}T12:00`).toLocaleDateString(t.locale, { day: "numeric", month: "short" });
const chip = (content: string) => h("span", { className: "info-chip" }, content);
const note = (content: string) => h("p", { className: "progress-note" }, content);

// Where the piece plays a pitch, as it's fingered there.
function where(piece: Piece, pitch: string) {
  const fingered = piece.notes.find((candidate) => candidate.pitch === pitch);
  return fingered?.string && fingered.finger ? ` · ${t.onString(t.strings[fingered.string], t.finger(fingered.finger))}` : "";
}

// The notes played out of tune, each a chip saying how far and which way, or that there are none, or not enough to say.
function tuning(piece: Piece, entries: LogEntry[]) {
  const { off, inTune } = tuningOf(entries, piece.id);
  if (!off.length) return [note(inTune ? t.allInTune : t.tuningNeedsMore)];
  const chips = off.map(({ pitch, cents }) => {
    const { letter, solfege } = noteLabels(pitch);
    return chip(`${letter} (${solfege})${where(piece, pitch)} · ${cents > 0 ? t.sharpBy(cents) : t.flatBy(-cents)}`);
  });
  return [h("h4", {}, t.outOfTune), h("div", { className: "chip-row" }, ...chips)];
}

// A piece's days, minutes and last day, then its score and tempo over time, then its out-of-tune notes.
function pieceProgress(piece: Piece, entries: LogEntry[]) {
  const { minutes, daysPractised, lastDay, scored } = progressOf(entries, piece.id);
  const points = (value: (day: (typeof scored)[number]) => number | null) => scored.map((day) => ({ label: shortDay(day.day), value: value(day) }));
  const bpms = scored.flatMap((day) => day.bpm ?? []);
  const tempoRange = { min: Math.floor((Math.min(...bpms) - 5) / TEMPO_STEP) * TEMPO_STEP, max: Math.ceil((Math.max(...bpms) + 5) / TEMPO_STEP) * TEMPO_STEP };
  const charts = scored.length
    ? [
        lineChart(points((day) => day.score), { title: t.scoreChart, min: 0, max: 100, format: (value) => `${value}%` }),
        ...(bpms.length ? [lineChart(points((day) => day.bpm), { title: t.tempoChart, ...tempoRange, format: String })] : []),
      ]
    : [note(t.noScoresYet)];
  return h(
    "article",
    { className: "progress-piece" },
    h(
      "header",
      {},
      h("strong", {}, localTitle(piece.id, piece.title)),
      h("div", { className: "chip-row" }, chip(t.days(daysPractised)), chip(`${localNumber(minutes, 1)} min`), chip(t.lastPractised(shortDay(lastDay!)))),
    ),
    ...charts,
    ...tuning(piece, entries),
  );
}

// How each piece in a Library group is coming along, the most recently practised first, with those not yet practised named at the end.
export function progressScreen(group: GroupKey, back: () => void): Screen {
  const entries = loadLog();
  const pieces = pieceGroups(allPieces()).find(([key]) => key === group)?.[1] ?? [];
  const lastDays = new Map(pieces.map((piece) => [piece.id, progressOf(entries, piece.id).lastDay]));
  const practised = pieces.filter((piece) => lastDays.get(piece.id)).sort((a, b) => lastDays.get(b.id)!.localeCompare(lastDays.get(a.id)!));
  const notYet = pieces.filter((piece) => !lastDays.get(piece.id)).map((piece) => localTitle(piece.id, piece.title));

  return {
    element: h(
      "section",
      { className: "progress" },
      h("button", { type: "button", className: "link-button", textContent: `‹ ${t.screens.Library}`, onclick: back }),
      h("h2", {}, t.progressOf(t[group])),
      ...practised.map((piece) => pieceProgress(piece, entries)),
      ...(notYet.length ? [note(t.notPractisedYet(notYet.join(", ")))] : []),
    ),
    leave() {},
  };
}
