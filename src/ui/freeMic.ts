import { startMic } from "../audio/mic";
import type { Piece } from "../music/notes";
import { buildEntry } from "../practice/log";
import { Session } from "../practice/session";
import { appendLog, getSettings } from "../storage";

// A pause this long ends a stretch of playing.
const PAUSE_MS = 30_000;
// A stretch shorter than this is a stray sound, not playing, so it isn't logged.
const SHORTEST_MS = 5_000;

// Free play listens from the moment it's open, with no Start to press, and logs only the time spent playing: each
// stretch from the first note heard to the last before a pause. onError says why the mic couldn't start.
export function createFreeMic(piece: Piece, onReading: (frequency: number | null, now: number, rms: number) => void, onError: (message: string) => void) {
  const settings = getSettings();
  let mic: Awaited<ReturnType<typeof startMic>> | null = null;
  let wanted = false;
  let stretch: Session | null = null;
  let lastHeard = 0;

  function endStretch() {
    if (stretch && lastHeard - stretch.startedAt >= SHORTEST_MS) appendLog(buildEntry(stretch, lastHeard));
    stretch = null;
  }

  async function start() {
    if (wanted) return;
    wanted = true;
    try {
      const started = await startMic(
        () => settings.minRms,
        (frequency, now, rms) => {
          if (stretch && now - lastHeard > PAUSE_MS) endStretch();
          onReading(frequency, now, rms);
        },
      );
      // Stopped while the mic was starting.
      if (!wanted) return started.stop();
      mic = started;
    } catch (error) {
      wanted = false;
      onError((error as Error).message);
    }
  }

  function stop() {
    wanted = false;
    endStretch();
    mic?.stop();
    mic = null;
  }

  // Closing the tab mid-stretch still logs it.
  addEventListener("pagehide", endStretch);

  return {
    start,
    stop,
    // A note heard, from the player: it starts a stretch, or carries one on.
    heard(now: number) {
      stretch ??= new Session(piece, now);
      lastHeard = now;
    },
    leave() {
      stop();
      removeEventListener("pagehide", endStretch);
    },
  };
}
