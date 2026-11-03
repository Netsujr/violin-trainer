import { playReference, REFERENCE_MS } from "../audio/reference";
import { midiOf, noteLabels } from "../music/notes";
import { createJudge } from "../practice/judge";
import { buildEntry } from "../practice/log";
import type { Session } from "../practice/session";
import { allPieces, getSettings } from "../storage";
import { h, type Screen } from "./dom";
import { createHighway } from "./highway";
import { createNeedle } from "./listen";
import { createRunControls } from "./runControls";
import { createStaff } from "./staff";
import { createToggles } from "./toggles";

const REFERENCE_ECHO_MS = 150;
// The page content is 960 wide, less the staff's side padding.
const STAFF_WIDTH = 944;

export function practiceScreen(pieceId?: string): Screen {
  const settings = getSettings();
  const pieces = allPieces();
  let piece = pieces.find((candidate) => candidate.id === pieceId) ?? pieces[0];
  let mutedUntil = 0;
  let holdProgress = 0;
  let startIndex = 0;

  const judge = createJudge(settings);
  const needle = createNeedle();
  const staff = createStaff(STAFF_WIDTH);
  const highway = createHighway(startFrom);
  const hertz = h("span");
  const progress = h("p");
  const stats = h("div", { className: "stats" });

  const currentIndex = () => controls.session?.index ?? startIndex;

  function renderNotes() {
    const index = currentIndex();
    const note = piece.notes[index];
    staff.element.hidden = !settings.toggles.staff;
    staff.draw(piece.notes.map(({ pitch }) => pitch), index);
    progress.textContent = note
      ? `Note ${index + 1} of ${piece.notes.length}${note.bar ? ` · bar ${note.bar}` : ""}`
      : `All ${piece.notes.length} notes done`;
    highway.draw(piece.notes, index, holdProgress);
  }

  function showStats(session: Session) {
    const entry = buildEntry(session, performance.now());
    const slowest = entry.slowest
      .map((note) => `${noteLabels(note.pitch).solfege} (${note.seconds.toFixed(1)} s)`)
      .join(", ");
    stats.replaceChildren(
      h("p", {}, `${startIndex === 0 ? `Pass ${entry.passes}` : `Note ${startIndex + 1} to the end`} done in ${session.lastRunSeconds.toFixed(0)} s.`),
      h("p", {}, `This session: ${entry.notesHit} hit, ${entry.notesSkipped} skipped, ${(entry.averageCents ?? 0).toFixed(0)} cents off on average.`),
      h("p", {}, `Slowest: ${slowest || "none"}`),
      h("button", { textContent: "Play again", onclick: () => startFrom(startIndex) }),
    );
  }

  function startFrom(index: number) {
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

  function moveOn(session: Session, previousMidi: number) {
    holdProgress = 0;
    if (session.finished) showStats(session);
    else judge.setTarget(session.currentMidi, previousMidi);
    renderNotes();
  }

  function onReading(frequency: number | null, now: number) {
    const session = controls.session!;
    if (!session.finished) {
      const verdict = judge.update(now < mutedUntil ? null : frequency, now);
      holdProgress = verdict.progress;
      needle.show(verdict.cents);
      hertz.textContent = frequency === null ? "" : `${frequency.toFixed(1)} Hz`;
      if (verdict.hit) {
        const previousMidi = session.currentMidi;
        session.hit(verdict.averageCents, now);
        moveOn(session, previousMidi);
      }
    }
    highway.draw(piece.notes, session.index, holdProgress);
  }

  const controls = createRunControls({
    piece: () => piece,
    onReading,
    onStart() {
      skipButton.disabled = false;
      highway.jumpTo(startIndex);
      startFrom(startIndex);
    },
    onStop() {
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
        piece = pieces.find((candidate) => candidate.id === pieceSelect.value)!;
        stats.replaceChildren();
        startIndex = 0;
        highway.jumpTo(0);
        renderNotes();
      },
    },
    ...pieces.map((candidate) =>
      h("option", { value: candidate.id, selected: candidate === piece, textContent: candidate.title }),
    ),
  );

  const referenceButton = h("button", {
    textContent: "Play reference",
    className: "secondary outline",
    onclick() {
      const note = piece.notes[currentIndex()];
      if (!note) return;

      playReference(midiOf(note.pitch));
      mutedUntil = performance.now() + REFERENCE_MS + REFERENCE_ECHO_MS;
    },
  });

  const skipButton = h("button", {
    textContent: "Skip",
    className: "secondary outline",
    disabled: true,
    onclick() {
      const session = controls.session!;
      if (session.finished) return;

      const previousMidi = session.currentMidi;
      session.skip(performance.now());
      moveOn(session, previousMidi);
    },
  });

  renderNotes();

  return {
    element: h(
      "section",
      { className: "practice" },
      createToggles(renderNotes),
      h("div", { className: "row" }, pieceSelect, controls.element, referenceButton, skipButton),
      progress,
      h("div", { className: "row tuning" }, needle.element, hertz),
      highway.element,
      stats,
      staff.element,
    ),
    leave: controls.leave,
  };
}
