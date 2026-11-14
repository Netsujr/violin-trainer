import { t } from "../i18n";
import type { Piece } from "../music/notes";
import { startRun, type Run } from "../practice/run";
import { h } from "./dom";
import { boxToggle, RECORD_ICON } from "./toggles";

// A finished run ends this long after its last note counts, so a recording keeps the end of that note.
const FINISH_TAIL_MS = 1000;

export function createRunControls(options: {
  piece: () => Piece;
  // Each reading from the mic: the pitch heard, if any, and how loud it was.
  onReading: (frequency: number | null, now: number, rms: number) => void;
  // Whether the mic listens. Off is a play-along: nothing heard, and only its minutes logged, unless it's lining a
  // track up, which isn't practice.
  listen?: () => boolean;
  aligning?: boolean;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const button = h("button", { textContent: t.start, onclick: () => (run ? stop() : start()) });
  // Red and pulsing while it's on.
  let recordOn = false;
  const record = boxToggle(h("span", { className: "icon", innerHTML: RECORD_ICON }), t.record, false, (on) => (recordOn = on));
  record.classList.add("record-toggle");
  const message = h("span", { className: "warning" });
  let run: Run | null = null;
  let saving: Promise<void> = Promise.resolve();
  let left = false;

  const showRunning = () => {
    button.textContent = run ? t.stop : t.start;
    button.classList.toggle("secondary", run !== null);
    record.disabled = run !== null;
  };

  async function start() {
    button.disabled = true;
    message.textContent = "";
    try {
      const started = await startRun(options.piece(), recordOn, options.onReading, options.listen?.() ?? true, !options.aligning);
      if (left) {
        await started.stop();
        return;
      }

      run = started;
      showRunning();
      options.onStart?.();
    } catch (error) {
      message.textContent = t.micUnavailable((error as Error).message);
    }
    button.disabled = false;
  }

  async function stop() {
    if (!run) return saving;

    const finishing = run;
    run = null;
    button.disabled = true;
    showRunning();
    // A failed save, like Safari's private browsing or a full disk, mustn't leave the button stuck or the screen unleavable.
    saving = finishing.stop().catch(() => {
      message.textContent = t.recordingNotSaved;
    });
    await saving;
    button.disabled = false;
    options.onStop?.();
  }

  return {
    startButton: button,
    recordToggle: record,
    message,
    stop,
    // Ends the run shortly, unless by then it's been stopped, another started, or it has carried on (stillDone false).
    finish(stillDone: () => boolean) {
      const finishing = run;
      setTimeout(() => run === finishing && stillDone() && stop(), FINISH_TAIL_MS);
    },
    leave() {
      left = true;
      return stop();
    },
    get session() {
      return run?.session ?? null;
    },
  };
}
