import { localTitle, t } from "../i18n";
import { COMMON_TIME, meterOf, midiOf, type Piece, type PieceNote } from "../music/notes";
import { centsToTarget } from "../practice/judge";
import type { LogEntry } from "../practice/log";
import { deleteRecording, getSettings, passCents, type Recording, type RecordingView } from "../storage";
import { confirmAction } from "./confirm";
import { h } from "./dom";
import { scaleToFit } from "./layout";
import { createStaff } from "./staff";
import { EXPAND_ICON, LANES_ICON, SHEET_ICON, STAFF_ICON } from "./toggles";
import { waveformPlayer } from "./waveform";

// The moving line's height, in the staff's units, as on Practice.
const LINE_UNITS = 160;

// A bit of what was practised, as a small rounded chip.
export const chip = (content: string | Node) => h("span", { className: "info-chip" }, content);

export const timeOf = (entry: LogEntry) => new Date(entry.startedAt).toLocaleTimeString(t.locale, { hour: "numeric", minute: "2-digit" });

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

// The beat the playing had reached at each moment: at each note hit, its first beat, gliding from one hit to the next.
// Before the first hit it waits on that note, and after the last it moves through it at the run's average pace.
export function beatClock(notes: PieceNote[], markers: { seconds: number; index: number }[]) {
  const starts = notes.map((_, index) => notes.slice(0, index).reduce((sum, note) => sum + (note.beats ?? 1), 0));
  const points = markers.map(({ seconds, index }) => ({ seconds, beat: starts[index] }));
  const [first, last] = [points[0], points.at(-1)!];
  const secondsPerBeat = last.beat > first.beat ? (last.seconds - first.seconds) / (last.beat - first.beat) : 0.5;
  const lastBeats = notes[markers.at(-1)!.index].beats ?? 1;
  points.push({ seconds: last.seconds + lastBeats * secondsPerBeat, beat: last.beat + lastBeats });
  return (seconds: number) => {
    const next = points.findIndex((point) => point.seconds > seconds);
    if (next === 0) return first.beat;
    if (next === -1) return points.at(-1)!.beat;
    const [from, to] = [points[next - 1], points[next]];
    return from.beat + ((seconds - from.seconds) / (to.seconds - from.seconds)) * (to.beat - from.beat);
  };
}

// The moving line, played back with the recording: it glides along as the notes were played, with the pitch line
// drawn through it as it was heard. Older recordings, without the notes, have none.
function replayStaff(recording: Recording, piece: Piece | undefined, audio: HTMLAudioElement) {
  const { notes, heard = [] } = recording;
  const markers = recording.markers.filter((marker): marker is typeof marker & { index: number } => marker.index !== undefined);
  if (!notes || markers.length === 0) return null;

  const settings = getSettings();
  const beatAt = beatClock(notes, markers);
  const firstHit = markers[0].seconds;
  const staff = createStaff(600, true);
  staff.setMeter(piece ? meterOf(piece) : COMMON_TIME);
  const element = h("div", { className: "stage-panel staff-panel recording-staff" }, staff.element);
  // How much of what was heard is drawn so far, as the pitch line.
  let traced = 0;

  function show() {
    const now = audio.currentTime;
    if (heard[traced - 1]?.seconds > now) {
      staff.clearTrace();
      traced = 0;
    }
    for (; traced < heard.length && heard[traced].seconds <= now; traced++) {
      const { seconds, frequency } = heard[traced];
      if (seconds < firstHit) continue;
      const beat = beatAt(seconds);
      const pitch = notes![markers.findLast((marker) => marker.seconds <= seconds)?.index ?? markers[0].index].pitch;
      const cents = frequency === null || !pitch ? null : centsToTarget(frequency, midiOf(pitch));
      staff.tracePlayed(beat, frequency, cents, cents !== null && Math.abs(cents) <= passCents());
    }
    const current = markers.findLast((marker) => marker.seconds <= now)?.index ?? markers[0].index;
    staff.draw(notes!, current, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers });
    staff.follow(beatAt(now));
  }
  const tick = () => {
    show();
    if (!audio.paused) requestAnimationFrame(tick);
  };
  ["play", "seeked"].forEach((event) => audio.addEventListener(event, tick));

  return {
    element,
    // Sized once it's on the page, as tall as its panel.
    fit() {
      const scale = scaleToFit(staff.element, LINE_UNITS);
      element.style.setProperty("--timeline-scale", String(scale));
      staff.resize(staff.element.clientWidth / scale, scale);
      show();
    },
  };
}

// A recording, opened from its note in the Calendar: when it was made and how it went, the moving line playing along
// with it, the player, Download, and Delete, which asks first. onDelete runs once it's gone.
export function openRecording(entry: LogEntry, recording: Recording, piece: Piece | undefined, onDelete: () => void) {
  const url = URL.createObjectURL(recording.blob);
  const audio = h("audio", { src: url, preload: "metadata" });
  makeSeekable(audio);
  const staff = replayStaff(recording, piece, audio);
  const dialog = h(
    "dialog",
    {
      className: "recording-dialog",
      ariaLabel: t.recordedAt(timeOf(entry)),
      onclick(event) {
        if (event.target === dialog) dialog.close();
      },
      onclose() {
        audio.pause();
        URL.revokeObjectURL(url);
        dialog.remove();
      },
    },
    h(
      "article",
      {},
      h(
        "header",
        {},
        h("button", { className: "close", ariaLabel: t.close, onclick: () => dialog.close() }),
        h("strong", {}, localTitle(entry.pieceId, entry.pieceTitle)),
      ),
      h("p", { className: "recording-line" }, ...[t.recordedAt(timeOf(entry)), ...runResult(entry)].map(chip), ...recordingViews(recording)),
      ...(staff ? [staff.element] : []),
      waveformPlayer(recording.blob, audio, recording.start),
      audio,
      h(
        "div",
        { className: "recording-actions" },
        h("a", { href: url, download: recordingName(entry, recording.blob), textContent: t.download }),
        h("button", {
          type: "button",
          className: "link-button",
          textContent: t.delete,
          async onclick() {
            if (!(await confirmAction(t.deleteRecordingConfirm, t.delete))) return;
            await deleteRecording(entry.recordingId!);
            dialog.close();
            onDelete();
          },
        }),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
  staff?.fit();
}
