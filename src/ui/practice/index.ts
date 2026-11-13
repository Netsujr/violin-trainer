import { createMetronome } from "../../audio/metronome";
import { sharedAudioContext } from "../../audio/reference";
import { t } from "../../i18n";
import { meterOf, midiOf } from "../../music/notes";
import { withPattern, withRepeatedTop } from "../../music/patterns";
import { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { aroundSpot } from "../../practice/trouble";
import { allPieces, getSettings, isScale, rememberPiece } from "../../storage";
import { h, type Screen } from "../dom";
import type { Section } from "../highway";
import { createRunControls } from "../runControls";
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

  const selection = createSelection((picked) => { highway.showSection(picked); toolbar.showModes(); });
  const currentIndex = () => controls.session?.index ?? startIndex;
  const endIndex = () => ((spotRun ?? selection.section)?.last ?? piece.notes.length - 1) + 1;
  // A finished section stays on its last note, rather than moving on to the one after it.
  const shownIndex = () => doneAt ?? (controls.session?.finished && selection.section ? endIndex() - 1 : currentIndex());
  const holdMs = () => holdMsFor(piece.notes[currentIndex()]?.beats, settings.tempoOn && currentIndex() < endIndex() - 1);
  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  const judge = createJudge({ get toleranceCents() { return settings.toleranceCents; }, get holdMs() { return holdMs(); } });
  const metronome = createMetronome();
  const progress = h("p");
  const board = createStaffSection(pickNote, renderNotes, (beat) => track.showBeat(beat));
  const results = createResults(board, playAgain, { onSpot: (spot) => { selection.spot(spot); renderNotes(); }, onPractise: practiseSpot });
  const { staff, highway } = board;
  const countIn = createCountIn(metronome, (text) => (progress.textContent = withLoopNumber(text)));
  const glide = createTempoGlide(metronome, judge, highway);
  const tone = createReferenceTone(() => (controls.session?.finished ? undefined : piece.notes[currentIndex()]));
  const track = createBackingTrack({ aligning: aligning ?? null, stopRun: () => controls.stop(), onChange: () => toolbar.showModes(), addToBar: board.addToggle });
  const following = createFollowing({ metronome, highway, staff, isMuted: tone.isMuted, endIndex, track, moveOn });
  const waiting = createWaitingRun({ judge, glide, staff, isMuted: tone.isMuted, endIndex, holdMs, showProgress: (value) => (holdProgress = value), moveOn });

  function pickNote(index: number, extend: boolean) {
    spotRun = null;
    startFrom(selection.pick(index, extend));
  }

  // From its first note, with no section.
  function loadPiece() {
    piece = buildPiece();
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
    const noteText = note ? t.noteOf(index + 1, piece.notes.length) : t.allDone(selection.section ? selection.section.last - selection.section.first + 1 : piece.notes.length);
    progress.textContent = withLoopNumber(countIn.active ? t.startsIn(countIn.beats) : noteText);
    if (!countIn.active) countIn.hideOverlay();
    if (note) tone.setNote(midiOf(note.pitch));
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

  // A spot's rounds count in with 2 beats, even with "Don't wait", where the lanes start once it's counted.
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

  // Each reading from the mic: "Don't wait" moves the lanes on, a count-in counts down, and otherwise the note waits to be played.
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
    highway.draw(piece.notes, shownIndex(), holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    listen: () => track.listening,
    aligning: Boolean(aligning),
    onStart() {
      // A backing track keeps moving like the music it is, so it always runs as "Don't wait".
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
      renderNotes();
      toolbar.showModes(); // Today's plan, with the run just logged.
    },
  });
  const toolbar = createPracticeControls({
    run: controls, pieces, board, track, referenceButton: tone.button, loadPiece, render: renderNotes,
    piece: () => basePiece, section: () => selection.section,
    resetBeat: () => glide.resetBeat(), clearStats: () => results.clear(),
    async onPick(picked) { await controls.stop(); basePiece = picked; loadPiece(); },
  });

  // The metronome ticks for as long as it's switched on, whether a run is going or not. A backing track stands in for
  // it, and "Don't wait" brings it in with the first note.
  const metronomeTimer = setInterval(() => {
    if (settings.metronomeOn && !following.waiting && !track.active && sharedAudioContext().state === "running") metronome.tick(performance.now(), settings.bpm);
  }, METRONOME_TICK_MS);

  loadPiece();

  return {
    element: h(
      "section",
      { className: "practice" },
      ...(track.panel ? [] : [toolbar.todayPlan]),
      progress,
      toolbar.actions,
      toolbar.modeNote,
      ...(track.panel ? [] : [toolbar.optionsPanel]),
      // Aligning, everything for lining the track up sits in one box: its controls, the lanes, and the waveform under them.
      track.panel ? h("div", { className: "track-align" }, track.panel, board.timeline, track.strip!) : board.timeline,
      results.element,
      board.sheet,
      toolbar.patternRow,
      countIn.overlay,
    ),
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
