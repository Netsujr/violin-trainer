import { localNumber, localTitle, t } from "../i18n";
import { dayKey, minutesByDay, monthGrid, piecesOn, summarise } from "../practice/calendar";
import { scorePercent, type LogEntry } from "../practice/log";
import { allPieces, deleteRecording, getRecording, getSettings, loadLog, type Recording, type RecordingView } from "../storage";
import { planSection } from "./calendarPlan";
import { backupButtons } from "./backup";
import { h, type Screen } from "./dom";
import { EXPAND_ICON, LANES_ICON, NOTE_ICON, SHEET_ICON, STAFF_ICON } from "./toggles";

const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

// A bit of what was practised, as a small rounded chip.
const chip = (content: string | Node) => h("span", { className: "info-chip" }, content);

// A piece's runs of one kind on a day, added up, each part its own chip.
const describeRuns = (runs: ReturnType<typeof summarise>[number]) =>
  [
    t.runs(runs.runs),
    `${localNumber(runs.minutes, 1)} min`,
    ...(runs.playedAlong
      ? [t.playedAlongRuns]
      : runs.scored
        ? [t.score(scorePercent(runs.hit, runs.hit + runs.missed)), t.hitMissed(runs.hit, runs.missed)]
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

// How a recorded run went: its score with "Don't wait", or the notes played when it waited for each.
const runResult = (entry: LogEntry) =>
  entry.score === undefined ? [t.passes(entry.passes), t.hitSkipped(entry.notesHit, entry.notesSkipped)] : [t.score(entry.score), t.hitMissed(entry.notesHit, entry.notesSkipped)];

// A recording under its piece's title: when it was made and in which view, its player, Download, and Delete, which doesn't ask.
function recordingPanel(entry: LogEntry, recording: Recording, url: string, onDelete: () => void) {
  const audio = h("audio", { controls: true, src: url, preload: "metadata" });
  makeSeekable(audio);
  return h(
    "div",
    { className: "day-recording" },
    // When, how it went, and the view, each a chip.
    h("p", { className: "recording-line" }, ...[t.recordedAt(timeOf(entry)), ...runResult(entry)].map(chip), ...recordingViews(recording)),
    audio,
    h(
      "div",
      { className: "recording-actions" },
      h("a", { href: url, download: recordingName(entry, recording.blob), textContent: t.download }),
      h("button", { type: "button", className: "link-button", textContent: t.delete, onclick: onDelete }),
    ),
  );
}

// A month of practice: each day's minutes, and tapping a day shows what was practised then. Today and later days can
// be planned, with pieces to practise; a past day shows which of its planned pieces were practised.
export function calendarScreen(): Screen {
  const settings = getSettings();
  const entries = loadLog();
  const pieces = allPieces();
  const minutes = minutesByDay(entries);
  const today = dayKey(new Date());
  const shown = new Date();
  shown.setDate(1);
  let selected = today;
  const urls: string[] = [];

  const monthTitle = h("h2", { className: "calendar-month" });
  const grid = h("div", { className: "calendar-grid", role: "grid" });
  const details = h("div", { className: "day-details" });
  const storage = h("p", { className: "calendar-storage" });
  const title = (pieceId: string, fallback = pieceId) => {
    const piece = pieces.find((candidate) => candidate.id === pieceId);
    return localTitle(pieceId, piece?.title ?? fallback);
  };
  const planFor = (day: string) => settings.plan[day] ?? [];

  async function showStorage() {
    const { usage = 0 } = await navigator.storage.estimate();
    storage.textContent = t.storageUsed(localNumber(usage / 1024 / 1024, 1));
    storage.className = `calendar-storage${usage > STORAGE_WARNING_BYTES ? " warning" : ""}`;
  }

  function moveMonth(by: number) {
    shown.setMonth(shown.getMonth() + by);
    renderMonth();
  }

  function renderMonth() {
    monthTitle.textContent = shown.toLocaleDateString(t.locale, { month: "long", year: "numeric" });
    const days = monthGrid(shown.getFullYear(), shown.getMonth());
    const busiest = Math.max(1, ...days.map((day) => minutes.get(dayKey(day)) ?? 0));
    const weekdays = days.slice(0, 7).map((day) => h("span", { className: "calendar-weekday" }, day.toLocaleDateString(t.locale, { weekday: "short" })));
    grid.replaceChildren(
      ...weekdays,
      ...days.map((day) => {
        const key = dayKey(day);
        const played = minutes.get(key) ?? 0;
        const planned = planFor(key).length;
        const cell = h(
          "button",
          {
            type: "button",
            className: ["calendar-day", day.getMonth() !== shown.getMonth() && "other-month", key === today && "today", key === selected && "selected", played > 0 && "practised"]
              .filter(Boolean)
              .join(" "),
            ariaLabel: day.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" }),
            ariaPressed: String(key === selected),
            onclick() {
              selected = key;
              renderMonth();
              renderDay();
            },
          },
          h("span", { className: "calendar-date" }, String(day.getDate())),
          h("span", { className: "calendar-minutes" }, played > 0 ? `${Math.max(1, Math.round(played))}′` : ""),
          h("span", { className: "calendar-plan" }, planned > 0 ? "•".repeat(Math.min(planned, 3)) : ""),
        );
        // Busier days are a stronger orange.
        if (played > 0) cell.style.setProperty("--level", `${Math.round(15 + 50 * (played / busiest))}%`);
        cell.classList.toggle("busy", played / busiest > 0.5);
        return cell;
      }),
    );
  }

  function rerender() {
    renderMonth();
    renderDay();
  }

  function renderDay() {
    const date = new Date(`${selected}T12:00`);
    const practised = piecesOn(entries, selected);
    const total = practised.reduce((sum, piece) => sum + piece.minutes, 0);
    const canPlan = selected >= today;

    const pieceBlocks = practised.map((piece) =>
      h(
        "div",
        { className: "day-piece" },
        h("div", { className: "day-piece-title" }, h("strong", { className: "info-chip" }, title(piece.pieceId, piece.title), ...piece.sessions.filter((session) => session.recordingId).map(recordingButton)), chip(`${localNumber(piece.minutes, 1)} min`)),
        h("ul", {}, ...summarise(piece.sessions).map((runs) => h("li", { className: "chip-row" }, ...describeRuns(runs)))),
      ),
    );
    const plan =
      planFor(selected).length || canPlan
        ? planSection({ day: selected, editable: canPlan, pieces, practised: new Map(practised.map((piece) => [piece.pieceId, piece.minutes])), onChange: rerender })
        : { tools: [], table: [] };
    // The date with the plan's tools beside it, then the plan, then what was practised, each set apart by a line.
    details.replaceChildren(
      h("div", { className: "day-head" }, h("h3", {}, date.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" })), h("div", { className: "plan-add" }, ...plan.tools)),
      h("hr"),
      ...(plan.table.length ? [...plan.table, h("hr")] : []),
      h("p", { className: "day-total" }, total > 0 ? t.practisedFor(localNumber(total, 1)) : selected > today ? t.notYet : t.nothingPractised),
      ...pieceBlocks,
    );
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
            await deleteRecording(entry.recordingId!);
            panel!.remove();
            button.remove();
            showStorage();
          });
        }
        if (panel.isConnected) {
          panel.querySelector("audio")!.pause();
          panel.remove();
        } else {
          // One open at a time: any other closes first.
          details.querySelectorAll<HTMLElement>('.recording-note[aria-pressed="true"]').forEach((other) => other.click());
          button.closest(".day-piece-title")!.after(panel);
        }
        button.ariaPressed = String(panel.isConnected);
      };
    });
    return button;
  }

  renderMonth();
  renderDay();
  showStorage();

  return {
    element: h(
      "section",
      { className: "calendar" },
      h(
        "div",
        { className: "calendar-head" },
        h("button", { type: "button", className: "secondary outline", textContent: "‹", ariaLabel: t.previousMonth, onclick: () => moveMonth(-1) }),
        monthTitle,
        h("button", { type: "button", className: "secondary outline", textContent: "›", ariaLabel: t.nextMonth, onclick: () => moveMonth(1) }),
      ),
      grid,
      details,
      h("div", { className: "calendar-storage-row" }, storage, ...backupButtons((problem) => ((storage.textContent = problem), (storage.className = "calendar-storage warning")))),
    ),
    leave() {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
