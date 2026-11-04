import { centsText, localNumber, localTitle, t } from "../i18n";
import { pieceTrends, plannedThisWeek, weekMinutes, type LogEntry } from "../practice/log";
import { allPieces, deleteRecording, getRecording, getSettings, loadLog, type Recording } from "../storage";
import { h, type Screen } from "./dom";

const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

const describeSession = (entry: LogEntry) =>
  [
    new Date(entry.startedAt).toLocaleString(t.locale),
    localTitle(entry.pieceId, entry.pieceTitle),
    `${localNumber(entry.minutes, 1)} min`,
    ...(entry.score === undefined
      ? [t.passes(entry.passes), t.hitSkipped(entry.notesHit, entry.notesSkipped)]
      : [t.score(entry.score), t.hitMissed(entry.notesHit, entry.notesSkipped)]),
    entry.averageCents === null ? null : t.centsOff(Math.round(entry.averageCents)),
    entry.slowest.length ? t.slowestLower(entry.slowest.map((note) => `${note.pitch} ${localNumber(note.seconds, 1)} s`).join(", ")) : null,
  ]
    .filter(Boolean)
    .join(" · ");

const recordingName = (entry: LogEntry) => `${localTitle(entry.pieceId, entry.pieceTitle)} ${entry.startedAt.slice(0, 16).replace(":", "-")}.webm`;

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
    h("a", { href: url, download: recordingName(entry), textContent: t.download }),
    " ",
    h("button", { textContent: t.deleteRecording, className: "secondary outline", onclick: onDelete }),
    h("div", { className: "row" }, ...markers),
  );
}

export function logScreen(): Screen {
  const entries = loadLog().reverse();
  const today = new Date();
  const urls: string[] = [];
  const storage = h("p");

  async function showStorage() {
    const { usage = 0 } = await navigator.storage.estimate();
    storage.textContent = t.storageUsed(localNumber(usage / 1024 / 1024, 1));
    storage.className = usage > STORAGE_WARNING_BYTES ? "warning" : "";
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
      await deleteRecording(recordingId);
      player.remove();
      showStorage();
    });
    row.append(player);
  }

  const week = weekMinutes(entries, today);
  const longestDay = Math.max(1, ...week.map((day) => day.minutes));
  const localPieces = allPieces().map((piece) => ({ ...piece, title: localTitle(piece.id, piece.title) }));
  const planned = plannedThisWeek(localPieces, getSettings().targetDays, entries, today);
  const trends = pieceTrends(entries);

  showStorage();

  return {
    element: h(
      "section",
      {},
      h("h2", {}, t.thisWeek),
      ...week.map(({ day, minutes }) =>
        h(
          "div",
          { className: "row" },
          h("span", { className: "day" }, day.toLocaleDateString(t.locale, { weekday: "short" })),
          h("progress", { max: longestDay, value: minutes }),
          `${localNumber(minutes, 1)} min`,
        ),
      ),
      ...(planned.length ? [h("h3", {}, t.planned)] : []),
      ...planned.map(({ title, day, practised }) => h("p", {}, `${practised ? "✓" : "○"} ${title} (${t.days[day]})`)),
      h("h2", {}, t.trends),
      ...trends.map(({ title, sessions }) =>
        h(
          "p",
          {},
          `${localTitle(sessions[0].pieceId, title)}: `,
          sessions.map((session) => centsText(Math.round(session.averageCents!))).join(" → "),
          ` · ${t.perPass}: `,
          sessions.map((session) => (session.averagePassSeconds === null ? "–" : `${localNumber(session.averagePassSeconds, 0)} s`)).join(" → "),
        ),
      ),
      h("h2", {}, t.sessions),
      storage,
      h("ul", {}, ...entries.map(sessionRow)),
    ),
    leave() {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
