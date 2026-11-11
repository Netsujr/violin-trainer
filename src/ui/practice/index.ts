import { createMetronome } from "../../audio/metronome";
import { t } from "../../i18n";
import { midiOf } from "../../music/notes";
import { withPattern, withRepeatedTop } from "../../music/patterns";
import { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
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
import { createStaffSection } from "./staffSection";
import { createTempoGlide } from "./tempoGlide";
import { holdMsFor } from "./timing";
import { createTuning } from "./tuning";
import { createWaitingRun } from "./waitingRun";

// aligning, when given, opens the piece to line its backing track up, and is the way back to Library.
export function practiceScreen(pieceId?: string, aligning?: () => void): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === (pieceId ?? settings.lastPieceId)) ?? pieces[0];
  // Rhythm patterns and the repeated top note are scale drills, so songs play as written.
  const buildPiece = () =>
    isScale(basePiece) ? withPattern(settings.repeatTopOn ? withRepeatedTop(basePiece) : basePiece, settings.pattern) : basePiece;
  let piece = buildPiece();
  // The selected notes, and the note that Shift+click selects from.
  let section: Section | null = null;
  let sectionAnchor = 0;
  // While looping: which time round this is, and the score of the one before, in place of the results card.
  let loopCount = 1;
  let lastScore: number | null = null;
  let holdProgress = 0;
  let startIndex = 0;
  // A run that's finished ends by itself. The note it ended on stays shown, as done, until the next run.
  let doneAt: number | null = null;

  const currentIndex = () => controls.session?.index ?? startIndex;
  const endIndex = () => (section ? section.last + 1 : piece.notes.length);
  // A finished section stays on its last note, rather than moving on to the one after it.
  const shownIndex = () => doneAt ?? (controls.session?.finished && section ? section.last : currentIndex());
  const holdMs = () => holdMsFor(piece.notes[currentIndex()]?.beats, settings.tempoOn && currentIndex() < endIndex() - 1);
  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  const judge = createJudge({ get toleranceCents() { return settings.toleranceCents; }, get holdMs() { return holdMs(); } });
  const metronome = createMetronome();
  const progress = h("p");
  const board = createStaffSection(pickNote, renderNotes, (beat) => track.showBeat(beat));
  const results = createResults(board, () => (controls.session ? beginRun(startIndex) : controls.startButton.click()));
  const { staff, highway } = board;
  const tuning = createTuning(staff);
  const countIn = createCountIn(metronome, (text) => (progress.textContent = withLoopNumber(text)));
  const glide = createTempoGlide(metronome, judge, highway);
  const tone = createReferenceTone(() => (controls.session?.finished ? undefined : piece.notes[currentIndex()]));
  const track = createBackingTrack({ aligning: aligning ?? null, stopRun: () => controls.stop(), onChange: () => toolbar.showModes(), addToBar: board.addToggle });
  const following = createFollowing({ metronome, highway, staff, showReading: tuning.show, isMuted: tone.isMuted, endIndex, track, moveOn });
  const waiting = createWaitingRun({ judge, glide, staff, showReading: tuning.show, isMuted: tone.isMuted, endIndex, holdMs, showProgress: (value) => (holdProgress = value), moveOn });

  function pickNote(index: number, extend: boolean) {
    if (extend) section = { first: Math.min(sectionAnchor, index), last: Math.max(sectionAnchor, index) };
    else {
      section = null;
      sectionAnchor = index;
    }
    highway.showSection(section);
    toolbar.showModes();
    startFrom(section ? section.first : index);
  }

  function loadPiece() {
    piece = buildPiece();
    section = null;
    sectionAnchor = 0;
    highway.showSection(null);
    toolbar.showModes();
    rememberPiece(basePiece.id);
    track.load(basePiece.id);
    highway.jumpTo(0);
    startFrom(0);
  }

  function renderNotes() {
    const finished = doneAt !== null || (controls.session?.finished ?? false);
    const index = shownIndex();
    const note = finished ? undefined : piece.notes[index];
    staff.draw(piece.notes, index, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers }, section);
    const noteText = note ? t.noteOf(index + 1, piece.notes.length) : t.allDone(section ? section.last - section.first + 1 : piece.notes.length);
    progress.textContent = withLoopNumber(countIn.active ? t.startsIn(settings.countInBeats) : noteText);
    if (!countIn.active) countIn.hideOverlay();
    if (note) tone.setNote(midiOf(note.pitch));
    else tone.stop();
    highway.draw(piece.notes, index, holdProgress);
  }

  function startFrom(index: number) {
    cancelGlide();
    countIn.cancel();
    glide.resetBeat();
    startIndex = index;
    doneAt = null;
    highway.showResults(null);
    const session = controls.session;
    if (session) {
      session.jumpTo(index, performance.now(), endIndex());
      judge.setTarget(session.currentMidi);
      if (session.following) startFollowing(index);
    }
    holdProgress = 0;
    loopCount = 1;
    lastScore = null;
    results.clear();
    renderNotes();
  }

  // Start and Play again pause first. Clicking a note doesn't, so moving past a stuck note stays quick.
  function beginRun(index: number) {
    startFrom(index);
    if (controls.session && !controls.session.following && settings.countInOn) { countIn.start(); renderNotes(); }
  }

  // Goes round again with no results card in the way. The last note and the first can be the same, so it needs a fresh bow.
  function loopAgain(session: Session, previousMidi?: number) {
    lastScore = following.score ?? lastScore;
    loopCount++;
    glide.resetBeat();
    session.jumpTo(startIndex, performance.now(), endIndex());
    judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    if (session.following) startFollowing(startIndex);
    else {
      highway.jumpTo(startIndex);
      if (settings.countInOn) { countIn.start(); renderNotes(); }
    }
  }

  // With a backing track on, the recording plays from the same note.
  function startFollowing(index: number) {
    following.start(piece.notes, index);
    if (track.active) track.playFrom(piece.notes, index);
  }

  function cancelGlide() {
    if (glide.cancel()) highway.jumpTo(currentIndex());
  }

  function moveOn(session: Session, previousMidi?: number) {
    holdProgress = 0;
    if (following.active) results.live(track.listening ? following.results : null);
    if (session.finished) {
      tuning.clear();
      if (settings.loopOn) loopAgain(session, previousMidi);
      else {
        doneAt = shownIndex();
        results.show(session, { results: following.results, listening: track.listening, section, pattern: piece.pattern, startIndex });
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
    if (settings.metronomeOn && !following.waiting && !track.active) metronome.tick(now, settings.bpm);
    if (following.active) {
      if (!session.finished) {
        // While the lanes move, the current note's progress. Moving on to the next resets it first.
        holdProgress = following.read(session, frequency, now) ?? holdProgress;
      }
    } else if (countIn.active) {
      if (countIn.tick(now)) renderNotes();
    } else if (!session.finished) {
      waiting.read(session, frequency, now);
    }
    highway.draw(piece.notes, shownIndex(), holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    listen: () => track.listening,
    onStart() {
      metronome.reset();
      // A backing track keeps moving like the music it is, so it always runs as "Don't wait".
      controls.session!.following = settings.followOn || track.active;
      highway.jumpTo(startIndex);
      beginRun(startIndex);
    },
    onStop() {
      track.pause();
      following.stop(doneAt !== null);
      countIn.cancel();
      cancelGlide();
      loopCount = 1;
      lastScore = null;
      holdProgress = 0;
      tuning.clear();
      renderNotes();
      toolbar.showModes(); // Today's plan, with the run just logged.
    },
  });
  const toolbar = createPracticeControls({
    run: controls, pieces, board, track, referenceButton: tone.button, loadPiece, render: renderNotes,
    piece: () => basePiece, section: () => section,
    resetBeat: () => glide.resetBeat(), clearStats: () => results.clear(),
    async onPick(picked) {
      await controls.stop();
      basePiece = picked;
      loadPiece();
    },
  });

  toolbar.showModes();
  rememberPiece(basePiece.id);
  track.load(basePiece.id);
  renderNotes();

  return {
    element: h(
      "section",
      { className: "practice" },
      ...(track.panel ? [track.panel] : [toolbar.optionsPanel, toolbar.todayPlan]),
      progress,
      toolbar.actions,
      toolbar.modeNote,
      tuning.element,
      board.timeline,
      ...(track.strip ? [track.strip] : []),
      results.element,
      board.sheet,
      toolbar.patternRow,
      countIn.overlay,
    ),
    leave() {
      tone.stop();
      track.leave();
      toolbar.leave();
      board.leave();
      return controls.leave();
    },
  };
}
