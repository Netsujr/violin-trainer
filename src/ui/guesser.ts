import { playNotes } from "../audio/reference";
import { localNumber, t } from "../i18n";
import { fillFingering, fingerOn, HIGHEST_MIDI, LOWEST_MIDI, stringFor } from "../music/fingering";
import { centsFrom, midiOf, pitchOf } from "../music/notes";
import type { Session } from "../practice/session";
import { getSettings, passCents, saveSettings, type GuessBy, type GuesserLevel } from "../storage";
import { h } from "./dom";
import type { createFingerboard } from "./fingerboard";
import { openGuessResults } from "./guessResults";
import { dockOption } from "./panels";
import type { createStaff } from "./staff";
import { chipGroup } from "./toggles";

const GUESS_COUNTS = [1, 2, 4];
const LEVELS: GuesserLevel[] = ["easy", "medium", "hard"];
const GUESS_BY: GuessBy[] = ["eye", "ear"];
// By ear, each note sounds this long, and the mic waits this long after, so it doesn't hear the speakers' last of it.
const EAR_NOTE_MS = 2000;
const ECHO_MS = 150;
// By ear, the note sounds again once the player's been quiet this long without finding it, until it's found. It can't
// sound all the time, or the mic would hear the speakers and count it as played.
const EAR_AGAIN_MS = 2500;
// A game is this many notes.
const GAME_NOTES = 10;
// A round played right moves on this long after the playing stops.
const NEXT_AFTER_MS = 3000;
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
// make it easier or harder. The ghost note shows what's being played against the one to play, and its arrow which way
// to go; the fingerboard, beside it or on its own, shows where on the violin it's played.
// A round played right waits for the playing to stop, then the next notes come. A game played right ends the run, with
// onDone, and shows how it went, with Play again, which runs playAgain; nothing starts on its own.
// The run's score goes on its session, for the log. board is Listen's fingerboard, which shows the note to play.
// By ear, the notes aren't shown but heard, each sounding on the violin as it comes up once a run's going, again each
// time the player's been quiet a while without finding it, and when the staff's tapped; a note shows, green, once it's
// played right. The toggles' labels still show, as hints.
export function createGuesser(
  staff: ReturnType<typeof createStaff>,
  session: () => Session | null,
  board: ReturnType<typeof createFingerboard>,
  onDone: () => void,
  playAgain: () => void,
) {
  const settings = getSettings();
  let targets: string[] = [];
  let index = 0;
  let right = 0;
  let inTuneSince: number | null = null;
  let doneAt: number | null = null;
  let soundAt = 0;
  // When the note to play came up, and how long each note played right took, this run.
  let upSince = performance.now();
  let msPerNote: number[] = [];
  const score = h("span", { className: "guess-score" });
  // Over the staff, so it shows in fullscreen too: the round is right, and when the next one comes.
  const banner = h("p", { className: "guess-banner", hidden: true });
  const byEar = () => settings.guesserBy === "ear";
  // By ear: the note sounded last, by how many the game has had right, how to stop it, and when the mic listens again.
  let sounded = -1;
  let stopSound: (() => void) | null = null;
  let listensAt = 0;

  function sound() {
    stopSound?.();
    listensAt = Infinity;
    stopSound = playNotes([{ pitch: targets[index], beats: 1 }], EAR_NOTE_MS, () => {
      stopSound = null;
      listensAt = performance.now() + ECHO_MS;
      // Finding it is timed from when it's been heard.
      upSince = performance.now();
    });
  }

  // Each note played right turns green, and the fingerboard shows the one being played, or the last, once right.
  const drawStaff = () => {
    staff.draw(targets.map((pitch) => fillFingering({ pitch })), doneAt === null ? index : -1, toggleLabels());
    staff.element.querySelectorAll(".vf-stavenote").forEach((note, at) => note.classList.toggle("right", at < index));
    // By ear, the fingerboard would give the note away, so it shows only once the round's right.
    const hidden = byEar() && index < targets.length;
    board.show(targets.length && !hidden ? fillFingering({ pitch: targets[Math.min(index, targets.length - 1)] }) : null, index >= targets.length);
  };

  function draw() {
    drawStaff();
    score.textContent = t.guessed(right, GAME_NOTES);
  }

  // The next notes, as many as the game has left, or a new game once it's all played.
  function newRound(now = performance.now()) {
    if (right === GAME_NOTES) right = 0;
    targets = nextTargets(Math.min(settings.guesserCount, GAME_NOTES - right), levelNotes(settings.guesserLevel), targets.at(-1));
    [index, doneAt, inTuneSince, upSince, sounded] = [0, null, null, now, -1];
    banner.hidden = true;
    staff.hidePlayed();
    draw();
  }

  // The game's end, in a dialog: its score, how long the notes took in all and each, and the level and way it was played.
  function showResults() {
    const seconds = msPerNote.reduce((sum, ms) => sum + ms, 0) / 1000;
    const words = [
      t.score(speedScore(msPerNote)),
      t.guessTime(localNumber(seconds, 1), localNumber(seconds / GAME_NOTES, 1)),
      t.levels[settings.guesserLevel],
      `${t.guessByLabel} ${t.guessBy[settings.guesserBy].toLowerCase()}`,
    ];
    openGuessResults(t.guessDone(GAME_NOTES), words, playAgain);
  }

  const restart = () => {
    right = 0;
    msPerNote = [];
    newRound();
  };

  // The level, with which notes it draws from under it.
  const levelHint = h("p", { className: "dock-caption" });
  const showLevel = () => (levelHint.textContent = t.levelHints[settings.guesserLevel]);
  const levels = chipGroup(t.level, LEVELS, (level) => t.levels[level], () => settings.guesserLevel, (level) => {
    settings.guesserLevel = level;
    saveSettings();
    showLevel();
    newRound();
  });
  showLevel();

  const counts = chipGroup(t.notesAtATime, GUESS_COUNTS, String, () => settings.guesserCount, (count) => {
    settings.guesserCount = count;
    saveSettings();
    newRound();
  });

  // By eye or by ear, the one picked pressed. Changing starts a new game.
  const guessBy = chipGroup(t.guessByLabel, GUESS_BY, (by) => t.guessBy[by], () => settings.guesserBy, (by) => {
    settings.guesserBy = by;
    saveSettings();
    showBy();
    stopSound?.();
    restart();
  });
  // By ear, the CSS hides the notes until they're played right, and a tap on the staff sounds the note again.
  const showBy = () => staff.element.classList.toggle("by-ear", byEar());

  return {
    // The guesser's settings, for the settings panel, and its score, for the title row.
    options: [dockOption(t.guessByLabel, guessBy), dockOption(t.level, levels, levelHint), dockOption(t.notesAtATime, counts)],
    score,
    banner,
    // A new game.
    start() {
      showBy();
      restart();
    },
    // By ear: whether the mic counts now, not while the note sounds or just after; the note again, for a tap on the
    // staff; and its sound stopped, as when the run stops or the mode changes.
    hearing: (now: number) => now >= listensAt,
    replay: () => byEar() && targets.length > 0 && doneAt === null && sound(),
    hush: () => stopSound?.(),
    // Draws the notes again, after a toggle changes their labels.
    relabel: drawStaff,
    // Each reading from the mic, or null when it hears nothing.
    read(frequency: number | null, now: number) {
      // A game played to the end waits for Play again.
      if (right === GAME_NOTES) return;
      if (frequency !== null) soundAt = now;
      const quiet = stopSound === null && now - Math.max(soundAt, listensAt) >= EAR_AGAIN_MS;
      if (byEar() && doneAt === null && targets.length && (sounded !== right || quiet)) {
        sounded = right;
        sound();
      }
      if (doneAt !== null) {
        const left = NEXT_AFTER_MS - (now - Math.max(doneAt, soundAt));
        if (left <= 0) return newRound(now);
        const seconds = Math.ceil(left / 1000);
        banner.textContent = t.nextIn(seconds);
        banner.hidden = false;
        return;
      }
      board.hear(frequency, passCents());
      if (frequency === null || targets.length === 0) return;

      const cents = centsFrom(frequency, midiOf(targets[index]));
      const inTune = Math.abs(cents) <= passCents();
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
      if (index === targets.length) {
        staff.hidePlayed();
        doneAt = now;
      }
      draw();
      if (right === GAME_NOTES) {
        onDone();
        showResults();
      }
    },
    // Silence, or the run stopped. While a round waits, the next reading puts the banner back.
    quiet() {
      inTuneSince = null;
      banner.hidden = true;
      staff.hidePlayed();
      board.hear(null, passCents());
    },
  };
}
