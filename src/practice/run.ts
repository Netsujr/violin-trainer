import { startMic } from "../audio/mic";
import { startRecorder } from "../audio/recorder";
import type { Piece } from "../music/notes";
import { appendLog, getSettings, saveRecording, type Recording } from "../storage";
import { buildEntry } from "./log";
import { Session } from "./session";

export type Run = Awaited<ReturnType<typeof startRun>>;

const LEAD_IN_SECONDS = 1;

// listen false is a play-along with nothing heard: no mic and no recording, and only its minutes are logged, if logged.
// The readings, all silent, still come once a frame, to move things along.
export async function startRun(
  piece: Piece,
  record: boolean,
  onReading: (frequency: number | null, now: number, rms: number) => void,
  listen = true,
  logged = true,
) {
  const settings = getSettings();
  if (!listen) return silentRun(piece, onReading, logged);

  // What the mic heard while recording, for playing it back with the pitch line.
  const heard: NonNullable<Recording["heard"]> = [];
  const mic = await startMic(
    () => settings.minRms,
    (frequency, now, rms) => {
      if (recorder) heard.push({ seconds: (now - recorder.startedAt) / 1000, frequency });
      onReading(frequency, now, rms);
    },
  );
  const recorder = record ? startRecorder(mic.stream) : null;
  // How Practice looked, as the views recordings were saved with before it had panels: the staff alone with the lanes
  // off, a bigger staff with it big and the lanes small, and otherwise the lanes.
  const { lanes, staff } = settings.practicePanels;
  const view = lanes === "off" ? "staffOnly" : staff === "big" && lanes === "small" ? "bigStaff" : "lanes";
  const fullscreen = document.documentElement.classList.contains("fullscreen");
  const session = new Session(piece, performance.now());

  return {
    session,
    async stop() {
      // ponytail: closing the tab mid-recording loses the audio, the log entry stays. Flush chunks to IndexedDB if that bites.
      const recordingId = recorder ? crypto.randomUUID() : undefined;
      // A run of a piece with nothing played isn't worth a line in the Calendar. Free play has no notes to play, so its
      // time always counts.
      const played = session.hits.length > 0 || session.missed > 0 || piece.notes.length === 0;
      if (played || recorder) appendLog(buildEntry(session, performance.now(), recordingId));
      const recorded = recorder?.stop();
      mic.stop();
      if (!recorder || !recorded || !recordingId) return;

      const markers = session.hits.map((hit) => ({
        pitch: hit.pitch,
        index: hit.index,
        seconds: Math.max(0, (hit.at - settings.holdMs - recorder.startedAt) / 1000),
      }));
      // Playing back skips a count-in or a backing track's intro: it starts a second before the first note hit.
      const start = markers.length ? Math.max(0, markers[0].seconds - LEAD_IN_SECONDS) : 0;
      await saveRecording(recordingId, { blob: await recorded, markers, view, fullscreen, notes: piece.notes, heard, start });
    },
  };
}

function silentRun(piece: Piece, onReading: (frequency: number | null, now: number, rms: number) => void, logged: boolean) {
  const session = new Session(piece, performance.now());
  let animationFrame = requestAnimationFrame(function tick(now) {
    onReading(null, now, 0);
    animationFrame = requestAnimationFrame(tick);
  });
  return {
    session,
    async stop() {
      cancelAnimationFrame(animationFrame);
      if (logged) appendLog({ ...buildEntry(session, performance.now()), score: undefined, playedAlong: true });
    },
  };
}
