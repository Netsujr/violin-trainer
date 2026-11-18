import { loadRecordings, playNotes } from "../audio/reference";
import { t } from "../i18n";
import type { PieceNote } from "../music/notes";
import { h } from "./dom";
import { beatMs } from "./practice/timing";
import { PLAY_ICON, STOP_ICON } from "./toggles";

// The piece editor's play buttons, one for each line of the staff, so a piece can be heard as it's written. A line
// plays at Practice's BPM, one line at a time, and pressing its button again stops it.
export function createLinePlayer() {
  // The violin recordings start loading now, so the first line plays at once.
  loadRecordings();
  let playing: { button: HTMLButtonElement; stop: () => void } | null = null;

  function reset() {
    if (!playing) return;
    playing.button.innerHTML = PLAY_ICON;
    playing.button.title = playing.button.ariaLabel = t.playLine;
    playing = null;
  }

  function stop() {
    playing?.stop();
    reset();
  }

  // The button for one line. It reads the line's notes when pressed, so a note just dragged plays where it is now.
  function button(lineNotes: () => PieceNote[]) {
    const button = h("button", { className: "editor-play", innerHTML: PLAY_ICON, title: t.playLine, ariaLabel: t.playLine });
    button.onclick = () => {
      const again = playing?.button === button;
      stop();
      if (again) return;
      const stopLine = playNotes(lineNotes(), beatMs(), () => {
        if (playing?.stop === stopLine) reset();
      });
      playing = { button, stop: stopLine };
      button.innerHTML = STOP_ICON;
      button.title = button.ariaLabel = t.stop;
    };
    return button;
  }

  return { button, stop };
}
