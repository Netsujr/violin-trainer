import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI } from "../music/fingering";
import { centsFrom, midiOf, pitchOf } from "../music/notes";
import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";
import { createPieceEditor } from "./pieceEditor";
import type { createStaff } from "./staff";

export const GUESS_COUNTS = [1, 2, 4];
// A game of random notes is this many. Written notes are played through once.
const GAME_NOTES = 10;
// How long a round played right stays up before the next notes appear.
const NEXT_ROUND_MS = 5000;

// The next notes to play: the written ones from a place in the list, going round, or else random ones in first
// position, never the same note twice running.
export function nextTargets(count: number, written: string[], from: number, last?: string, random = Math.random) {
  if (written.length) return Array.from({ length: count }, (_, index) => written[(from + index) % written.length]);

  const targets: string[] = [];
  while (targets.length < count) {
    const pitch = pitchOf(LOWEST_MIDI + Math.floor(random() * (HIGHEST_MIDI - LOWEST_MIDI + 1)));
    if (pitch !== (targets.at(-1) ?? last)) targets.push(pitch);
  }
  return targets;
}

// Listen's note guesser: notes appear on the staff, unnamed, and each is played in turn. The ghost note shows what's
// being played against the one to play, and its arrow which way to go.
// onDone ends the run once the whole game is played.
export function createGuesser(staff: ReturnType<typeof createStaff>, onDone: () => void) {
  const settings = getSettings();
  let targets: string[] = [];
  let index = 0;
  let right = 0;
  let inTuneSince: number | null = null;
  let doneAt: number | null = null;
  const score = h("strong", { className: "guess-score" });
  const written = () => (settings.guesserWrittenOn ? settings.guesserNotes.map((note) => note.pitch) : []);

  const total = () => written().length || GAME_NOTES;

  function draw() {
    staff.draw(targets.map((pitch) => ({ pitch })), doneAt === null ? index : -1, { names: false, fingers: false });
    score.textContent = right === total() ? t.guessDone(right) : t.guessed(right, total());
  }

  // The next notes, as many as the game has left. right counts the notes played so far, so it's the place in a written list.
  function newRound() {
    const count = Math.min(settings.guesserCount, total() - right);
    targets = nextTargets(count, written(), right, targets.at(-1));
    [index, doneAt, inTuneSince] = [0, null, null];
    staff.hidePlayed();
    draw();
  }

  const restart = () => {
    right = 0;
    newRound();
  };

  const countButtons = GUESS_COUNTS.map((count) =>
    h("button", {
      type: "button",
      textContent: String(count),
      ariaPressed: String(count === settings.guesserCount),
      onclick() {
        settings.guesserCount = count;
        saveSettings();
        countButtons.forEach((button, at) => (button.ariaPressed = String(GUESS_COUNTS[at] === count)));
        newRound();
      },
    }),
  );

  const editor = createPieceEditor(settings.guesserNotes, () => {
    settings.guesserNotes = editor.notes();
    saveSettings();
    if (settings.guesserWrittenOn) restart();
  });
  const useWritten = h("input", {
    type: "checkbox",
    checked: settings.guesserWrittenOn,
    onchange() {
      settings.guesserWrittenOn = useWritten.checked;
      saveSettings();
      restart();
    },
  });

  const panel = h(
    "div",
    { className: "guesser" },
    h("div", { className: "row" }, t.notesAtATime, h("div", { role: "group", ariaLabel: t.notesAtATime }, ...countButtons), score),
    h("p", { className: "guess-hint" }, t.guessHint),
    h("details", { className: "guess-writer" }, h("summary", {}, t.writeGuesser), h("label", {}, useWritten, ` ${t.useMyNotes}`), editor.element),
  );

  return {
    panel,
    // A new game.
    start: restart,
    // Each reading from the mic, or null when it hears nothing.
    read(frequency: number | null, now: number) {
      if (doneAt !== null) {
        const left = NEXT_ROUND_MS - (now - doneAt);
        if (left <= 0) newRound();
        else score.textContent = t.nextIn(Math.ceil(left / 1000));
        return;
      }
      if (frequency === null || targets.length === 0) return;

      const cents = centsFrom(frequency, midiOf(targets[index]));
      const inTune = Math.abs(cents) <= settings.toleranceCents;
      staff.showPlayed(index, cents, inTune);
      if (!inTune) {
        inTuneSince = null;
        return;
      }
      inTuneSince ??= now;
      if (now - inTuneSince < settings.holdMs) return;

      // ponytail: a written note repeated straight after itself counts on the same bow; needs a volume dip to split.
      right++;
      inTuneSince = null;
      index++;
      if (index === targets.length) staff.hidePlayed();
      draw();
      if (right === total()) onDone();
      else if (index === targets.length) doneAt = now;
    },
    quiet() {
      inTuneSince = null;
      staff.hidePlayed();
    },
  };
}
