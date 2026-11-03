import { t } from "../i18n";
import type { Piece } from "../music/notes";
import { startRun, type Run } from "../practice/run";
import { h } from "./dom";

export function createRunControls(options: {
  piece: () => Piece;
  onReading: (frequency: number | null, now: number) => void;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const button = h("button", { textContent: t.start, onclick: () => (run ? stop() : start()) });
  const record = h("input", { type: "checkbox" });
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
      const started = await startRun(options.piece(), record.checked, options.onReading);
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
    saving = finishing.stop();
    await saving;
    button.disabled = false;
    options.onStop?.();
  }

  return {
    startButton: button,
    recordLabel: h("label", {}, record, ` ${t.record}`),
    message,
    stop,
    leave() {
      left = true;
      return stop();
    },
    get session() {
      return run?.session ?? null;
    },
  };
}
