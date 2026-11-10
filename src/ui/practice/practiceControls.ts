import { t } from "../../i18n";
import type { Piece } from "../../music/notes";
import { getSettings, isScale } from "../../storage";
import { h } from "../dom";
import type { Section } from "../highway";
import type { createRunControls } from "../runControls";
import type { createBackingTrack } from "./backingTrack";
import { DONT_WAIT_ICON, LOOP_ICON, STAFF_ICON } from "../toggles";
import { createFullscreen } from "./fullscreen";
import { createBpmControl, createCountInPicker, createOptionsPanel, createPatternRow, modeButton, optionSwitch } from "./options";
import { createPieceMenu } from "./pieceMenu";
import type { createStaffSection } from "./staffSection";

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

  // Options: the switches, the piece, recording and the BPM.
  const pieceMenu = createPieceMenu(pieces, piece(), onPick);
  const bpmControl = createBpmControl(resetBeat);
  // Tempo smooths the move to the next note after a hit, which has no meaning when the lanes don't wait for one.
  const tempoSwitch = optionSwitch("tempoOn", t.tempo);
  tempoSwitch.input.disabled = settings.followOn;
  const metronomeSwitch = optionSwitch("metronomeOn", t.metronome, "", resetBeat);
  const countInPicker = createCountInPicker(render);
  const countInSwitch = optionSwitch("countInOn", t.countIn, t.countInHint, () => (countInPicker.disabled = !settings.countInOn));
  const optionsBpmRow = h("div", { className: "row" }, pieceMenu.button, pieceMenu.menu, run.recordLabel, bpmControl);
  const optionsPanel = createOptionsPanel(
    h("div", { className: "row toggles" }, tempoSwitch.label, metronomeSwitch.label, countInSwitch.label, countInPicker),
    optionsBpmRow,
    track.toggle,
  );

  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    const current = section();
    const scale = isScale(piece());
    repeatTopButton.disabled = !scale;
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
  const staffBigButton = modeButton("staffBig", t.biggerStaff, STAFF_ICON, t.biggerStaff, board.fit);
  const followButton = modeButton("followOn", t.dontWait, DONT_WAIT_ICON, `${t.dontWait}: ${t.dontWaitHint}`, () => {
    tempoSwitch.input.disabled = settings.followOn;
    showModes();
    clearStats();
    render();
  }, stopRun);
  // In fullscreen the BPM moves in beside the buttons, since Options is out of sight.
  const fullscreen = createFullscreen((on) => {
    if (on) actions.insertBefore(bpmControl, loopButton);
    else optionsBpmRow.append(bpmControl);
    // A full sheet wouldn't fit, so fullscreen uses the moving line, without changing the saved choice.
    board.staff.setCollapsed(on || !settings.staffOpen);
    board.fit();
    render();
  });
  const actions = h("div", { className: "row actions" }, run.startButton, referenceButton, run.message, loopButton, repeatTopButton, followButton, staffBigButton, fullscreen.button);
  const patternRow = createPatternRow(stopRun, loadPiece);

  return { optionsPanel, actions, modeNote, patternRow, showModes, leave: fullscreen.leave };
}
