import type { Piece } from "../../music/notes";
import { t } from "../../i18n";
import { getSettings, isScale } from "../../storage";
import { h } from "../dom";
import type { createRunControls } from "../runControls";
import type { createBackingTrack } from "./backingTrack";
import { createFullscreen } from "./fullscreen";
import { createPieceMenu } from "./pieceMenu";
import { createPracticeDock } from "./practiceDock";
import { createTodayPlan } from "./todayPlan";
import type { createStaffSection } from "./staffSection";

type Deps = {
  run: ReturnType<typeof createRunControls>;
  pieces: Piece[];
  // The picked piece, before any pattern or repeated top note.
  piece: () => Piece;
  board: ReturnType<typeof createStaffSection>;
  track: ReturnType<typeof createBackingTrack>;
  referenceButton: HTMLElement;
  onPick: (piece: Piece) => void;
  loadPiece: () => void;
  render: () => void;
  clearStats: () => void;
  arrange: () => void;
};

// Everything that sets how a run goes: the title row's buttons, the settings panel, today's plan in the sidebar, and
// full screen.
export function createPracticeControls({ run, pieces, piece, board, track, referenceButton, onPick, loadPiece, render, clearStats, arrange }: Deps) {
  const settings = getSettings();
  const pieceMenu = createPieceMenu(pieces, t.changePiece, onPick);
  // Picking from today's plan is picking from the menu.
  const todayPlan = createTodayPlan(pieces, piece, onPick);
  const dock = createPracticeDock({
    stopRun: () => run.stop(),
    render,
    loadPiece,
    changed() {
      showModes();
      clearStats();
      render();
    },
    arrange,
    trackSwitches: track.switches,
  });

  function showModes() {
    todayPlan.refresh();
    // The pitch line is drawn only when the lanes keep moving and the staff is the moving line.
    if (!((settings.followOn || track.active) && board.staff.collapsed)) board.staff.clearTrace();
    dock.show(isScale(piece()), track.active);
    // A backing track sets the pace, so its speed shows in place of the sidebar's metronome and BPM.
    document.documentElement.classList.toggle("track-tempo", track.active);
    track.speedControl.hidden = !track.active;
  }
  board.whenViewChanges(showModes);
  // Full screen leaves the panels with what's on the notes, Start or Stop, Hear the note and Exit; the panels refit themselves.
  const fullscreen = createFullscreen(() => {});

  return {
    tools: h("div", { className: "title-tools" }, track.speedControl, pieceMenu.button, pieceMenu.menu, referenceButton, fullscreen.button, run.startButton),
    dock: dock.element,
    todayPlan: todayPlan.element,
    showModes,
    leave() {
      fullscreen.leave();
      document.documentElement.classList.remove("track-tempo");
    },
  };
}
