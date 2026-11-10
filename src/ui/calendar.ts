import { localNumber, localTitle, t } from "../i18n";
import type { Piece } from "../music/notes";
import { dayKey, minutesByDay, monthGrid, piecesOn } from "../practice/calendar";
import type { LogEntry } from "../practice/log";
import { allPieces, deleteRecording, getRecording, getSettings, loadLog, pieceGroups, saveSettings, type Recording } from "../storage";
import { confirmAction } from "./confirm";
import { h, type Screen } from "./dom";

const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

// One practice session, by its time of day.
const describeSession = (entry: LogEntry) =>
  [
    new Date(entry.startedAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" }),
    `${localNumber(entry.minutes, 1)} min`,
    ...(entry.score === undefined
      ? [t.passes(entry.passes), t.hitSkipped(entry.notesHit, entry.notesSkipped)]
      : [t.score(entry.score), t.hitMissed(entry.notesHit, entry.notesSkipped)]),
    entry.averageCents === null ? null : t.centsOff(Math.round(entry.averageCents)),
  ]
    .filter(Boolean)
    .join(" · ");

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

function recordingPlayer(entry: LogEntry, recording: Recording, urls: string[], onDelete: () => void) {
  const url = URL.createObjectURL(recording.blob);
  urls.push(url);
  const audio = h("audio", { controls: true, src: url, preload: "metadata" });
  makeSeekable(audio);

  const markers = recording.markers.map((marker) =>
    h("button", {
      textContent: marker.pitch,
      className: "marker secondary outline",
      onclick() {
        audio.currentTime = marker.seconds;
        audio.play();
      },
    }),
  );

  return h(
    "div",
    {},
    audio,
    h("a", { href: url, download: recordingName(entry, recording.blob), textContent: t.download }),
    " ",
    h("button", { textContent: t.deleteRecording, className: "secondary outline", onclick: onDelete }),
    h("div", { className: "row" }, ...markers),
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

  function pieceSelect() {
    return h(
      "select",
      { ariaLabel: t.addToPlan },
      h("option", { value: "", textContent: t.addToPlan, disabled: true, selected: true }),
      ...pieceGroups(pieces)
        .filter(([, group]) => group.length > 0)
        .map(([key, group]: readonly [string, Piece[]]) =>
          h("optgroup", { label: t[key as "scales"] }, ...group.map((piece) => h("option", { value: piece.id, textContent: localTitle(piece.id, piece.title) }))),
        ),
    );
  }

  function setPlan(day: string, ids: string[]) {
    if (ids.length) settings.plan[day] = ids;
    else delete settings.plan[day];
    saveSettings();
    renderMonth();
    renderDay();
  }

  function renderDay() {
    const date = new Date(`${selected}T12:00`);
    const practised = piecesOn(entries, selected);
    const total = practised.reduce((sum, piece) => sum + piece.minutes, 0);
    const canPlan = selected >= today;
    const plan = planFor(selected);

    const pieceBlocks = practised.map((piece) =>
      h(
        "div",
        { className: "day-piece" },
        h("div", { className: "day-piece-title" }, h("strong", {}, title(piece.pieceId, piece.title)), h("span", {}, `${localNumber(piece.minutes, 1)} min`)),
        h("ul", {}, ...piece.sessions.map(sessionRow)),
      ),
    );
    const planRows = plan.map((pieceId) => {
      const done = practised.some((piece) => piece.pieceId === pieceId);
      return h(
        "li",
        { className: "plan-item" },
        `${done ? "✓" : "○"} ${title(pieceId)}`,
        ...(canPlan
          ? [h("button", { type: "button", className: "secondary outline plan-remove", textContent: "✕", ariaLabel: t.removeFromPlan(title(pieceId)), onclick: () => setPlan(selected, plan.filter((id) => id !== pieceId)) })]
          : []),
      );
    });
    const add = pieceSelect();
    add.onchange = () => add.value && !plan.includes(add.value) && setPlan(selected, [...plan, add.value]);

    details.replaceChildren(
      h("h3", {}, date.toLocaleDateString(t.locale, { weekday: "long", day: "numeric", month: "long" })),
      h("p", { className: "day-total" }, total > 0 ? t.practisedFor(localNumber(total, 1)) : selected > today ? t.notYet : t.nothingPractised),
      ...pieceBlocks,
      ...(plan.length || canPlan ? [h("h4", {}, t.plan), ...(plan.length ? [h("ul", { className: "plan" }, ...planRows)] : [h("p", { className: "day-total" }, t.nothingPlanned)])] : []),
      ...(canPlan ? [add] : []),
    );
  }

  function sessionRow(entry: LogEntry) {
    const row = h("li", {}, describeSession(entry));
    if (entry.recordingId) showRecording(row, entry, entry.recordingId);
    return row;
  }

  async function showRecording(row: HTMLElement, entry: LogEntry, recordingId: string) {
    const recording = await getRecording(recordingId);
    if (!recording) return;

    const player = recordingPlayer(entry, recording, urls, async () => {
      if (!(await confirmAction(t.deleteRecordingConfirm, t.delete))) return;

      await deleteRecording(recordingId);
      player.remove();
      showStorage();
    });
    row.append(player);
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
      storage,
    ),
    leave() {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
