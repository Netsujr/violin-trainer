import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { getSettings, isScale, saveSettings } from "../../storage";
import { h } from "../dom";
import type { Section } from "../highway";
import type { createRunControls } from "../runControls";
import type { createBackingTrack } from "./backingTrack";
import { COUNT_IN_ICON, DONT_WAIT_ICON, LOOP_ICON, METRONOME_ICON, SHEET_ICON, STAFF_ICON, TEMPO_ICON } from "../toggles";
import { createFullscreen } from "./fullscreen";
import { createBpmControl, createCountInButton, createPatternRow, iconSwitch, ICON_BUTTON, modeButton } from "./options";
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
  resetBeat: () => void;
  clearStats: () => void;
};

// Everything that sets how a run goes: the Options panel, the mode buttons beside Start with the line saying
// what's on, fullscreen, and the rhythm patterns.
export function createPracticeControls({ run, pieces, piece, section, board, track, referenceButton, onPick, loadPiece, render, resetBeat, clearStats }: Deps) {
  const settings = getSettings();
  const stopRun = () => run.stop();

  // Options: the switches and the BPM, in a box above the lanes. The piece and the backing track are on the lanes' bar, and recording is by Start.
  const pieceMenu = createPieceMenu(pieces, piece(), onPick);
  // Picking from today's plan is picking from the menu.
  const todayPlan = createTodayPlan(pieces, piece, (picked) => {
    pieceMenu.button.textContent = localTitle(picked.id, picked.title);
    onPick(picked);
  });
  const bpmControl = createBpmControl(resetBeat);
  // Tempo smooths the move to the next note after a hit, which has no meaning when the lanes don't wait for one.
  const tempoSwitch = iconSwitch("tempoOn", t.tempo, TEMPO_ICON);
  tempoSwitch.input.disabled = settings.followOn;
  const metronomeSwitch = iconSwitch("metronomeOn", t.metronome, METRONOME_ICON, t.metronome, resetBeat);
  const countInButton = createCountInButton(COUNT_IN_ICON, render);
  // With a backing track on, its speed stands in for the BPM, which it sets.
  const tempo = h("div", { className: "tempo" }, bpmControl, track.speedControl);
  board.addFirst(pieceMenu.button, pieceMenu.menu);
  // The switches sit in front of the BPM. In fullscreen, both move out to the buttons.
  const optionToggles = h("div", { className: "row toggles" }, tempoSwitch.label, metronomeSwitch.label, countInButton);
  const optionsPanel = h("div", { className: "options row" }, optionToggles, tempo);

  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    todayPlan.refresh();
    const current = section();
    const scale = isScale(piece());
    repeatTopButton.disabled = !scale;
    // A backing track always sets the pace, so "Don't wait" is greyed out while one is on.
    followButton.disabled = track.active;
    followButton.title = track.active ? t.trackSetsPace : `${t.dontWait}: ${t.dontWaitHint}`;
    bpmControl.hidden = track.active;
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
  }
  showView();
  const followButton = modeButton("followOn", t.dontWait, DONT_WAIT_ICON, `${t.dontWait}: ${t.dontWaitHint}`, () => {
    tempoSwitch.input.disabled = settings.followOn;
    showModes();
    clearStats();
    render();
  }, stopRun);
  // In fullscreen the switches and BPM move in beside the buttons, since Options and the lanes' bar are out of sight.
  // The label switches get their own little group, before the mode buttons.
  const fullscreen = createFullscreen((on) => {
    if (on) loopButton.before(optionToggles, tempo, board.labels);
    else {
      optionsPanel.append(optionToggles, tempo);
      board.returnLabels();
    }
    applyView();
  });
  const actions = h("div", { className: "row actions" }, run.recordToggle, run.startButton, referenceButton, run.message, loopButton, repeatTopButton, followButton, viewButton, fullscreen.button);
  const patternRow = createPatternRow(stopRun, loadPiece);

  return {
    optionsPanel,
    todayPlan: todayPlan.element,
    actions,
    modeNote,
    patternRow,
    showModes,
    // Loop on or off, as if its button were pressed.
    leave() {
      fullscreen.leave();
      document.documentElement.classList.remove("staff-only");
    },
  };
}
