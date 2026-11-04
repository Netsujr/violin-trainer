import { createMetronome, FIRST_CLICK_DELAY_MS } from "../audio/metronome";
import { startReference } from "../audio/reference";
import { localNumber, localTitle, t } from "../i18n";
import { midiOf, noteLabels } from "../music/notes";
import { PATTERNS, withPattern, withRepeatedTop } from "../music/patterns";
import { createFollow } from "../practice/follow";
import { centsToTarget, createJudge } from "../practice/judge";
import { buildEntry, scorePercent } from "../practice/log";
import type { Session } from "../practice/session";
import { allPieces, getSettings, saveSettings } from "../storage";
import { h, type Screen } from "./dom";
import { createHighway } from "./highway";
import { contentWidth, setFullscreenLayout, timelineScale } from "./layout";
import { createNeedle } from "./listen";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { COMPRESS_ICON, createIconToggle, DONT_WAIT_ICON, EXPAND_ICON, LOOP_ICON } from "./toggles";

// Long enough for the tone to fade out as well as for the room to go quiet.
const REFERENCE_ECHO_MS = 300;
// A hit closer to the beat than this waits for the following beat, so the glide never looks rushed.
const MIN_GLIDE_BEATS = 0.1;
// With tempo on, a pattern note clears after about half its length, leaving the rest for the glide to the next beat.
// The mic's delay in hearing a note comes off that, or a short note would leave no room to come in slightly late.
const TEMPO_HOLD_SHARE = 0.5;
const MIC_DELAY_MS = 70;
const SHORTEST_TEMPO_HOLD_MS = 80;
// Otherwise it clears just short of its full length, because the mic takes a moment to hear a note start.
const FULL_HOLD_SHARE = 0.9;
const STAFF_SIDE_PADDING = 16;
const COUNT_IN_BEATS = 4;

