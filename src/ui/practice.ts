import { createMetronome, FIRST_CLICK_DELAY_MS } from "../audio/metronome";
import { startReference } from "../audio/reference";
import { localNumber, localTitle, t } from "../i18n";
import { midiOf, noteLabels } from "../music/notes";
import { PATTERNS, withPattern, withRepeatedTop } from "../music/patterns";
import { createFollow } from "../practice/follow";
import { centsToTarget, createJudge } from "../practice/judge";
import { buildEntry, scorePercent } from "../practice/log";
import type { Session } from "../practice/session";
import { allPieces, COUNT_IN_CHOICES, getSettings, isHighlighted, isScale, pieceGroups, saveSettings, type Settings } from "../storage";
import { h, type Screen } from "./dom";
import { createHighway, type Section } from "./highway";
import { contentWidth, setFullscreenLayout, staffScale, timelineScale } from "./layout";
import { createNeedle } from "./listen";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { COMPRESS_ICON, createIconToggle, DONT_WAIT_ICON, EXPAND_ICON, LOOP_ICON, STAFF_ICON } from "./toggles";

const REFERENCE_ECHO_MS = 150;
// A hit closer to the beat than this waits for the following beat, so the glide never looks rushed.
const MIN_GLIDE_BEATS = 0.1;
// With tempo on, a note with a written length clears after about half of it, leaving the rest for the glide to the next beat.
// The mic's delay in hearing a note comes off that, or a short note would leave no room to come in slightly late.
const TEMPO_HOLD_SHARE = 0.5;
const MIC_DELAY_MS = 70;
const SHORTEST_TEMPO_HOLD_MS = 80;
// Otherwise it clears just short of its full length, because the mic takes a moment to hear a note start.
const FULL_HOLD_SHARE = 0.9;
const STAFF_SIDE_PADDING = 16;

