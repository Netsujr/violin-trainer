import { startMic } from "../audio/mic";
import { startRecorder } from "../audio/recorder";
import type { Piece } from "../music/notes";
import { appendLog, getSettings, saveRecording } from "../storage";
import { buildEntry } from "./log";
import { Session } from "./session";

export type Run = Awaited<ReturnType<typeof startRun>>;

// listen false is a play-along with nothing heard: no mic, no recording, and nothing logged. The readings, all
// silent, still come once a frame, to move things along.
export async function startRun(
  piece: Piece,
  record: boolean,
  onReading: (frequency: number | null, now: number) => void,
  listen = true,
) {
  const settings = getSettings();
  if (!listen) return silentRun(piece, onReading);

  const mic = await startMic(() => settings.minRms, onReading);
  const recorder = record ? startRecorder(mic.stream) : null;
  const view = settings.staffOnly ? "staffOnly" : settings.staffBig ? "bigStaff" : "lanes";
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
        seconds: Math.max(0, (hit.at - settings.holdMs - recorder.startedAt) / 1000),
      }));
      await saveRecording(recordingId, { blob: await recorded, markers, view, fullscreen });
    },
  };
}

function silentRun(piece: Piece, onReading: (frequency: number | null, now: number) => void) {
  const session = new Session(piece, performance.now());
  let animationFrame = requestAnimationFrame(function tick(now) {
    onReading(null, now);
    animationFrame = requestAnimationFrame(tick);
  });
  return {
    session,
    async stop() {
      cancelAnimationFrame(animationFrame);
    },
  };
}
