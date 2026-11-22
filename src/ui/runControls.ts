import { t } from "../i18n";
import type { Piece } from "../music/notes";
import { startRun, type Run } from "../practice/run";
import { h } from "./dom";
import { PLAY_ICON, RECORD_ICON, STOP_ICON } from "./toggles";

// A finished run ends this long after its last note counts, so a recording keeps the end of that note.
const FINISH_TAIL_MS = 1000;

// Record, in the sidebar for every screen: when it's on, the next run records. It can't be switched mid-run.
let recordOn = false;
let recordToggle: HTMLButtonElement | null = null;
export function createRecordToggle() {
  const button = h(
    "button",
    {
      type: "button",
      className: "nav-item record-toggle",
      ariaLabel: t.record,
      ariaPressed: String(recordOn),
      onclick() {
        recordOn = !recordOn;
        button.ariaPressed = String(recordOn);
      },
    },
    h("span", { className: "icon", innerHTML: RECORD_ICON }),
    h("span", { className: "nav-word" }, t.record),
  );
  recordToggle = button;
  return button;
}

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
  const button = h("button", { className: "start-button", onclick: () => (run ? stop() : start()) });
  const message = h("span", { className: "warning" });
  let run: Run | null = null;
  let saving: Promise<void> = Promise.resolve();
  let left = false;

  const showRunning = () => {
    button.innerHTML = run ? STOP_ICON : PLAY_ICON;
    button.append(run ? t.stop : t.start);
    if (recordToggle) recordToggle.disabled = run !== null;
  };
  showRunning();

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
