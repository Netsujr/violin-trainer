import { t } from "../i18n";
import { fillFingering, fingerOn, HIGHEST_MIDI, LOWEST_MIDI, stringFor } from "../music/fingering";
import { centsFrom, midiOf, pitchOf } from "../music/notes";
import type { Session } from "../practice/session";
import { getSettings, saveSettings, type GuesserLevel } from "../storage";
import { h } from "./dom";
import type { createStaff } from "./staff";
import { chipGroup } from "./toggles";

export const GUESS_COUNTS = [1, 2, 4];
export const LEVELS: GuesserLevel[] = ["easy", "medium", "hard"];
// A game is this many notes.
const GAME_NOTES = 10;
// How long a round played right stays up before the next notes appear.
const NEXT_ROUND_MS = 5000;
// A note counts once it's held in tune this long, longer than Practice's hold, so it's really played and not passed through.
const HOLD_MS = 1000;
const BEGINNER_FINGERS = ["0", "1", "2", "3"];

// The notes a level draws from, all in first position: easy is fingers 0 to 3 on the D and A strings, medium the same
// on all four strings, and hard every note.
export function levelNotes(level: GuesserLevel) {
  const midis = Array.from({ length: HIGHEST_MIDI - LOWEST_MIDI + 1 }, (_, index) => LOWEST_MIDI + index);
  return midis
    .filter((midi) => {
      const string = stringFor(midi);
      return level === "hard" || (BEGINNER_FINGERS.includes(fingerOn(string, midi)) && (level === "medium" || string === "D" || string === "A"));
    })
    .map(pitchOf);
}

// Listen's toggles, as labels on the staff: each note's finger, name and letter, each on or off.
export const toggleLabels = () => {
  const { fingers, noteNames, letterNames } = getSettings().toggles;
  return { names: noteNames, letters: letterNames, fingers };
};

// How quickly the notes were found, out of 100: 100 when each counted as soon as its hold allowed, half that when they
// took twice as long. Each is the time from the note being up to it counting.
export const speedScore = (msPerNote: number[]) => Math.min(100, Math.round((100 * HOLD_MS * msPerNote.length) / msPerNote.reduce((sum, ms) => sum + ms, 0)));

// The next notes to play, at random from the level's, never the same note twice running.
export function nextTargets(count: number, pool: string[], last?: string, random = Math.random) {
  const targets: string[] = [];
  while (targets.length < count) {
    const pitch = pool[Math.floor(random() * pool.length)];
    if (pitch !== (targets.at(-1) ?? last)) targets.push(pitch);
  }
  return targets;
}

// Listen's note guesser: notes appear on the staff, and each is played in turn. Listen's toggles name them or not, to
// make it easier or harder. The ghost note shows what's being played against the one to play, and its arrow which way to go.
// The game's score goes on the run's session, for the log. onDone ends the run once the whole game is played.
export function createGuesser(staff: ReturnType<typeof createStaff>, session: () => Session | null, onDone: () => void) {
  const settings = getSettings();
  let targets: string[] = [];
  let index = 0;
  let right = 0;
  let inTuneSince: number | null = null;
  let doneAt: number | null = null;
  // When the note to play came up, and how long each note played right took.
  let upSince = performance.now();
  let msPerNote: number[] = [];
  const score = h("strong", { className: "guess-score" });

  // Each note played right turns green.
  const drawStaff = () => {
    staff.draw(targets.map((pitch) => fillFingering({ pitch })), doneAt === null ? index : -1, toggleLabels());
    staff.element.querySelectorAll(".vf-stavenote").forEach((note, at) => note.classList.toggle("right", at < index));
  };

  function draw() {
    drawStaff();
    score.textContent = right === GAME_NOTES ? t.guessDone(right) : t.guessed(right, GAME_NOTES);
  }

  // The next notes, as many as the game has left.
  function newRound(now = performance.now()) {
    targets = nextTargets(Math.min(settings.guesserCount, GAME_NOTES - right), levelNotes(settings.guesserLevel), targets.at(-1));
    [index, doneAt, inTuneSince, upSince] = [0, null, null, now];
    staff.hidePlayed();
    draw();
  }

  const restart = () => {
    right = 0;
    msPerNote = [];
    newRound();
  };

  // One button for the level, stepping through them.
  const levelButton = h("button", {
    type: "button",
    className: "guess-level",
    onclick() {
      settings.guesserLevel = LEVELS[(LEVELS.indexOf(settings.guesserLevel) + 1) % LEVELS.length];
      saveSettings();
      showLevel();
      newRound();
    },
  });
  const showLevel = () => {
    levelButton.textContent = t.levels[settings.guesserLevel];
    levelButton.title = t.levelHints[settings.guesserLevel];
    levelButton.ariaLabel = `${t.level}: ${t.levels[settings.guesserLevel]}`;
  };
  showLevel();

  const counts = chipGroup(t.notesAtATime, GUESS_COUNTS, String, () => settings.guesserCount, (count) => {
    settings.guesserCount = count;
    saveSettings();
    newRound();
  });

  const panel = h(
    "div",
    { className: "guesser" },
    h("div", { className: "row" }, levelButton, t.notesAtATime, counts, score),
  );

  return {
    panel,
    // A new game.
    start: restart,
    // Draws the notes again, after a toggle changes their labels.
    relabel: drawStaff,
    // Each reading from the mic, or null when it hears nothing.
    read(frequency: number | null, now: number) {
      if (doneAt !== null) {
        const left = NEXT_ROUND_MS - (now - doneAt);
        if (left <= 0) newRound(now);
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
      if (now - inTuneSince < HOLD_MS) return;

      right++;
      msPerNote.push(now - upSince);
      const run = session();
      if (run) run.exerciseScore = speedScore(msPerNote);
      [inTuneSince, upSince] = [null, now];
      index++;
      if (index === targets.length) staff.hidePlayed();
      draw();
      if (right === GAME_NOTES) onDone();
      else if (index === targets.length) doneAt = now;
    },
    quiet() {
      inTuneSince = null;
      staff.hidePlayed();
    },
  };
}
