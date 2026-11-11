import { localTitle, t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { getSettings, isScale, saveSettings } from "../../storage";
import { h } from "../dom";
import type { Section } from "../highway";
import type { createRunControls } from "../runControls";
import type { createBackingTrack } from "./backingTrack";
import { DONT_WAIT_ICON, LOOP_ICON, SHEET_ICON, STAFF_ICON } from "../toggles";
import { createFullscreen } from "./fullscreen";
import { createBpmControl, createCountInPicker, createOptionsPanel, createPatternRow, ICON_BUTTON, modeButton, optionSwitch } from "./options";
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

  // Options: the switches and the BPM. The piece and the backing track are on the lanes' bar, and recording is by Start.
  const pieceMenu = createPieceMenu(pieces, piece(), onPick);
  // Picking from today's plan is picking from the menu.
  const todayPlan = createTodayPlan(pieces, piece, (picked) => {
    pieceMenu.button.textContent = localTitle(picked.id, picked.title);
    onPick(picked);
  });
  const bpmControl = createBpmControl(resetBeat);
  // Tempo smooths the move to the next note after a hit, which has no meaning when the lanes don't wait for one.
  const tempoSwitch = optionSwitch("tempoOn", t.tempo);
  tempoSwitch.input.disabled = settings.followOn;
  const metronomeSwitch = optionSwitch("metronomeOn", t.metronome, "", resetBeat);
  const countInPicker = createCountInPicker(render);
  const countInSwitch = optionSwitch("countInOn", t.countIn, t.countInHint, () => (countInPicker.disabled = !settings.countInOn));
  // With a backing track on, its speed stands in for the BPM, which it sets.
  const tempo = h("div", { className: "tempo" }, bpmControl, track.speedControl);
  board.addFirst(pieceMenu.button, pieceMenu.menu);
  const optionsBpmRow = h("div", { className: "row" }, tempo);
  const optionsPanel = createOptionsPanel(
    h("div", { className: "row toggles" }, tempoSwitch.label, metronomeSwitch.label, countInSwitch.label, countInPicker),
    optionsBpmRow,
  );

  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    todayPlan.refresh();
    const current = section();
    const scale = isScale(piece());
    repeatTopButton.disabled = !scale;
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
  // as large as fits the screen below the controls.
  function applyView() {
    const sheet = fullscreen.on && settings.staffOnly;
    board.staff.setCollapsed(fullscreen.on ? !sheet : !settings.staffOpen);
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
  // In fullscreen the BPM moves in beside the buttons, since Options is out of sight.
  const fullscreen = createFullscreen((on) => {
    if (on) actions.insertBefore(tempo, loopButton);
    else optionsBpmRow.append(tempo);
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
    leave() {
      fullscreen.leave();
      document.documentElement.classList.remove("staff-only");
    },
  };
}
