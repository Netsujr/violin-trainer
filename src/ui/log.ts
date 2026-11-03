import { pieceTrends, plannedThisWeek, weekMinutes, type LogEntry } from "../practice/log";
import { allPieces, deleteRecording, getRecording, getSettings, loadLog, type Recording } from "../storage";
import { h, type Screen } from "./dom";
import { DAYS } from "./library";

const STORAGE_WARNING_BYTES = 500 * 1024 * 1024;

const describeSession = (entry: LogEntry) =>
  [
    new Date(entry.startedAt).toLocaleString(),
    entry.pieceTitle,
    `${entry.minutes.toFixed(1)} min`,
    `${entry.passes} ${entry.passes === 1 ? "pass" : "passes"}`,
    `${entry.notesHit} hit, ${entry.notesSkipped} skipped`,
    entry.averageCents === null ? null : `${entry.averageCents.toFixed(0)} cents off`,
    entry.slowest.length ? `slowest ${entry.slowest.map((note) => `${note.pitch} ${note.seconds.toFixed(1)} s`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const recordingName = (entry: LogEntry) => `${entry.pieceTitle} ${entry.startedAt.slice(0, 16).replace(":", "-")}.webm`;

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
    h("a", { href: url, download: recordingName(entry), textContent: "Download" }),
    " ",
    h("button", { textContent: "Delete recording", className: "secondary outline", onclick: onDelete }),
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
    storage.textContent = `Storage used: ${(usage / 1024 / 1024).toFixed(1)} MB`;
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
  const planned = plannedThisWeek(allPieces(), getSettings().targetDays, entries, today);
  const trends = pieceTrends(entries);

  showStorage();

  return {
    element: h(
      "section",
      {},
      h("h2", {}, "This week"),
      ...week.map(({ day, minutes }) =>
        h(
          "div",
          { className: "row" },
          h("span", { className: "day" }, day.toLocaleDateString(undefined, { weekday: "short" })),
          h("progress", { max: longestDay, value: minutes }),
          `${minutes.toFixed(1)} min`,
        ),
      ),
      ...(planned.length ? [h("h3", {}, "Planned")] : []),
      ...planned.map(({ title, day, practised }) => h("p", {}, `${practised ? "✓" : "○"} ${title} (${DAYS[day]})`)),
      h("h2", {}, "Trends"),
      ...trends.map(({ title, sessions }) =>
        h(
          "p",
          {},
          `${title}: `,
          sessions.map((session) => `${session.averageCents!.toFixed(0)} cents`).join(" → "),
          " · per pass: ",
          sessions.map((session) => (session.averagePassSeconds === null ? "–" : `${session.averagePassSeconds.toFixed(0)} s`)).join(" → "),
        ),
      ),
      h("h2", {}, "Sessions"),
      storage,
      h("ul", {}, ...entries.map(sessionRow)),
    ),
    leave() {
      urls.forEach((url) => URL.revokeObjectURL(url));
    },
  };
}