export function practiceScreen(pieceId?: string): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
  const isScale = () => basePiece.source === "built-in";
  const buildPiece = () => withPattern(settings.repeatTopOn && isScale() ? withRepeatedTop(basePiece) : basePiece, settings.pattern);
  let piece = buildPiece();
  let mutedUntil = 0;
  let reference: ReturnType<typeof startReference> | null = null;
  // While looping: which time round this is, and the score of the one before, in place of the results card.
  let loopCount = 1;
  let lastScore: number | null = null;
  let holdProgress = 0;
  let startIndex = 0;
  let lastBeat: number | null = null;
  let pendingHit: { cents: number; at: number; arrivesAt: number } | null = null;
  // When "Don't wait" is on: the clock the lanes move to, in beats, negative during the count-in.
  let following: { tracker: ReturnType<typeof createFollow>; beat: number; at: number; results: Map<number, boolean>; counting: boolean } | null = null;

  const judge = createJudge({
    get toleranceCents() {
      return settings.toleranceCents;
    },
    get holdMs() {
      return holdMs();
    },
  });
  const metronome = createMetronome();
  const needle = createNeedle();
  const staffWidth = () => (contentWidth() - STAFF_SIDE_PADDING) / timelineScale();
  const staff = createStaff(staffWidth(), !settings.staffOpen, timelineScale());
  const highway = createHighway(startFrom, staff.follow);
  const staffToggle = h("button", {
    className: "staff-toggle",
    textContent: "▾",
    onclick() {
      settings.staffOpen = !settings.staffOpen;
      saveSettings();
      staff.setCollapsed(!settings.staffOpen);
      labelStaffToggle();
      renderNotes();
    },
  });
  const staffPanel = h("div", { className: "staff-panel" }, staff.element);
  const staffBar = h(
    "div",
    { className: "section-bar" },
    createIconToggle("staffFingers", renderNotes),
    createIconToggle("staffNames", renderNotes),
    staffToggle,
  );
  const timelineBar = h(
    "div",
    { className: "section-bar" },
    createIconToggle("fingers", renderNotes),
    createIconToggle("noteNames", renderNotes),
    createIconToggle("letterNames", renderNotes),
    createIconToggle("grid", renderNotes),
  );
  const showScale = () => staffPanel.style.setProperty("--timeline-scale", String(timelineScale()));
  showScale();

  // Only a real change of layout, not a phone's address bar sliding away.
  let fitted = `${contentWidth()}:${timelineScale()}`;
  function fitToScreen() {
    const size = `${contentWidth()}:${timelineScale()}`;
    if (size === fitted) return;

    fitted = size;
    showScale();
    highway.resize();
    staff.resize(staffWidth(), timelineScale());
    renderNotes();
  }
  addEventListener("resize", fitToScreen);
  const hertz = h("span");
  const progress = h("p");
  const stats = h("div", { className: "stats" });

  const currentIndex = () => controls.session?.index ?? startIndex;

  function labelStaffToggle() {
    const label = settings.staffOpen ? t.collapseSheet : t.showFullSheet;
    staffToggle.ariaExpanded = String(settings.staffOpen);
    staffToggle.ariaLabel = label;
    staffToggle.title = label;
  }
  labelStaffToggle();

  const beatMs = () => 60000 / settings.bpm;

  // A pattern note is held for its own length, not the usual short hold.
  function holdMs() {
    const index = currentIndex();
    const beats = piece.notes[index]?.beats;
    if (!beats) return settings.holdMs;

    const noteMs = beats * beatMs();
    if (settings.tempoOn && index < piece.notes.length - 1) {
      return Math.max(SHORTEST_TEMPO_HOLD_MS, noteMs * TEMPO_HOLD_SHARE - MIC_DELAY_MS);
    }
    return noteMs * FULL_HOLD_SHARE;
  }

  function loadPiece() {
    piece = buildPiece();
    showModes();
    stats.replaceChildren();
    startIndex = 0;
    highway.jumpTo(0);
    renderNotes();
  }

  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  function renderNotes() {
    const index = currentIndex();
    const note = piece.notes[index];
    staff.draw(piece.notes, index, { names: settings.toggles.staffNames, fingers: settings.toggles.staffFingers });
    const noteText = note ? `${t.noteOf(index + 1, piece.notes.length)}${note.bar ? t.bar(note.bar) : ""}` : t.allDone(piece.notes.length);
    progress.textContent = withLoopNumber(following?.counting ? t.startsIn(COUNT_IN_BEATS) : noteText);
    if (note) reference?.setNote(midiOf(note.pitch));
    else stopReferenceTone();
    highway.draw(piece.notes, index, holdProgress);
  }

  function runSummary(passes: number, seconds: string) {
    if (piece.pattern) return t.patternDone(piece.pattern + 1, seconds);
    return startIndex === 0 ? t.passDone(passes, seconds) : t.partialDone(startIndex + 1, seconds);
  }

  const playAgainButton = () =>
    h("button", { textContent: t.playAgain, onclick: () => (controls.session ? startFrom(startIndex) : controls.startButton.click()) });

  function showScore(results: Map<number, boolean>) {
    const hit = [...results.values()].filter(Boolean).length;
    stats.replaceChildren(
      h("p", { className: "score" }, t.score(scorePercent(hit, results.size))),
      h("p", {}, t.hitMissed(hit, results.size - hit)),
      playAgainButton(),
    );
  }

  function showStats(session: Session) {
    if (following) return showScore(following.results);

    const entry = buildEntry(session, performance.now());
    const slowest = entry.slowest
      .map((note) => `${noteLabels(note.pitch).solfege} (${localNumber(note.seconds, 1)} s)`)
      .join(", ");
    const seconds = localNumber(session.lastRunSeconds, 0);
    const cents = entry.averageCents === null ? null : Math.round(entry.averageCents);
    stats.replaceChildren(
      h("p", {}, runSummary(entry.passes, seconds)),
      h("p", {}, t.summary(t.hitSkipped(entry.notesHit, entry.notesSkipped), cents)),
      h("p", {}, t.slowest(slowest || t.slowestNone)),
      playAgainButton(),
    );
  }

  function startFrom(index: number) {
    cancelGlide();
    lastBeat = null;
    startIndex = index;
    const session = controls.session;
    if (session) {
      session.jumpTo(index, performance.now());
      judge.setTarget(session.currentMidi);
      if (session.following) startFollowing(index);
    }
    holdProgress = 0;
    loopCount = 1;
    lastScore = null;
    stats.replaceChildren();
    renderNotes();
  }

  // Goes round again with no results card in the way. The last note and the first can be the same, so it needs a fresh bow.
  function loopAgain(session: Session, previousMidi?: number) {
    if (following) {
      const results = [...following.results.values()];
      lastScore = scorePercent(results.filter(Boolean).length, results.length);
    }
    loopCount++;
    lastBeat = null;
    session.jumpTo(startIndex, performance.now());
    judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    if (session.following) startFollowing(startIndex);
    else highway.jumpTo(startIndex);
  }

  // The first click comes after a short delay and counts in the first note, so the two share a beat.
  function startFollowing(index: number) {
    const tracker = createFollow(piece.notes, index, () => settings.toleranceCents);
    const beat = tracker.startBeat - COUNT_IN_BEATS - FIRST_CLICK_DELAY_MS / beatMs();
    following = { tracker, beat, at: performance.now(), results: new Map(), counting: true };
    metronome.reset();
    highway.showResults(following.results);
    highway.jumpTo(index);
  }

  function stopFollowing() {
    following = null;
    highway.showResults(null);
  }

  // The speakers mustn't score a hit, so what the mic hears doesn't count during a reference tone or just after it.
  const isMuted = (now: number) => reference !== null || now < mutedUntil;

  function followReading(session: Session, frequency: number | null, now: number) {
    const state = following!;
    const stepBeats = (now - state.at) / beatMs();
    state.at = now;
    state.beat += stepBeats;
    const heard = isMuted(now) ? null : frequency;
    // What the mic hears now was played a moment ago.
    const micBeat = state.beat - MIC_DELAY_MS / beatMs();
    for (const { index, hit, cents } of state.tracker.update(heard, micBeat, stepBeats)) {
      state.results.set(index, hit);
      if (hit) {
        const startedAt = now - MIC_DELAY_MS - (micBeat - state.tracker.starts[index]) * beatMs();
        // A recording's marker sits one hold time before this, which puts it where the note starts.
        session.hit(cents, startedAt + settings.holdMs, now);
      } else session.skip(now);
      holdProgress = 0;
      moveOn(session);
    }
    // Looping has already started the next time round.
    if (following !== state) return;

    if (state.counting) {
      const left = state.tracker.startBeat - state.beat;
      if (left > 0) progress.textContent = withLoopNumber(t.startsIn(Math.min(COUNT_IN_BEATS, Math.ceil(left))));
      else {
        state.counting = false;
        renderNotes();
      }
    }
    highway.moveToBeat(Math.max(state.tracker.startBeat, Math.min(state.beat, state.tracker.starts[piece.notes.length])));
    if (session.finished) return;

    holdProgress = state.tracker.progress;
    needle.show(frequency === null ? null : centsToTarget(frequency, session.currentMidi));
    hertz.textContent = frequency === null ? "" : `${localNumber(frequency, 1)} Hz`;
  }

  // With tempo on, a hit waits for the next beat while the timeline glides there.
  // A hit lands one hold time after the bow starts, so the first note's start sets the beat, not its hit.
  function glideToNextNote(session: Session, cents: number, now: number) {
    const noteMs = (session.current.beats ?? 1) * beatMs();
    const gridMs = Math.min(noteMs, beatMs());
    // With the metronome on, the first note joins its beat instead of setting one.
    const attack = now - holdMs();
    const clickBeat = settings.metronomeOn ? metronome.nearestBeat(attack, settings.bpm) : null;
    const due = (lastBeat ?? clickBeat ?? attack) + noteMs;
    lastBeat = due + Math.max(0, Math.ceil((now + MIN_GLIDE_BEATS * gridMs - due) / gridMs)) * gridMs;
    pendingHit = { cents, at: now, arrivesAt: lastBeat };
    judge.setTarget(session.currentMidi, session.currentMidi);
    highway.glideTo(session.index + 1, lastBeat - now);
  }

  function arriveOnBeat(session: Session) {
    const { cents, at, arrivesAt } = pendingHit!;
    pendingHit = null;
    const previousMidi = session.currentMidi;
    const released = judge.released;
    session.hit(cents, at, arrivesAt);
    moveOn(session, released ? undefined : previousMidi);
  }

  function cancelGlide() {
    if (!pendingHit) return;

    pendingHit = null;
    highway.jumpTo(currentIndex());
  }

  function moveOn(session: Session, previousMidi?: number) {
    holdProgress = 0;
    if (session.finished) {
      needle.show(null);
      hertz.textContent = "";
      if (settings.loopOn) loopAgain(session, previousMidi);
      else showStats(session);
    }
    // Fast bow changes are too short to detect, so inside a pattern the beat and hold time separate repeated notes.
    else judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    renderNotes();
  }

  function onReading(frequency: number | null, now: number) {
    const session = controls.session!;
    if (settings.metronomeOn) metronome.tick(now, settings.bpm);
    if (following) {
      if (!session.finished) followReading(session, frequency, now);
    } else if (!session.finished) {
      if (pendingHit && now >= pendingHit.arrivesAt) arriveOnBeat(session);
      const verdict = judge.update(isMuted(now) ? null : frequency, now);
      holdProgress = pendingHit ? 1 : verdict.progress;
      needle.show(verdict.cents);
      hertz.textContent = frequency === null ? "" : `${localNumber(frequency, 1)} Hz`;
      if (verdict.hit && !pendingHit) {
        if (settings.tempoOn && session.index < piece.notes.length - 1) {
          glideToNextNote(session, verdict.averageCents, now);
        } else {
          const previousMidi = session.currentMidi;
          session.hit(verdict.averageCents, now);
          moveOn(session, previousMidi);
        }
      }
    }
    highway.draw(piece.notes, session.index, holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    onStart() {
      metronome.reset();
      controls.session!.following = settings.followOn;
      highway.jumpTo(startIndex);
      startFrom(startIndex);
    },
    onStop() {
      stopFollowing();
      cancelGlide();
      loopCount = 1;
      lastScore = null;
      holdProgress = 0;
      needle.show(null);
      hertz.textContent = "";
      renderNotes();
    },
  });

  const pieceSelect = h(
    "select",
    {
      onchange: async () => {
        await controls.stop();
        basePiece = pieces.find((candidate) => candidate.id === pieceSelect.value)!;
        loadPiece();
      },
    },
    ...pieces.map((candidate) =>
      h("option", { value: candidate.id, selected: candidate === basePiece, textContent: localTitle(candidate.id, candidate.title) }),
    ),
  );

  const referenceButton = h("button", {
    textContent: t.playReference,
    className: "secondary outline",
    ariaPressed: "false",
    onclick() {
      const note = piece.notes[currentIndex()];
      if (reference) stopReferenceTone();
      else if (note) {
        reference = startReference(midiOf(note.pitch));
        referenceButton.textContent = t.stopReference;
        referenceButton.ariaPressed = "true";
      }
    },
  });

  function stopReferenceTone() {
    if (!reference) return;

    reference.stop();
    reference = null;
    mutedUntil = performance.now() + REFERENCE_ECHO_MS;
    referenceButton.textContent = t.playReference;
    referenceButton.ariaPressed = "false";
  }

  const bpmValue = h("output", { textContent: `${settings.bpm} BPM` });
  const bpmControl = h(
    "label",
    { className: "bpm" },
    h("input", {
      type: "range",
      min: "30",
      max: "120",
      step: "1",
      value: String(settings.bpm),
      oninput(event) {
        settings.bpm = Number((event.target as HTMLInputElement).value);
        bpmValue.textContent = `${settings.bpm} BPM`;
        lastBeat = null;
        saveSettings();
      },
    }),
    bpmValue,
  );
  // Tempo smooths the move to the next note after a hit, which has no meaning when the lanes don't wait for one.
  const tempoInput = h("input", {
    type: "checkbox",
    checked: settings.tempoOn,
    disabled: settings.followOn,
    onchange() {
      settings.tempoOn = tempoInput.checked;
      saveSettings();
    },
  });
  const tempoSwitch = h("label", {}, tempoInput, ` ${t.tempo}`);
  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    repeatTopButton.disabled = !isScale();
    modeNote.textContent = [
      settings.followOn ? t.keepsMoving : t.waitsForNotes,
      settings.loopOn ? t.loopsUntilStop : t.playsOnce,
      ...(isScale() ? [settings.repeatTopOn ? t.topTwice : t.topOnce] : []),
    ].join(" · ");
  }

  const loopButton = h("button", {
    className: "secondary outline icon-button",
    innerHTML: LOOP_ICON,
    title: t.loop,
    ariaLabel: t.loop,
    ariaPressed: String(settings.loopOn),
    onclick() {
      settings.loopOn = !settings.loopOn;
      loopButton.ariaPressed = String(settings.loopOn);
      saveSettings();
      showModes();
    },
  });
  const repeatTopButton = h("button", {
    className: "secondary outline icon-button",
    textContent: "×2",
    title: t.repeatTop,
    ariaLabel: t.repeatTop,
    ariaPressed: String(settings.repeatTopOn),
    async onclick() {
      await controls.stop();
      settings.repeatTopOn = !settings.repeatTopOn;
      repeatTopButton.ariaPressed = String(settings.repeatTopOn);
      saveSettings();
      loadPiece();
    },
  });
  const followButton = h("button", {
    className: "secondary outline icon-button",
    innerHTML: DONT_WAIT_ICON,
    title: `${t.dontWait}: ${t.dontWaitHint}`,
    ariaLabel: t.dontWait,
    ariaPressed: String(settings.followOn),
    async onclick() {
      await controls.stop();
      settings.followOn = !settings.followOn;
      followButton.ariaPressed = String(settings.followOn);
      tempoInput.disabled = settings.followOn;
      saveSettings();
      showModes();
      stats.replaceChildren();
      renderNotes();
    },
  });
  const metronomeSwitch = h(
    "label",
    {},
    h("input", {
      type: "checkbox",
      checked: settings.metronomeOn,
      onchange(event) {
        settings.metronomeOn = (event.target as HTMLInputElement).checked;
        lastBeat = null;
        saveSettings();
      },
    }),
    ` ${t.metronome}`,
  );
  const optionsBpmRow = h("div", { className: "row" }, pieceSelect, controls.recordLabel, bpmControl);
  const optionsPanel = h(
    "details",
    {
      className: "options",
      open: settings.optionsOpen,
      ontoggle() {
        settings.optionsOpen = optionsPanel.open;
        saveSettings();
      },
    },
    h("summary", {}, t.options),
    h("div", { className: "row toggles" }, tempoSwitch, metronomeSwitch),
    optionsBpmRow,
  );

  let fullscreen = false;
  const fullscreenButton = h("button", { className: "secondary outline icon-button", onclick: toggleFullscreen });
  const actions = h("div", { className: "row actions" }, controls.startButton, referenceButton, controls.message, loopButton, repeatTopButton, followButton, fullscreenButton);

  function labelFullscreenButton() {
    const label = fullscreen ? t.exitFullscreen : t.fullscreen;
    fullscreenButton.innerHTML = fullscreen ? COMPRESS_ICON : EXPAND_ICON;
    fullscreenButton.title = label;
    fullscreenButton.ariaLabel = label;
  }
  labelFullscreenButton();

  function setFullscreen(value: boolean) {
    fullscreen = value;
    setFullscreenLayout(value);
    document.documentElement.classList.toggle("fullscreen", value);
    if (value) actions.insertBefore(bpmControl, loopButton);
    else optionsBpmRow.append(bpmControl);
    // A full sheet wouldn't fit, so fullscreen uses the moving line, without changing the saved choice.
    staff.setCollapsed(value || !settings.staffOpen);
    labelFullscreenButton();
    fitToScreen();
    renderNotes();
  }

  // Works without the browser's own fullscreen too, which iPhones don't offer to web pages.
  function toggleFullscreen() {
    setFullscreen(!fullscreen);
    if (fullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen();
  }

  function onFullscreenChange() {
    if (fullscreen && !document.fullscreenElement) setFullscreen(false);
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && fullscreen) toggleFullscreen();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  addEventListener("keydown", onKeyDown);

  const patternButtons = PATTERNS.map((_, pattern) =>
    h("button", {
      textContent: String(pattern + 1),
      title: `${t.pattern} ${pattern + 1}`,
      ariaPressed: String(pattern === settings.pattern),
      async onclick() {
        await controls.stop();
        settings.pattern = pattern;
        saveSettings();
        patternButtons.forEach((button, index) => (button.ariaPressed = String(index === pattern)));
        loadPiece();
      },
    }),
  );

  showModes();
  renderNotes();

  return {
    element: h(
      "section",
      { className: "practice" },
      optionsPanel,
      progress,
      actions,
      modeNote,
      h("div", { className: "row tuning" }, needle.element, hertz),
      h("div", { className: "timeline-section" }, timelineBar, highway.element),
      stats,
      h("div", { className: "staff-section" }, staffBar, staffPanel),
      h("div", { className: "row patterns" }, t.pattern, h("div", { role: "group", ariaLabel: t.pattern }, ...patternButtons)),
    ),
    leave() {
      stopReferenceTone();
      if (fullscreen) toggleFullscreen();
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      removeEventListener("keydown", onKeyDown);
      removeEventListener("resize", fitToScreen);
      return controls.leave();
    },
  };
}
