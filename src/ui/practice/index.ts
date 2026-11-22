import { sharedMetronome as metronome } from "../../audio/metronome";
import { sharedAudioContext } from "../../audio/reference";
import { localTitle, t } from "../../i18n";
import { countNotes, meterOf, midiOf } from "../../music/notes";
import { withPattern, withRepeatedTop } from "../../music/patterns";
import { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { aroundSpot } from "../../practice/trouble";
import { allPieces, getSettings, isScale, passCents, rememberPiece, saveSettings } from "../../storage";
import { h, type Screen } from "../dom";
import { createFingerboard } from "../fingerboard";
import type { Section } from "../highway";
import { arrangePanels, sizeButton } from "../panels";
import { createRunControls } from "../runControls";
import { createTuner } from "../tuner";
import { createBackingTrack } from "./backingTrack";
import { createCountIn } from "./countIn";
import { createFollowing } from "./following";
import { createPracticeControls } from "./practiceControls";
import { createReferenceTone } from "./referenceTone";
import { createResults } from "./results";
import { createSelection } from "./selection";
import { createStaffSection } from "./staffSection";
import { createTempoGlide } from "./tempoGlide";
import { holdMsFor } from "./timing";
import { createWaitingRun } from "./waitingRun";

// The pause at the end of each time round of a loop, before the next starts.
const LOOP_GAP_MS = 2000;
// How often the metronome schedules its clicks, well inside how far ahead it schedules them.
const METRONOME_TICK_MS = 25;
// How much of the height the lanes, the staff and the fingerboard each take when big.
const LANES_WEIGHT = 3;
const STAFF_WEIGHT = 2.6;
const BOARD_WEIGHT = 2;

// aligning, when given, opens the piece to line its backing track up, and is the way back to Library.
export function practiceScreen(pieceId?: string, aligning?: () => void): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === (pieceId ?? settings.lastPieceId)) ?? pieces[0];
  // Rhythm patterns and the repeated top note are scale drills, so songs play as written.
  const buildPiece = () =>
    isScale(basePiece) ? withPattern(settings.repeatTopOn ? withRepeatedTop(basePiece) : basePiece, settings.pattern) : basePiece;
  let piece = buildPiece();
  // While looping: which time round this is, and the score of the one before, in place of the results card.
  let loopCount = 1;
  let lastScore: number | null = null;
  // A trouble spot being played: its rounds still to come after this one, and the notes played, 2 beats either side of it.
  let spotRun: (Section & { rounds: number }) | null = null;
  let holdProgress = 0;
  let startIndex = 0;
  // A run that's finished ends by itself. The note it ended on stays shown, as done, until the next run.
  let doneAt: number | null = null;
  // When a loop starts its next time round, after a short gap, and the note the last one ended on.
  let loopAt: { at: number; previousMidi?: number } | null = null;

  const selection = createSelection((picked) => { highway.showSection(picked); toolbar.showModes(); renderNotes(); });
  const currentIndex = () => controls.session?.index ?? startIndex;
  const endIndex = () => ((spotRun ?? selection.section)?.last ?? piece.notes.length - 1) + 1;
  // A finished section stays on its last note, rather than moving on to the one after it.
  const shownIndex = () => doneAt ?? (controls.session?.finished && selection.section ? endIndex() - 1 : currentIndex());
  const holdMs = () => holdMsFor(piece.notes[currentIndex()]?.beats, currentIndex() < endIndex() - 1);
  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  const judge = createJudge({ get toleranceCents() { return passCents(); }, get holdMs() { return holdMs(); } });
  // The title row: the piece, its subtitle and how far the run's got, a section's notes when there is one, and the
  // score after a run.
  const title = h("h1");
  const subtitle = h("span");
  const progress = h("span", { className: "practice-progress" });
  const sectionNotes = h("span", { className: "practice-section" });
  const board = createStaffSection(pickNote, renderNotes, (beat) => track.showBeat(beat));
  const fingerboard = createFingerboard();
  const tuner = createTuner();
  // Each panel's corner button makes it big or small.
  const sized = () => {
    saveSettings();
    arrange();
  };
  const lanesSize = sizeButton("lanes", t.lanes, settings.practicePanels, sized);
  const staffSize = sizeButton("staff", t.staff, settings.practicePanels, sized);
  const boardSize = sizeButton("board", t.fingerboard, settings.practicePanels, sized);
  board.lanesPanel.append(lanesSize);
  board.staffPanel.append(staffSize);
  const boardPanel = h("div", { className: "stage-panel stage-board" }, fingerboard.element, boardSize);
  const panels = h("div", { className: "stage-panels" }, board.lanesPanel, board.staffPanel, boardPanel);
  const results = createResults(board, playAgain, { onSpot: (spot) => { selection.spot(spot); renderNotes(); }, onPractise: practiseSpot });
  const { staff, highway } = board;
  const countIn = createCountIn(metronome, (text) => (progress.textContent = withLoopNumber(text)));
  const glide = createTempoGlide(metronome, judge, highway);
  const tone = createReferenceTone(() => (controls.session?.finished ? undefined : piece.notes[currentIndex()]));
  const track = createBackingTrack({ aligning: aligning ?? null, stopRun: () => controls.stop(), onChange: () => toolbar.showModes(), lanes: highway });
  // Lining the track up, its waveform runs under the lanes, on the same timeline.
  if (track.strip) board.lanesPanel.append(track.strip);
  const following = createFollowing({ metronome, highway, staff, isMuted: tone.isMuted, endIndex, track, moveOn });
  const waiting = createWaitingRun({ judge, glide, staff, isMuted: tone.isMuted, endIndex, holdMs, showProgress: (value) => (holdProgress = value), moveOn });

  function pickNote(index: number, extend: boolean) {
    spotRun = null;
    startFrom(selection.pick(index, extend));
  }

  // From its first note, with no section.
  function loadPiece() {
    piece = buildPiece();
    title.textContent = localTitle(basePiece.id, basePiece.title);
    subtitle.textContent = t.pieces[basePiece.id]?.subtitle ?? basePiece.subtitle ?? "";
    board.setMeter((metronome.meter = meterOf(piece)));
    rememberPiece(basePiece.id);
    track.load(basePiece.id);
    highway.jumpTo(0);
    pickNote(0, false);
  }

  // A trouble spot played on its own, so many times. After one, Play again goes back to the whole piece.
  function practiseSpot(spot: Section, times: number) {
    selection.spot(spot);
    spotRun = { ...aroundSpot(piece.notes, spot), rounds: times - 1 };
    playFrom((startIndex = spotRun.first));
  }

  function playAgain() {
    if (selection.spotted) pickNote(0, false);
    playFrom(startIndex);
  }

  const playFrom = (index: number) => (controls.session ? beginRun(index) : controls.startButton.click());

  function renderNotes() {
    const finished = doneAt !== null || (controls.session?.finished ?? false);
    const index = shownIndex();
    const note = finished ? undefined : piece.notes[index];
    staff.draw(piece.notes, index, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers }, selection.section);
    // Rests aren't counted, and a rest shows the number of the note after it, where a run from it starts.
    const section = selection.section;
    const done = countNotes(section ? piece.notes.slice(section.first, section.last + 1) : piece.notes);
    const noteText = note ? t.noteOf(countNotes(piece.notes.slice(0, index)) + 1, countNotes(piece.notes)) : t.allDone(done);
    progress.textContent = withLoopNumber(countIn.active ? t.startsIn(countIn.beats) : noteText);
    sectionNotes.textContent = section ? t.sectionNotes(countNotes(piece.notes.slice(0, section.first)) + 1, countNotes(piece.notes.slice(0, section.last + 1))) : "";
    // The fingerboard shows the note to play now, and the one after as a dashed ring.
    const next = finished ? undefined : piece.notes.slice(index + 1).find((later) => later.pitch);
    fingerboard.show(note?.pitch ? note : null, false, next ?? null);
    if (!countIn.active) countIn.hideOverlay();
    if (note?.pitch) tone.setNote(midiOf(note.pitch));
    else tone.stop();
    highway.draw(piece.notes, index, holdProgress);
  }

  function startFrom(index: number) {
    if (glide.cancel()) highway.jumpTo(currentIndex());
    countIn.cancel();
    glide.resetBeat();
    startIndex = index;
    doneAt = null;
    loopAt = null;
    highway.showResults(null);
    const session = controls.session;
    if (session) {
      session.jumpTo(index, performance.now(), endIndex());
      judge.setTarget(session.currentMidi);
      if (session.following && !spotRun) startFollowing(index);
    }
    [holdProgress, loopCount, lastScore] = [0, 1, null];
    results.clear();
    renderNotes();
  }

  // Start and Play again pause first. Clicking a note doesn't, so moving past a stuck note stays quick.
  function beginRun(index: number) {
    startFrom(index);
    if (controls.session) countInFor(controls.session);
  }

  // A spot's rounds count in with 2 beats, even with Keep moving, where the lanes start once it's counted.
  function countInFor(session: Session) {
    if (spotRun) countIn.start(2);
    else if (!session.following && settings.countInOn) countIn.start();
    renderNotes();
  }

  // Goes round again with no results card in the way. The last note and the first can be the same, so it needs a fresh bow.
  function loopAgain(session: Session, previousMidi?: number) {
    lastScore = following.score ?? lastScore;
    loopCount++;
    glide.resetBeat();
    session.jumpTo(startIndex, performance.now(), endIndex());
    judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    if (session.following && !spotRun) startFollowing(startIndex);
    else {
      following.stop(true); // Until it's counted in, with this time round's notes still marked.
      highway.jumpTo(startIndex);
      countInFor(session);
    }
  }

  // With a backing track on, the recording plays from the same note.
  function startFollowing(index: number, wait?: boolean) {
    following.start(piece.notes, index, wait);
    if (track.active) track.playFrom(piece.notes, index);
  }

  function moveOn(session: Session, previousMidi?: number) {
    holdProgress = 0;
    if (following.active) results.live(track.listening ? following.results : null);
    if (session.finished) {
      staff.hidePlayed();
      if (spotRun ? spotRun.rounds-- > 0 : settings.loopOn) loopAt = { at: performance.now() + LOOP_GAP_MS, previousMidi };
      else {
        doneAt = shownIndex();
        results.show(session, { results: following.results, listening: track.listening, notes: piece.notes, meter: metronome.meter, section: selection.section, pattern: piece.pattern, startIndex, spot: spotRun && selection.section });
        spotRun = null;
        controls.finish(() => doneAt !== null);
      }
    }
    // Fast bow changes are too short to detect, so inside a pattern the beat and hold time separate repeated notes.
    else judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    renderNotes();
  }

  // Each reading from the mic: Keep moving moves the lanes on, a count-in counts down, and otherwise the note waits to be played.
  function onReading(frequency: number | null, now: number) {
    // A run that has just ended by itself can still get the mic's last reading.
    const session = controls.session;
    if (!session) return;
    if (loopAt && now >= loopAt.at) {
      const { previousMidi } = loopAt;
      loopAt = null;
      loopAgain(session, previousMidi);
      renderNotes();
    }
    // While the lanes move, the current note's progress. Moving on to the next resets it first.
    if (countIn.active) {
      if (countIn.tick(now)) { if (session.following) startFollowing(startIndex, false); renderNotes(); }
    } else if (following.active) {
      if (!session.finished) holdProgress = following.read(session, frequency, now) ?? holdProgress;
    } else if (!session.finished) {
      waiting.read(session, frequency, now);
    }
    // The tuner and the fingerboard measure what's heard against the note to play.
    const target = piece.notes[currentIndex()]?.pitch;
    tuner.hear(frequency, target ? midiOf(target) : undefined);
    fingerboard.hear(frequency, passCents());
    highway.draw(piece.notes, shownIndex(), holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    listen: () => track.listening,
    aligning: Boolean(aligning),
    onStart() {
      // A backing track keeps moving like the music it is, so it always runs as Keep moving.
      controls.session!.following = settings.followOn || track.active;
      highway.jumpTo(startIndex);
      beginRun(startIndex);
    },
    onStop() {
      track.pause();
      following.stop(doneAt !== null);
      countIn.cancel();
      if (glide.cancel()) highway.jumpTo(currentIndex());
      [spotRun, loopCount, lastScore, holdProgress, loopAt] = [null, 1, null, 0, null];
      staff.hidePlayed();
      tuner.hear(null);
      renderNotes();
      toolbar.showModes(); // Today's plan, with the run just logged.
    },
  });
  const toolbar = createPracticeControls({
    run: controls, pieces, board, track, referenceButton: tone.button, loadPiece, render: renderNotes, arrange,
    piece: () => basePiece,
    clearStats: () => results.clear(),
    async onPick(picked) { await controls.stop(); basePiece = picked; loadPiece(); toolbar.showModes(); },
  });

  // The panels as the settings panel sets them. With the lanes off they keep running out of sight, because the staff
  // follows them.
  function arrange() {
    const { lanes, staff, board: boardShown, tuner: tunerOn } = settings.practicePanels;
    arrangePanels(panels, [
      { element: board.lanesPanel, size: lanes, weight: LANES_WEIGHT, sizeButton: lanesSize },
      { element: board.staffPanel, size: staff, weight: STAFF_WEIGHT, sizeButton: staffSize },
      { element: boardPanel, size: boardShown, weight: BOARD_WEIGHT, sizeButton: boardSize },
    ]);
    board.lanesPanel.hidden = false;
    board.lanesPanel.classList.toggle("offstage", lanes === "off");
    tuner.element.hidden = !tunerOn;
  }
  arrange();

  // The metronome ticks for as long as it's switched on, whether a run is going or not. A backing track stands in for
  // it, and Keep moving brings it in with the first note.
  const metronomeTimer = setInterval(() => {
    if (settings.metronomeOn && !following.waiting && !track.active && sharedAudioContext().state === "running") metronome.tick(performance.now(), settings.bpm);
  }, METRONOME_TICK_MS);

  loadPiece();

  return {
    element: h(
      "section",
      { className: "practice fills-window" },
      h("div", { className: "title-row" }, h("div", { className: "practice-title" }, title, h("p", {}, subtitle, progress, sectionNotes, board.score)), toolbar.tools),
      controls.message,
      // Aligning, the controls for lining the track up sit above the panels, and its waveform under the lanes.
      ...(track.panel ? [track.panel] : []),
      h("div", { className: "stage" }, panels, tuner.element),
      ...(track.panel ? [] : [toolbar.dock]),
      results.element,
      countIn.overlay,
    ),
    sidebar: track.panel ? undefined : toolbar.todayPlan,
    // The metronome switched or the BPM changed: the beat starts again from here.
    tempoChanged: () => glide.resetBeat(),
    ownsMetronome: () => true,
    leave() {
      clearInterval(metronomeTimer);
      tone.stop();
      track.leave();
      toolbar.leave();
      board.leave();
      return controls.leave();
    },
  };
}
