import { startMic } from "../audio/mic";
import { startRecorder } from "../audio/recorder";
import type { Piece } from "../music/notes";
import { appendLog, getSettings, saveRecording } from "../storage";
import { buildEntry } from "./log";
import { Session } from "./session";

export type Run = Awaited<ReturnType<typeof startRun>>;

export async function startRun(
  piece: Piece,
  record: boolean,
  onReading: (frequency: number | null, now: number) => void,
) {
  const settings = getSettings();
  const mic = await startMic(() => settings.minRms, onReading);
  const recorder = record ? startRecorder(mic.stream) : null;
  const session = new Session(piece, performance.now());

  return {
    session,
    async stop() {
      // ponytail: closing the tab mid-recording loses the audio, the log entry stays. Flush chunks to IndexedDB if that bites.
      const recordingId = recorder ? crypto.randomUUID() : undefined;
      appendLog(buildEntry(session, performance.now(), recordingId));
      const recorded = recorder?.stop();
      mic.stop();
      if (!recorder || !recorded || !recordingId) return;

      const markers = session.hits.map((hit) => ({
        pitch: hit.pitch,
        seconds: Math.max(0, (hit.at - settings.holdMs - recorder.startedAt) / 1000),
      }));
      await saveRecording(recordingId, { blob: await recorded, markers });
    },
  };
}
