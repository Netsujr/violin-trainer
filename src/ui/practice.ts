import { createMetronome } from "../audio/metronome";
import { playReference, REFERENCE_MS } from "../audio/reference";
import { localNumber, localTitle, t } from "../i18n";
import { midiOf, noteLabels } from "../music/notes";
import { PATTERNS, withPattern } from "../music/patterns";
import { createJudge } from "../practice/judge";
import { buildEntry } from "../practice/log";
import type { Session } from "../practice/session";
import { allPieces, getSettings, saveSettings } from "../storage";
import { h, type Screen } from "./dom";
import { createHighway } from "./highway";
import { createNeedle } from "./listen";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createToggles } from "./toggles";

const REFERENCE_ECHO_MS = 150;
// A hit closer to the beat than this waits for the following beat, so the glide never looks rushed.
const MIN_GLIDE_BEATS = 0.25;
// With tempo on, a pattern note clears after this share of its length, leaving the rest for the glide to the next beat.
const TEMPO_HOLD_SHARE = 0.5;
// The page content is 960 wide, less the staff's side padding.
const STAFF_WIDTH = 944;

export function practiceScreen(pieceId?: string): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let basePiece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
  let piece = withPattern(basePiece, settings.pattern);
  let mutedUntil = 0;
  let holdProgress = 0;
  let startIndex = 0;
  let lastBeat: number | null = null;
  let pendingHit: { cents: number; at: number; arrivesAt: number } | null = null;

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
  const staff = createStaff(STAFF_WIDTH, !settings.staffOpen);
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
  const staffPanel = h("div", { className: "staff-panel" }, staff.element, staffToggle);
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
    return settings.tempoOn && index < piece.notes.length - 1 ? noteMs * TEMPO_HOLD_SHARE : noteMs;
  }

  function loadPiece() {
    piece = withPattern(basePiece, settings.pattern);
    stats.replaceChildren();
    startIndex = 0;
    highway.jumpTo(0);
    renderNotes();
  }

  function renderNotes() {
    const index = currentIndex();
    const note = piece.notes[index];
    staffPanel.hidden = !settings.toggles.staff;
    staff.draw(piece.notes, index);
    progress.textContent = note
      ? `${t.noteOf(index + 1, piece.notes.length)}${note.bar ? t.bar(note.bar) : ""}`
      : t.allDone(piece.notes.length);
    highway.draw(piece.notes, index, holdProgress);
  }

  function runSummary(passes: number, seconds: string) {
    if (piece.pattern) return t.patternDone(piece.pattern + 1, seconds);
    return startIndex === 0 ? t.passDone(passes, seconds) : t.partialDone(startIndex + 1, seconds);
  }

  function showStats(session: Session) {
    const entry = buildEntry(session, performance.now());
    const slowest = entry.slowest
      .map((note) => `${noteLabels(note.pitch).solfege} (${localNumber(note.seconds, 1)} s)`)
      .join(", ");
    const seconds = localNumber(session.lastRunSeconds, 0);
    const cents = Math.round(entry.averageCents ?? 0);
    stats.replaceChildren(
      h("p", {}, runSummary(entry.passes, seconds)),
      h("p", {}, t.summary(t.hitSkipped(entry.notesHit, entry.notesSkipped), cents)),
      h("p", {}, t.slowest(slowest || t.slowestNone)),
      h("button", { textContent: t.playAgain, onclick: () => startFrom(startIndex) }),
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
    }
    holdProgress = 0;
    stats.replaceChildren();
    renderNotes();
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
    if (session.finished) showStats(session);
    // Fast bow changes are too short to detect, so inside a pattern the beat and hold time separate repeated notes.
    else judge.setTarget(session.currentMidi, piece.pattern ? undefined : previousMidi);
    renderNotes();
  }

  function onReading(frequency: number | null, now: number) {
    const session = controls.session!;
    if (settings.metronomeOn) metronome.tick(now, settings.bpm);
    if (!session.finished) {
      if (pendingHit && now >= pendingHit.arrivesAt) arriveOnBeat(session);
      const verdict = judge.update(now < mutedUntil ? null : frequency, now);
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
      skipButton.disabled = false;
      highway.jumpTo(startIndex);
      startFrom(startIndex);
    },
    onStop() {
      cancelGlide();
      skipButton.disabled = true;
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
    onclick() {
      const note = piece.notes[currentIndex()];
      if (!note) return;

      playReference(midiOf(note.pitch));
      mutedUntil = performance.now() + REFERENCE_MS + REFERENCE_ECHO_MS;
    },
  });

  const skipButton = h("button", {
    textContent: t.skip,
    className: "secondary outline",
    disabled: true,
    onclick() {
      const session = controls.session!;
      if (session.finished) return;

      cancelGlide();
      const previousMidi = session.currentMidi;
      session.skip(performance.now());
      moveOn(session, previousMidi);
    },
  });

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
  const tempoSwitch = h(
    "label",
    {},
    h("input", {
      type: "checkbox",
      checked: settings.tempoOn,
      onchange(event) {
        settings.tempoOn = (event.target as HTMLInputElement).checked;
        saveSettings();
      },
    }),
    ` ${t.tempo}`,
  );
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
  const toggles = createToggles(renderNotes, ["grid"]);
  toggles.append(tempoSwitch, metronomeSwitch);
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
    toggles,
    h("div", { className: "row" }, pieceSelect, controls.recordLabel, bpmControl),
  );

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

  renderNotes();

  return {
    element: h(
      "section",
      { className: "practice" },
      optionsPanel,
      progress,
      h("div", { className: "row actions" }, controls.startButton, referenceButton, skipButton, controls.message),
      h("div", { className: "row tuning" }, needle.element, hertz),
      highway.element,
      stats,
      staffPanel,
      h("div", { className: "row patterns" }, t.pattern, h("div", { role: "group", ariaLabel: t.pattern }, ...patternButtons)),
    ),
    leave: controls.leave,
  };
}
