import { t } from "../i18n";
import { fillFingering, fingerOn, HIGHEST_MIDI, LOWEST_MIDI, stringFor } from "../music/fingering";
import { centsFrom, midiOf, pitchOf } from "../music/notes";
import type { Session } from "../practice/session";
import { getSettings, passCents, saveSettings, type GuesserLevel, type GuesserView } from "../storage";
import { h } from "./dom";
import { createFingerboard } from "./fingerboard";
import type { createStaff } from "./staff";
import { chipGroup, FINGERBOARD_ICON, STAFF_AND_BOARD_ICON, STAFF_ICON } from "./toggles";

export const GUESS_COUNTS = [1, 2, 4];
export const LEVELS: GuesserLevel[] = ["easy", "medium", "hard"];
const VIEWS: GuesserView[] = ["staff", "both", "board"];
const VIEW_ICONS = { staff: STAFF_ICON, both: STAFF_AND_BOARD_ICON, board: FINGERBOARD_ICON };
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
// A round played right waits for the playing to stop, then the next notes come; a game played right starts another.
// The run's score goes on its session, for the log. onView says the view has changed, for Listen to lay out.
export function createGuesser(staff: ReturnType<typeof createStaff>, session: () => Session | null, onView: () => void) {
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
  const score = h("strong", { className: "guess-score" });
  // Over the staff, so it shows in fullscreen too: the round is right, and when the next one comes.
  const banner = h("p", { className: "guess-banner", hidden: true });
  const board = createFingerboard();

  // Each note played right turns green, and the fingerboard shows the one being played, or the last, once right.
  const drawStaff = () => {
    staff.draw(targets.map((pitch) => fillFingering({ pitch })), doneAt === null ? index : -1, toggleLabels());
    staff.element.querySelectorAll(".vf-stavenote").forEach((note, at) => note.classList.toggle("right", at < index));
    board.show(targets.length ? fillFingering({ pitch: targets[Math.min(index, targets.length - 1)] }) : null, index >= targets.length);
  };

  function draw() {
    drawStaff();
    score.textContent = t.guessed(right, GAME_NOTES);
  }

  // The next notes, as many as the game has left, or a new game once it's all played.
  function newRound(now = performance.now()) {
    if (right === GAME_NOTES) right = 0;
    targets = nextTargets(Math.min(settings.guesserCount, GAME_NOTES - right), levelNotes(settings.guesserLevel), targets.at(-1));
    [index, doneAt, inTuneSince, upSince] = [0, null, null, now];
    banner.hidden = true;
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

  // One button for what the stage shows, stepping through the staff, the staff and fingerboard, and the fingerboard.
  const viewButton = h("button", {
    type: "button",
    className: "box-toggle",
    onclick() {
      settings.guesserView = VIEWS[(VIEWS.indexOf(settings.guesserView) + 1) % VIEWS.length];
      saveSettings();
      showView();
      onView();
    },
  });
  const showView = () => {
    viewButton.replaceChildren(h("span", { className: "icon", innerHTML: VIEW_ICONS[settings.guesserView] }));
    viewButton.title = viewButton.ariaLabel = t.guesserViews[settings.guesserView];
  };
  showView();

  const panel = h(
    "div",
    { className: "guesser" },
    h("div", { className: "row" }, levelButton, t.notesAtATime, counts, score, viewButton),
  );

  return {
    panel,
    banner,
    board: board.element,
    // A new game.
    start: restart,
    // Draws the notes again, after a toggle changes their labels.
    relabel: drawStaff,
    // Each reading from the mic, or null when it hears nothing.
    read(frequency: number | null, now: number) {
      if (frequency !== null) soundAt = now;
      if (doneAt !== null) {
        const left = NEXT_AFTER_MS - (now - Math.max(doneAt, soundAt));
        if (left <= 0) return newRound(now);
        const seconds = Math.ceil(left / 1000);
        banner.textContent = right === GAME_NOTES ? t.guessDone(GAME_NOTES, seconds) : t.nextIn(seconds);
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
