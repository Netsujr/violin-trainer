import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { getSettings, isScale, saveSettings } from "../../storage";
import { h } from "../dom";
import type { Section } from "../highway";
import type { createRunControls } from "../runControls";
import type { createBackingTrack } from "./backingTrack";
import { COUNT_IN_ICON, DONT_WAIT_ICON, LOOP_ICON, SHEET_ICON, STAFF_ICON, TEMPO_ICON } from "../toggles";
import { createFullscreen } from "./fullscreen";
import { createCountInButton, createPatternRow, iconSwitch, ICON_BUTTON, modeButton } from "./options";
import { createPieceMenu } from "./pieceMenu";
import { createTodayPlan } from "./todayPlan";
import type { createStaffSection } from "./staffSection";

// Room left under a fullscreen sheet, in pixels.
const SHEET_MARGIN = 16;

type Deps = {
  run: ReturnType<typeof createRunControls>;
  pieces: Piece[];
  // The picked piece, before any pattern or repeated top note, and the selected notes.
  piece: () => Piece;
  section: () => Section | null;
  board: ReturnType<typeof createStaffSection>;
  track: ReturnType<typeof createBackingTrack>;
  referenceButton: HTMLElement;
  onPick: (piece: Piece) => void;
  loadPiece: () => void;
  render: () => void;
  clearStats: () => void;
};

// Everything that sets how a run goes: the Options panel, the mode buttons beside Start with the line saying
// what's on, fullscreen, and the rhythm patterns.
export function createPracticeControls({ run, pieces, piece, section, board, track, referenceButton, onPick, loadPiece, render, clearStats }: Deps) {
  const settings = getSettings();
  const stopRun = () => run.stop();

  // The switches that set how a run goes, Tempo and the count-in, go first on the lanes' bar, with a backing track's
  // speed after the score when there's one. The piece and the backing track are on the bar too.
  const pieceMenu = createPieceMenu(pieces, piece(), onPick);
  // Picking from today's plan is picking from the menu.
  const todayPlan = createTodayPlan(pieces, piece, (picked) => {
    pieceMenu.button.textContent = localTitle(picked.id, picked.title);
    onPick(picked);
  });
  const tempoSwitch = iconSwitch("tempoOn", t.tempo, TEMPO_ICON, `${t.tempo}: ${t.tempoHint}`);
  const countInButton = createCountInButton(COUNT_IN_ICON, render);
  // They join the bar's label switches, which move beside the buttons in fullscreen.
  board.labels.prepend(tempoSwitch.label, countInButton);
  // With a backing track on, its speed stands in for the header's BPM, which it sets.
  const tempo = h("div", { className: "tempo" }, track.speedControl);
  board.addFirst(pieceMenu.button, pieceMenu.menu);
  board.addToggle(tempo);

  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    todayPlan.refresh();
    const current = section();
    const scale = isScale(piece());
    // What doesn't apply is hidden: the repeated top note on a song, "Don't wait" when a backing track sets the pace
    // anyway, and Tempo, which smooths the move after a hit, when the lanes don't wait for one. The pitch line goes
    // when the staff isn't the moving line or the lanes wait.
    if (!((settings.followOn || track.active) && board.staff.collapsed)) board.staff.clearTrace();
    repeatTopButton.hidden = !scale;
    followButton.hidden = track.active;
    tempoSwitch.label.hidden = settings.followOn || track.active;
    // A count-in only comes before notes that wait for the player.
    countInButton.hidden = settings.followOn || track.active;
    // A backing track sets the pace, so the header's metronome and BPM don't apply.
    document.documentElement.classList.toggle("track-tempo", track.active);
    track.speedControl.hidden = !track.active;
    patternRow.hidden = !scale;
    modeNote.textContent = [
      ...(current ? [t.sectionInfo(current.first + 1, current.last + 1)] : []),
      track.active ? t.withTrack : settings.followOn ? t.keepsMoving : t.waitsForNotes,
      settings.loopOn ? t.loopsUntilStop : t.playsOnce,
      ...(scale ? [settings.repeatTopOn ? t.topTwice : t.topOnce] : []),
    ].join(" · ");
  }
  const loopButton = modeButton("loopOn", t.loop, LOOP_ICON, t.loop, showModes);
  const repeatTopButton = modeButton("repeatTopOn", t.repeatTop, "×2", t.repeatTop, loadPiece, stopRun);
  // The lanes and the staff: both, the staff bigger, or the staff alone, the full sheet in fullscreen. Each press moves on.
  const viewButton = h("button", {
    className: ICON_BUTTON,
    onclick() {
      if (settings.staffOnly) settings.staffOnly = false;
      else if (settings.staffBig) [settings.staffBig, settings.staffOnly] = [false, true];
      else settings.staffBig = true;
      saveSettings();
      showView();
      applyView();
    },
  });
  function showView() {
    const label = settings.staffOnly ? t.staffOnly : settings.staffBig ? t.biggerStaff : t.lanesAndStaff;
    viewButton.innerHTML = settings.staffOnly ? SHEET_ICON : STAFF_ICON;
    viewButton.title = viewButton.ariaLabel = label;
    viewButton.ariaPressed = String(settings.staffBig || settings.staffOnly);
    document.documentElement.classList.toggle("staff-only", settings.staffOnly);
  }
  // Fullscreen shows the moving line, which fits beside the lanes, unless the staff is on its own: then it's the full sheet,
  // as large as fits the screen below the controls. Out of fullscreen, the staff on its own is the full sheet too, wrapped
  // to the page, so there's nothing to scroll sideways.
  function applyView() {
    const sheet = fullscreen.on && settings.staffOnly;
    board.staff.setCollapsed(fullscreen.on ? !sheet : !settings.staffOpen && !settings.staffOnly);
    board.staff.fitTo(sheet ? innerHeight - board.sheet.getBoundingClientRect().top - SHEET_MARGIN : null);
    board.fit();
    render();
    showModes();
  }
  showView();
  board.whenViewChanges(showModes);
  // Don't wait draws the pitch line through the moving staff too.
  const followButton = modeButton("followOn", t.dontWait, DONT_WAIT_ICON, `${t.dontWait}: ${t.dontWaitHint} ${t.pitchLineHint}`, () => {
    showModes();
    clearStats();
    render();
  }, stopRun);
  // In fullscreen the bar's switches and the speed move in beside the buttons, since the lanes' bar is out of sight,
  // in their own little group before the mode buttons.
  const fullscreen = createFullscreen((on) => {
    if (on) loopButton.before(tempo, board.labels);
    else {
      board.addToggle(tempo);
      board.returnLabels();
    }
    applyView();
  });
  const actions = h("div", { className: "row actions" }, run.startButton, referenceButton, run.message, loopButton, repeatTopButton, followButton, viewButton, fullscreen.button);
  const patternRow = createPatternRow(stopRun, loadPiece);

  return {
    todayPlan: todayPlan.element,
    actions,
    modeNote,
    patternRow,
    showModes,
    // Loop on or off, as if its button were pressed.
    leave() {
      fullscreen.leave();
      document.documentElement.classList.remove("staff-only", "track-tempo");
    },
  };
}
