import { localNumber, localTitle, t } from "../i18n";
import type { Piece } from "../music/notes";
import { piecesOn, planDone, summarise } from "../practice/calendar";
import type { LogEntry } from "../practice/log";
import { deleteRecording, getRecording, getSettings, type Recording, type RecordingView } from "../storage";
import { planSection } from "./calendarPlan";
import { confirmAction } from "./confirm";
import { h } from "./dom";
import { CHART_ICON, EXPAND_ICON, LANES_ICON, NOTE_ICON, SHEET_ICON, STAFF_ICON } from "./toggles";
import { waveformPlayer } from "./waveform";

// A bit of what was practised, as a small rounded chip.
const chip = (content: string | Node) => h("span", { className: "info-chip" }, content);

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

const timeOf = (entry: LogEntry) => new Date(entry.startedAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" });

// Chrome records WebM and Safari MP4.
const recordingName = (entry: LogEntry, blob: Blob) =>
  `${localTitle(entry.pieceId, entry.pieceTitle)} ${entry.startedAt.slice(0, 16).replace(":", "-")}.${blob.type.includes("mp4") ? "m4a" : "webm"}`;

function makeSeekable(audio: HTMLAudioElement) {
  audio.addEventListener(
    "loadedmetadata",
    () => {
      if (audio.duration !== Infinity) return;

      audio.addEventListener("timeupdate", () => (audio.currentTime = 0), { once: true });
      audio.currentTime = Number.MAX_SAFE_INTEGER;
    },
    { once: true },
  );
}

const VIEWS: Record<RecordingView, [icon: string, label: () => string]> = {
  lanes: [LANES_ICON, () => t.lanesAndStaff],
  bigStaff: [STAFF_ICON, () => t.biggerStaff],
  staffOnly: [SHEET_ICON, () => t.staffOnly],
};
const viewIcon = (icon: string, label: string) => h("span", { className: "info-chip recording-view", innerHTML: icon, title: label, ariaLabel: label, role: "img" });

// How the practice screen looked when it was recorded, as icons: the view, and fullscreen if it was.
function recordingViews({ view, fullscreen }: Recording) {
  if (!view) return [];
  const [icon, label] = VIEWS[view];
  return [viewIcon(icon, label()), ...(fullscreen ? [viewIcon(EXPAND_ICON, t.fullscreen)] : [])];
}

// How a recorded run went: its score with Keep moving, or the notes played when it waited for each.
const runResult = (entry: LogEntry) =>
  entry.score === undefined ? [t.passes(entry.passes), t.hitSkipped(entry.notesHit, entry.notesSkipped)] : [t.score(entry.score), t.hitMissed(entry.notesHit, entry.notesSkipped)];

// A recording under its piece's title: when it was made and in which view, its player, Download, and Delete, which asks first.
function recordingPanel(entry: LogEntry, recording: Recording, url: string, onDelete: () => void) {
  const audio = h("audio", { src: url, preload: "metadata" });
  makeSeekable(audio);
  return h(
    "div",
    { className: "day-recording" },
    // When, how it went, and the view, each a chip.
    h("p", { className: "recording-line" }, ...[t.recordedAt(timeOf(entry)), ...runResult(entry)].map(chip), ...recordingViews(recording)),
    waveformPlayer(recording.blob, audio),
    audio,
    h(
      "div",
      { className: "recording-actions" },
      h("a", { href: url, download: recordingName(entry, recording.blob), textContent: t.download }),
      h("button", { type: "button", className: "link-button", textContent: t.delete, onclick: onDelete }),
    ),
  );
}

type Options = {
  entries: LogEntry[];
  pieces: Piece[];
  // The recordings' object URLs, for the Calendar to let go of when it's left.
  urls: string[];
  // The plan changed, so the month redraws too.
  onChange: () => void;
  // Paste, pressed: picking days to paste into starts, or ends.
  onPaste: () => void;
};

// The day picked, beside the month: its date and how much of its plan is done, the plan, with its tools, then what was
// practised, each piece with its minutes and recordings, and its runs under the chart button by the day's total.
// Today and later days can be planned.
export function createDayPanel({ entries, pieces, urls, onChange, onPaste }: Options) {
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
      h("div", { className: "day-plan" }, h("p", { className: "panel-heading" }, t.plan, " ", planned.total), ...planned.list, h("div", { className: "plan-add" }, ...planned.tools)),
      h("div", {}, h("p", { className: "panel-heading day-total" }, total > 0 ? t.practisedFor(localNumber(total, 1)) : selected > today ? t.notYet : t.nothingPractised, ...(total > 0 ? [detailsButton] : [])), ...pieceBlocks),
    );
    showDetails();
  }

  // A little note by the piece for each recorded run, showing it under the title, or hiding it again.
  function recordingButton(entry: LogEntry) {
    const label = t.recordedAt(timeOf(entry));
    const button = h("button", { type: "button", className: "recording-note", innerHTML: NOTE_ICON, title: label, ariaLabel: label, ariaPressed: "false" });
    getRecording(entry.recordingId!).then((recording) => {
      // One that couldn't be saved, or has since been deleted, has no note.
      if (!recording) return button.remove();
      let panel: HTMLElement | null = null;
      button.onclick = () => {
        if (!panel) {
          const url = URL.createObjectURL(recording.blob);
          urls.push(url);
          panel = recordingPanel(entry, recording, url, async () => {
            if (!(await confirmAction(t.deleteRecordingConfirm, t.delete))) return;
            await deleteRecording(entry.recordingId!);
            panel!.remove();
            button.remove();
          });
        }
        if (panel.isConnected) {
          panel.querySelector("audio")!.pause();
          panel.remove();
        } else {
          // One open at a time: any other closes first.
          element.querySelectorAll<HTMLElement>('.recording-note[aria-pressed="true"]').forEach((other) => other.click());
          button.closest(".day-piece-title")!.after(panel);
        }
        button.ariaPressed = String(panel.isConnected);
      };
    });
    return button;
  }

  return { element, render };
}