export function practiceScreen(pieceId?: string): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
  // Rhythm patterns and the repeated top note are scale drills, so songs play as written.
  const buildPiece = () =>
    isScale(basePiece) ? withPattern(settings.repeatTopOn ? withRepeatedTop(basePiece) : basePiece, settings.pattern) : basePiece;
  let piece = buildPiece();
  let mutedUntil = 0;
  let reference: ReturnType<typeof startReference> | null = null;
  // The selected notes, and the note that Shift+click selects from.
  let section: Section | null = null;
  let sectionAnchor = 0;
  // While looping: which time round this is, and the score of the one before, in place of the results card.
  let loopCount = 1;
  let lastScore: number | null = null;
  let holdProgress = 0;
  let startIndex = 0;
  let lastBeat: number | null = null;
  let pendingHit: { cents: number; at: number; arrivesAt: number } | null = null;
  // The pause before a sheet when the notes wait for the player, counting down in beats so a BPM change applies.
  let countIn: { beatsLeft: number; at: number } | null = null;
  // When "Don't wait" is on: the clock the lanes move to, in beats, negative during the count-in.
  // Until the first note is played in tune, waiting holds when it came in tune.
  let following: { tracker: ReturnType<typeof createFollow>; beat: number; at: number; results: Map<number, boolean>; waiting: { inTuneSince: number | null } | null } | null = null;

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
  const staffWidth = () => (contentWidth() - STAFF_SIDE_PADDING) / staffScale();
  const staff = createStaff(staffWidth(), !settings.staffOpen, staffScale(), pickNote);
  const highway = createHighway(pickNote, staff.follow);
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
  const staffPanel = h("div", { className: "staff-panel" }, staff.element, staffToggle);
  const timelineBar = h(
    "div",
    { className: "section-bar" },
    createIconToggle("fingers", renderNotes),
    createIconToggle("noteNames", renderNotes),
    createIconToggle("letterNames", renderNotes),
    createIconToggle("grid", renderNotes),
  );
  const showScale = () => staffPanel.style.setProperty("--timeline-scale", String(staffScale()));
  showScale();

  // Only a real change of layout, not a phone's address bar sliding away.
  let fitted = `${contentWidth()}:${timelineScale()}:${staffScale()}`;
  function fitToScreen() {
    const size = `${contentWidth()}:${timelineScale()}:${staffScale()}`;
    if (size === fitted) return;

    fitted = size;
    showScale();
    highway.resize();
    staff.resize(staffWidth(), staffScale());
    renderNotes();
  }
  addEventListener("resize", fitToScreen);
  const hertz = h("span");
  const progress = h("p");
  const stats = h("div", { className: "stats" });

  const currentIndex = () => controls.session?.index ?? startIndex;
  const endIndex = () => (section ? section.last + 1 : piece.notes.length);

  function pickNote(index: number, extend: boolean) {
    if (extend) section = { first: Math.min(sectionAnchor, index), last: Math.max(sectionAnchor, index) };
    else {
      section = null;
      sectionAnchor = index;
    }
    highway.showSection(section);
    showModes();
    startFrom(section ? section.first : index);
  }

  function labelStaffToggle() {
    const label = settings.staffOpen ? t.collapseSheet : t.showFullSheet;
    staffToggle.ariaExpanded = String(settings.staffOpen);
    staffToggle.ariaLabel = label;
    staffToggle.title = label;
  }
  labelStaffToggle();

  const beatMs = () => 60000 / settings.bpm;

  // A note with a written length is held for that long, not the usual short hold.
  function holdMs() {
    const index = currentIndex();
    const beats = piece.notes[index]?.beats;
    if (!beats) return settings.holdMs;

    const noteMs = beats * beatMs();
    if (settings.tempoOn && index < endIndex() - 1) {
      return Math.max(SHORTEST_TEMPO_HOLD_MS, noteMs * TEMPO_HOLD_SHARE - MIC_DELAY_MS);
    }
    return noteMs * FULL_HOLD_SHARE;
  }

  function loadPiece() {
    piece = buildPiece();
    section = null;
    sectionAnchor = 0;
    highway.showSection(null);
    showModes();
    stats.replaceChildren();
    startIndex = 0;
    highway.jumpTo(0);
    renderNotes();
  }

  const withLoopNumber = (text: string) => (loopCount > 1 ? `${text} · ${t.loopNumber(loopCount, lastScore)}` : text);

  // A finished section stays on its last note, rather than moving on to the one after it.
  const shownIndex = () => (controls.session?.finished && section ? section.last : currentIndex());

  function renderNotes() {
    const finished = controls.session?.finished ?? false;
    const index = shownIndex();
    const note = finished ? undefined : piece.notes[index];
    staff.draw(piece.notes, index, { names: settings.toggles.noteNames, fingers: settings.toggles.fingers }, section);
    const noteText = note ? t.noteOf(index + 1, piece.notes.length) : t.allDone(section ? section.last - section.first + 1 : piece.notes.length);
    const counting = countIn !== null;
    progress.textContent = withLoopNumber(counting ? t.startsIn(settings.countInBeats) : noteText);
    if (!counting) countdown.hidden = true;
    if (note) reference?.setNote(midiOf(note.pitch));
    else stopReferenceTone();
    highway.draw(piece.notes, index, holdProgress);
  }

  function runSummary(passes: number, seconds: string) {
    if (section) return t.sectionDone(section.first + 1, section.last + 1, seconds);
    if (piece.pattern) return t.patternDone(piece.pattern + 1, seconds);
    return startIndex === 0 ? t.passDone(passes, seconds) : t.partialDone(startIndex + 1, seconds);
  }

  const playAgainButton = () =>
    h("button", { textContent: t.playAgain, onclick: () => (controls.session ? beginRun(startIndex) : controls.startButton.click()) });

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
    stats.replaceChildren(
      h("p", {}, runSummary(entry.passes, seconds)),
      h("p", {}, t.summary(t.hitSkipped(entry.notesHit, 0), Math.round(entry.averageCents ?? 0))),
      h("p", {}, t.slowest(slowest)),
      playAgainButton(),
    );
  }

  function startFrom(index: number) {
    cancelGlide();
    countIn = null;
    lastBeat = null;
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

  // The first click comes after a short delay and counts in the first note, so the two share a beat.
  function startCountIn() {
    metronome.reset(settings.countInBeats);
    countIn = { beatsLeft: settings.countInBeats + FIRST_CLICK_DELAY_MS / beatMs(), at: performance.now() };
    renderNotes();
  }

  // Fullscreen also shows the count over everything, fading to 10% just before the first note.
  const countdown = h("div", { className: "countdown", hidden: true, ariaHidden: "true" });
  const showCountdown = (beatsLeft: number) => {
    const count = Math.min(settings.countInBeats, Math.ceil(beatsLeft));
    progress.textContent = withLoopNumber(t.startsIn(count));
    countdown.hidden = false;
    countdown.textContent = String(count);
    countdown.style.opacity = String(0.1 + 0.8 * Math.min(1, beatsLeft / settings.countInBeats));
  };

  function tickCountIn(now: number) {
    const state = countIn!;
    state.beatsLeft -= (now - state.at) / beatMs();
    state.at = now;
    if (state.beatsLeft > 0) {
      showCountdown(state.beatsLeft);
      return;
    }
    countIn = null;
    renderNotes();
  }

  // Start and Play again pause first. Clicking a note doesn't, so moving past a stuck note stays quick.
  function beginRun(index: number) {
    startFrom(index);
    const session = controls.session;
    if (session && !session.following && settings.countInOn) startCountIn();
  }

  // Goes round again with no results card in the way. The last note and the first can be the same, so it needs a fresh bow.
  function loopAgain(session: Session, previousMidi?: number) {
    if (following) {
      const results = [...following.results.values()];
      lastScore = scorePercent(results.filter(Boolean).length, results.length);
    }
    loopCount++;
    lastBeat = null;
    session.jumpTo(startIndex, performance.now(), endIndex());
    judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    if (session.following) startFollowing(startIndex);
    else {
      highway.jumpTo(startIndex);
      if (settings.countInOn) startCountIn();
    }
  }

  // The lanes hold on the first note until it's played in tune, then keep moving from there.
  function startFollowing(index: number) {
    const tracker = createFollow(piece.notes, index, () => settings.toleranceCents, endIndex());
    following = { tracker, beat: tracker.startBeat, at: performance.now(), results: new Map(), waiting: { inTuneSince: null } };
    metronome.reset();
    highway.showResults(following.results);
    highway.jumpTo(index);
  }

  function showReading(cents: number | null, frequency: number | null) {
    needle.show(cents);
    hertz.textContent = frequency === null ? "" : `${localNumber(frequency, 1)} Hz`;
  }

  function clearReading() {
    showReading(null, null);
    staff.hidePlayed();
  }

  // The speakers mustn't score a hit, so what the mic hears doesn't count during a reference tone or just after it.
  const isMuted = (now: number) => reference !== null || now < mutedUntil;

  function followReading(session: Session, frequency: number | null, now: number) {
    const state = following!;
    if (state.waiting) {
      waitForFirstNote(session, frequency, now);
      return;
    }
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
      } else session.miss(now);
      moveOn(session);
    }
    // Looping has already started the next time round.
    if (following !== state) return;

    highway.moveToBeat(Math.max(state.tracker.startBeat, Math.min(state.beat, state.tracker.starts[endIndex()])));
    if (session.finished) return;

    holdProgress = state.tracker.progress;
    const cents = frequency === null ? null : centsToTarget(frequency, session.currentMidi);
    showReading(cents, frequency);
    const played = heard === null || state.beat < state.tracker.startBeat ? null : cents;
    staff.showPlayed(session.index, played, played !== null && Math.abs(played) <= settings.toleranceCents);
  }

  // Once the first note has been in tune for the hold time, the lanes start as if it began when it came in tune.
  function waitForFirstNote(session: Session, frequency: number | null, now: number) {
    const state = following!;
    const waiting = state.waiting!;
    const cents = frequency === null || isMuted(now) ? null : centsToTarget(frequency, session.currentMidi);
    const inTune = cents !== null && Math.abs(cents) <= settings.toleranceCents;
    waiting.inTuneSince = inTune ? (waiting.inTuneSince ?? now) : null;
    showReading(cents, frequency);
    staff.showPlayed(session.index, cents, inTune);
    if (waiting.inTuneSince === null || now - waiting.inTuneSince < settings.holdMs) return;

    state.waiting = null;
    state.at = now;
    state.beat = state.tracker.startBeat + (now - waiting.inTuneSince) / beatMs();
    // The metronome joins on the next whole beat, accenting each bar's first.
    const nextBeat = Math.ceil(state.beat);
    metronome.reset(4 - (nextBeat % 4), now + (nextBeat - state.beat) * beatMs());
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
      clearReading();
      if (settings.loopOn) loopAgain(session, previousMidi);
      else showStats(session);
    }
    // Fast bow changes are too short to detect, so inside a pattern the beat and hold time separate repeated notes.
    else judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    renderNotes();
  }

  function onReading(frequency: number | null, now: number) {
    const session = controls.session!;
    if (settings.metronomeOn && !following?.waiting) metronome.tick(now, settings.bpm);
    if (following) {
      if (!session.finished) followReading(session, frequency, now);
    } else if (countIn) {
      tickCountIn(now);
    } else if (!session.finished) {
      if (pendingHit && now >= pendingHit.arrivesAt) arriveOnBeat(session);
      const verdict = judge.update(isMuted(now) ? null : frequency, now);
      holdProgress = pendingHit ? 1 : verdict.progress;
      showReading(verdict.cents, frequency);
      staff.showPlayed(session.index, verdict.cents, verdict.inTune);
      if (verdict.hit && !pendingHit) {
        if (settings.tempoOn && session.index < endIndex() - 1) {
          glideToNextNote(session, verdict.averageCents, now);
        } else {
          const previousMidi = session.currentMidi;
          session.hit(verdict.averageCents, now);
          moveOn(session, previousMidi);
        }
      }
    }
    highway.draw(piece.notes, shownIndex(), holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    onStart() {
      metronome.reset();
      controls.session!.following = settings.followOn;
      highway.jumpTo(startIndex);
      beginRun(startIndex);
    },
    onStop() {
      following = null;
      highway.showResults(null);
      countIn = null;
      cancelGlide();
      loopCount = 1;
      lastScore = null;
      holdProgress = 0;
      clearReading();
      renderNotes();
    },
  });

  // A menu in three groups, scales, the songs that come with the app, and songs added later or imported, each opening on hover or tap.
  const pieceTitle = (candidate: (typeof pieces)[number]) => localTitle(candidate.id, candidate.title);
  const pieceMenu = h(
    "div",
    { className: "piece-menu", popover: "auto", role: "menu" },
    ...pieceGroups(pieces)
      .filter(([, group]) => group.length > 0)
      .map(([key, group]) =>
        h(
          "div",
          { className: "piece-group" },
          h("button", { type: "button", ariaHasPopup: "menu", textContent: t[key] }),
          h(
            "div",
            { className: "piece-submenu", role: "menu" },
            ...group.map((candidate) =>
              h("button", {
                type: "button",
                role: "menuitem",
                value: candidate.id,
                className: isHighlighted(candidate) ? "highlighted" : "",
                textContent: pieceTitle(candidate),
                async onclick() {
                  pieceMenu.hidePopover();
                  await controls.stop();
                  basePiece = candidate;
                  pieceSelect.textContent = pieceTitle(candidate);
                  loadPiece();
                },
              }),
            ),
          ),
        ),
      ),
  );
  const pieceSelect = h("button", { type: "button", className: "piece-select", ariaHasPopup: "menu", textContent: pieceTitle(basePiece), popoverTargetElement: pieceMenu });
  // The menu sits in the top layer, so it's placed under its button each time it opens.
  pieceMenu.addEventListener("toggle", () => {
    const { left, bottom } = pieceSelect.getBoundingClientRect();
    pieceMenu.style.left = `${left}px`;
    pieceMenu.style.top = `${bottom + 4}px`;
  });

  const referenceButton = h("button", {
    textContent: t.playReference,
    className: "secondary outline",
    ariaPressed: "false",
    onclick() {
      const note = controls.session?.finished ? undefined : piece.notes[currentIndex()];
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
  type OptionKey = { [Key in keyof Settings]: Settings[Key] extends boolean ? Key : never }[keyof Settings];
  function optionSwitch(key: OptionKey, label: string, title = "", onChange?: () => void) {
    const input = h("input", {
      type: "checkbox",
      checked: settings[key],
      onchange() {
        settings[key] = input.checked;
        saveSettings();
        onChange?.();
      },
    });
    return { input, label: h("label", { title }, input, ` ${label}`) };
  }
  // Tempo smooths the move to the next note after a hit, which has no meaning when the lanes don't wait for one.
  const tempoSwitch = optionSwitch("tempoOn", t.tempo);
  tempoSwitch.input.disabled = settings.followOn;
  const metronomeSwitch = optionSwitch("metronomeOn", t.metronome, "", () => (lastBeat = null));
  const countInSelect = h(
    "select",
    {
      ariaLabel: t.countIn,
      disabled: !settings.countInOn,
      onchange() {
        settings.countInBeats = Number(countInSelect.value);
        saveSettings();
        renderNotes();
      },
    },
    ...COUNT_IN_CHOICES.map((beats) => h("option", { value: String(beats), selected: beats === settings.countInBeats, textContent: String(beats) })),
  );
  const countInSwitch = optionSwitch("countInOn", t.countIn, t.countInHint, () => (countInSelect.disabled = !settings.countInOn));

  const modeNote = h("div", { className: "mode-note" });
  function showModes() {
    repeatTopButton.disabled = !isScale(basePiece);
    patternRow.hidden = !isScale(basePiece);
    modeNote.textContent = [
      ...(section ? [t.sectionInfo(section.first + 1, section.last + 1)] : []),
      settings.followOn ? t.keepsMoving : t.waitsForNotes,
      settings.loopOn ? t.loopsUntilStop : t.playsOnce,
      ...(isScale(basePiece) ? [settings.repeatTopOn ? t.topTwice : t.topOnce] : []),
    ].join(" · ");
  }

  const ICON_BUTTON = "secondary outline icon-button";

  function modeButton(key: OptionKey, label: string, icon: string, title: string, apply: () => void, endsRun = true) {
    const button = h("button", {
      className: ICON_BUTTON,
      innerHTML: icon,
      title,
      ariaLabel: label,
      ariaPressed: String(settings[key]),
      async onclick() {
        if (endsRun) await controls.stop();
        settings[key] = !settings[key];
        button.ariaPressed = String(settings[key]);
        saveSettings();
        apply();
      },
    });
    return button;
  }

  const loopButton = modeButton("loopOn", t.loop, LOOP_ICON, t.loop, showModes, false);
  const repeatTopButton = modeButton("repeatTopOn", t.repeatTop, "×2", t.repeatTop, loadPiece);
  const staffBigButton = modeButton("staffBig", t.biggerStaff, STAFF_ICON, t.biggerStaff, fitToScreen, false);
  const followButton = modeButton("followOn", t.dontWait, DONT_WAIT_ICON, `${t.dontWait}: ${t.dontWaitHint}`, () => {
    tempoSwitch.input.disabled = settings.followOn;
    showModes();
    stats.replaceChildren();
    renderNotes();
  });
  const optionsBpmRow = h("div", { className: "row" }, pieceSelect, pieceMenu, controls.recordLabel, bpmControl);
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
    h("div", { className: "row toggles" }, tempoSwitch.label, metronomeSwitch.label, countInSwitch.label, countInSelect),
    optionsBpmRow,
  );

  let fullscreen = false;
  const fullscreenButton = h("button", { className: ICON_BUTTON, onclick: toggleFullscreen });
  const actions = h("div", { className: "row actions" }, controls.startButton, referenceButton, controls.message, loopButton, repeatTopButton, followButton, staffBigButton, fullscreenButton);

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

  const patternRow = h("div", { className: "row patterns" }, t.pattern, h("div", { role: "group", ariaLabel: t.pattern }, ...patternButtons));

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
      h("div", { className: "staff-section" }, staffPanel),
      patternRow,
      countdown,
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
