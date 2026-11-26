import { localNumber, localTitle, t } from "../i18n";
import type { Piece } from "../music/notes";
import { piecesOn, planDone, summarise } from "../practice/calendar";
import type { LogEntry } from "../practice/log";
import { getRecording, getSettings } from "../storage";
import { planSection } from "./calendarPlan";
import { h } from "./dom";
import { chip, openRecording, timeOf } from "./recordingDialog";
import { CHART_ICON, NOTE_ICON } from "./toggles";

// A piece's runs of one kind on a day, added up, each part its own chip.
const describeRuns = (runs: ReturnType<typeof summarise>[number]) =>
  [
    `${t.runs(runs.runs)}, ${localNumber(runs.minutes, 1)} min`,
    ...(runs.playedAlong
      ? [t.playedAlongRuns]
      : runs.scored
        ? [t.score(runs.score), ...(runs.hit + runs.missed ? [t.hitMissed(runs.hit, runs.missed)] : [])]
        : [t.passes(runs.passes), t.hitSkipped(runs.hit, runs.missed)]),
    runs.averageCents === null ? null : t.centsOff(Math.round(runs.averageCents)),
  ]
    .filter((part) => part !== null)
    .map(chip);

type Options = {
  entries: LogEntry[];
  pieces: Piece[];
  // The plan changed, so the month redraws too.
  onChange: () => void;
  // Paste, pressed: picking days to paste into starts, or ends.
  onPaste: () => void;
};

// The day picked, beside the month: its date and how much of its plan is done, the plan, with its tools, then what was
// practised, each piece with its minutes and recordings, and its runs under the chart button by the day's total.
// Today and later days can be planned.
export function createDayPanel({ entries, pieces, onChange, onPaste }: Options) {
  const settings = getSettings();
  const element = h("section", { className: "day-details" });
  const title = (pieceId: string, fallback = pieceId) => localTitle(pieceId, pieces.find((candidate) => candidate.id === pieceId)?.title ?? fallback);
  // Each piece's runs in full, or just its minutes, kept from day to day.
  let detailed = false;
  const detailsButton = h("button", {
    type: "button",
    className: "day-details-toggle",
    innerHTML: CHART_ICON,
    title: t.fullDetails,
    ariaLabel: t.fullDetails,
    onclick() {
      detailed = !detailed;
      showDetails();
    },
  });
  function showDetails() {
    detailsButton.ariaPressed = String(detailed);
    element.querySelectorAll<HTMLElement>(".day-piece ul").forEach((runs) => (runs.hidden = !detailed));
  }

  function render(selected: string, today: string, picking: boolean) {
    const date = new Date(`${selected}T12:00`);
    const practised = piecesOn(entries, selected);
    const minutesOf = new Map(practised.map((piece) => [piece.pieceId, piece.minutes]));
    const total = practised.reduce((sum, piece) => sum + piece.minutes, 0);
    const plan = settings.plan[selected] ?? [];
    const done = plan.length ? planDone(plan, settings.planTargets[selected], minutesOf) : null;
    const planned = planSection({ day: selected, editable: selected >= today, pieces, practised: minutesOf, onChange, picking, onPaste });

    const pieceBlocks = practised.map((piece) =>
      h(
        "div",
        { className: "day-piece" },
        h("div", { className: "day-piece-title" }, h("strong", {}, title(piece.pieceId, piece.title), ...piece.sessions.filter((session) => session.recordingId).map(recordingButton)), chip(`${localNumber(piece.minutes, 1)} min`)),
        h("ul", {}, ...summarise(piece.sessions).map((runs) => h("li", { className: "chip-row" }, ...describeRuns(runs)))),
      ),
    );
    element.replaceChildren(
      h("div", {}, h("h2", { className: "day-title" }, date.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" })), ...(done ? [h("p", { className: "day-summary" }, t.planDoneOf(done.met, plan.length))] : [])),
      h("div", { className: "day-plan" }, h("p", { className: "panel-heading" }, t.plan, " ", planned.total), h("div", { className: "plan-add" }, ...planned.tools), ...planned.list),
      h("div", {}, h("p", { className: "panel-heading day-total" }, total > 0 ? t.practisedFor(localNumber(total, 1)) : selected > today ? t.notYet : t.nothingPractised, ...(total > 0 ? [detailsButton] : [])), ...pieceBlocks),
    );
    showDetails();
  }

  // A little note by the piece for each recorded run, opening it to play back.
  function recordingButton(entry: LogEntry) {
    const label = t.recordedAt(timeOf(entry));
    const button = h("button", { type: "button", className: "recording-note", innerHTML: NOTE_ICON, title: label, ariaLabel: label });
    getRecording(entry.recordingId!).then((recording) => {
      // One that couldn't be saved, or has since been deleted, has no note.
      if (!recording) return button.remove();
      const piece = pieces.find((candidate) => candidate.id === entry.pieceId);
      button.onclick = () => openRecording(entry, recording, piece, () => button.remove());
    });
    return button;
  }

  return { element, render };
}
