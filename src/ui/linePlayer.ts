import { loadRecordings, playNotes } from "../audio/reference";
import { t } from "../i18n";
import type { PieceNote } from "../music/notes";
import { h } from "./dom";
import { beatMs } from "./practice/timing";
import { PLAY_ICON, STOP_ICON } from "./toggles";

// The piece editor's Hear this line, so a piece can be heard as it's written. A line plays at Practice's BPM, and
// pressing the button again stops it.
export function createLinePlayer() {
  // The violin recordings start loading now, so the first line plays at once.
  loadRecordings();
  let playing: { button: HTMLButtonElement; stop: () => void } | null = null;

  const label = (button: HTMLButtonElement, on: boolean) => {
    button.innerHTML = on ? STOP_ICON : PLAY_ICON;
    button.append(on ? t.stop : t.playLine);
  };

  function reset() {
    if (!playing) return;
    label(playing.button, false);
    playing = null;
  }

  function stop() {
    playing?.stop();
    reset();
  }

  // The button for a line. It reads the line's notes when pressed, so a note just dragged plays where it is now.
  function button(lineNotes: () => PieceNote[]) {
    const button = h("button", { type: "button", className: "ghost-button editor-play" });
    label(button, false);
    button.onclick = () => {
      const again = playing?.button === button;
      stop();
      if (again) return;
      const stopLine = playNotes(lineNotes(), beatMs(), () => {
        if (playing?.stop === stopLine) reset();
      });
      playing = { button, stop: stopLine };
      label(button, true);
    };
    return button;
  }

  return { button, stop };
}
