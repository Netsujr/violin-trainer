import { createMetronome } from "../../audio/metronome";
import { t } from "../../i18n";
import { midiOf } from "../../music/notes";
import { withPattern, withRepeatedTop } from "../../music/patterns";
import { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { allPieces, getSettings, isScale } from "../../storage";
import { h, type Screen } from "../dom";
import type { Section } from "../highway";
import { createRunControls } from "../runControls";
import { createBackingTrack } from "./backingTrack";
import { createCountIn } from "./countIn";
import { createFollowing } from "./following";
import { createPracticeControls } from "./practiceControls";
import { createReferenceTone } from "./referenceTone";
import { playedAlongCard, scoreCard, statsCard } from "./results";
import { createStaffSection } from "./staffSection";
import { createTempoGlide } from "./tempoGlide";
import { holdMsFor } from "./timing";
import { createTuning } from "./tuning";
import { createWaitingRun } from "./waitingRun";

// aligning, when given, opens the piece to line its backing track up, and is the way back to Library.
export function practiceScreen(pieceId?: string, aligning?: () => void): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
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

  const currentIndex = () => controls.session?.index ?? startIndex;
  const endIndex = () => (section ? section.last + 1 : piece.notes.length);
  // A finished section stays on its last note, rather than moving on to the one after it.
  const shownIndex = () => (controls.session?.finished && section ? section.last : currentIndex());
  const holdMs = () => holdMsFor(piece.notes[currentIndex()]?.beats, settings.tempoOn && currentIndex() < endIndex() - 1);
  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  const judge = createJudge({ get toleranceCents() { return settings.toleranceCents; }, get holdMs() { return holdMs(); } });
  const metronome = createMetronome();
  const progress = h("p");
  const stats = h("div", { className: "stats" });
  const board = createStaffSection(pickNote, renderNotes, (beat) => track.showBeat(beat));
  const { staff, highway } = board;
  const tuning = createTuning(staff);
  const countIn = createCountIn(metronome, (text) => (progress.textContent = withLoopNumber(text)));
  const glide = createTempoGlide(metronome, judge, highway);
  const tone = createReferenceTone(() => (controls.session?.finished ? undefined : piece.notes[currentIndex()]));
  const track = createBackingTrack({ aligning: aligning ?? null, stopRun: () => controls.stop(), onChange: () => toolbar.showModes() });
  const following = createFollowing({ metronome, highway, staff, showReading: tuning.show, isMuted: tone.isMuted, endIndex, track, moveOn });
  const showProgress = (value: number) => (holdProgress = value);
  const waiting = createWaitingRun({ judge, glide, staff, showReading: tuning.show, isMuted: tone.isMuted, endIndex, holdMs, showProgress, moveOn });

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
    track.load(basePiece.id);
    stats.replaceChildren();
    startIndex = 0;
    highway.jumpTo(0);
    renderNotes();
  }

  function renderNotes() {
    const finished = controls.session?.finished ?? false;
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

  const playAgainButton = () =>
    h("button", { textContent: t.playAgain, onclick: () => (controls.session ? beginRun(startIndex) : controls.startButton.click()) });

  function showStats(session: Session) {
    const results = following.results;
    const card = !track.listening ? playedAlongCard() : results ? scoreCard(results) : statsCard(session, { section, pattern: piece.pattern, startIndex });
    stats.replaceChildren(...card, playAgainButton());
  }

  function startFrom(index: number) {
    cancelGlide();
    countIn.cancel();
    glide.resetBeat();
    startIndex = index;
    const session = controls.session;
    if (session) {
      session.jumpTo(index, performance.now(), endIndex());
      judge.setTarget(session.currentMidi);
      if (session.following) startFollowing(index);
    }
    holdProgress = 0;
    loopCount = 1;
    lastScore = null;
    stats.replaceChildren();
    renderNotes();
  }

  // Start and Play again pause first. Clicking a note doesn't, so moving past a stuck note stays quick.
  function beginRun(index: number) {
    startFrom(index);
    const session = controls.session;
    if (session && !session.following && settings.countInOn) { countIn.start(); renderNotes(); }
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
    if (session.finished) {
      tuning.clear();
      if (settings.loopOn) loopAgain(session, previousMidi);
      else showStats(session);
    }
    // Fast bow changes are too short to detect, so inside a pattern the beat and hold time separate repeated notes.
    else judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    renderNotes();
  }

  // Each reading from the mic: "Don't wait" moves the lanes on, a count-in counts down, and otherwise the note waits to be played.
  function onReading(frequency: number | null, now: number) {
    const session = controls.session!;
    if (settings.metronomeOn && !following.waiting && !track.active) metronome.tick(now, settings.bpm);
    if (following.active) {
      if (!session.finished) {
        const noteProgress = following.read(session, frequency, now);
        if (noteProgress !== null) holdProgress = noteProgress;
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
      following.stop();
      countIn.cancel();
      cancelGlide();
      loopCount = 1;
      lastScore = null;
      holdProgress = 0;
      tuning.clear();
      renderNotes();
    },
  });
  const toolbar = createPracticeControls({
    run: controls, pieces, board, track, referenceButton: tone.button, loadPiece, render: renderNotes,
    piece: () => basePiece, section: () => section,
    resetBeat: () => glide.resetBeat(),
    clearStats: () => stats.replaceChildren(),
    async onPick(picked) {
      await controls.stop();
      basePiece = picked;
      loadPiece();
    },
  });

  toolbar.showModes();
  track.load(basePiece.id);
  renderNotes();

  return {
    element: h(
      "section",
      { className: "practice" },
      track.panel ?? toolbar.optionsPanel,
      progress,
      toolbar.actions,
      toolbar.modeNote,
      tuning.element,
      board.timeline,
      ...(track.strip ? [track.strip] : []),
      stats,
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
