import { sharedMetronome as metronome } from "../audio/metronome";
import { sharedAudioContext } from "../audio/reference";
import { t } from "../i18n";
import { fillFingering, stringFor } from "../music/fingering";
import { centsFrom, countNotes, midiOf, type PieceNote, type StringName } from "../music/notes";
import type { Session } from "../practice/session";
import { holdAfter, noteStarts, roundScore, scoreLongBow, scoreSlurs, type Hold, type TechniqueReading } from "../practice/technique";
import { getSettings, passCents, saveSettings } from "../storage";
import { h } from "./dom";
import { levelNotes, toggleLabels } from "./guesser";
import { beatMs } from "./practice/timing";
import { dockOption } from "./panels";
import type { createStaff } from "./staff";
import { chipGroup } from "./toggles";

const NOTES_PER_BOW = [1, 2, 3, 4];
const BOW_STRINGS: StringName[] = ["G", "D", "A", "E"];
const BEATS_PER_NOTE = [1, 2, 4, 8];
// The fingers played with each number of notes to a bow: up the string and, where the bows need it, back down, so
// every bow is full and a round ends on an up bow.
const BOW_FINGERS: Record<number, number[]> = { 1: [0, 1, 2, 3], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3, 2, 1], 4: [0, 1, 2, 3, 3, 2, 1, 0] };

type ExerciseNote = PieceNote & { bow: "down" | "up" };

// The open string, then fingers 1, 2 and 3 on it: the beginner's pattern.
const stringNotes = (string: StringName) => levelNotes("medium").filter((pitch) => stringFor(midiOf(pitch)) === string);
const chip = (text: string) => h("span", { className: "info-chip" }, text);

// Listen's technique exercises, on one string: a long bow, with one note to a bow, or slurs, with more. Nothing moves
// on its own: each note is held in tune for the beats picked, at Practice's BPM, and then the next one comes, while the
// pitch line shows what's played. The round starts at the first note heard in tune. A long bow ends with how steady
// the pitch and the loudness were, slurs with the bows played without a break, and both with how long the round took
// against its beats. The round's score goes on the run's session, for the log. onDone ends the run once a round is played.
export function createTechnique(staff: ReturnType<typeof createStaff>, session: () => Session | null, onDone: () => void) {
  const settings = getSettings();
  const status = h("p", { className: "technique-status" });
  const results = h("div", { className: "chip-row" });
  let notes: ExerciseNote[] = [];
  let starts: number[] = [];
  let current = -1;
  // A round under way: when its first note was first heard in tune, how long the note being played has been held, and
  // what was heard.
  let round: { startedAt: number | null; hold: Hold | null; readings: TechniqueReading[] } | null = null;

  // The staff has no note longer than a whole one, and with more than four notes none longer than a half, so a round
  // always fits one line of Listen's staff.
  const longestDrawn = () => (countNotes(notes) > 4 ? 2 : 4);

  // Each bow is marked at its first note, with a slur over its notes.
  const drawn = () =>
    notes.map((note, index) => ({
      ...note,
      beats: Math.min(note.beats!, longestDrawn()),
      bow: index % settings.bowNotes ? undefined : note.bow,
      slur: index % settings.bowNotes < settings.bowNotes - 1,
    }));
  const drawStaff = () => staff.draw(drawn(), current, toggleLabels());

  // Where a beat of the round falls on the staff, where a note longer than a whole one is drawn as a whole one.
  function drawnBeat(beat: number) {
    const index = Math.max(0, starts.findLastIndex((start) => start <= beat));
    const drawnStart = notes.slice(0, index).reduce((sum, note) => sum + Math.min(note.beats!, longestDrawn()), 0);
    const note = notes[Math.min(index, notes.length - 1)];
    return drawnStart + ((beat - starts[index]) * Math.min(note.beats!, longestDrawn())) / note.beats!;
  }

  // What the round is on: which note of how many, and which way the bow goes.
  function showNote() {
    drawStaff();
    status.textContent = `${t.noteOf(current + 1, notes.length)} · ${notes[current].bow === "down" ? t.downBow : t.upBow}`;
  }

  // A new round of the exercise as the choices set it. It begins once the run is going.
  function start() {
    const pitches = stringNotes(settings.bowString);
    notes = BOW_FINGERS[settings.bowNotes].map((finger, index) => ({
      ...fillFingering({ pitch: pitches[finger], beats: settings.bowBeats }),
      bow: Math.floor(index / settings.bowNotes) % 2 ? "up" : "down",
    }));
    starts = noteStarts(notes);
    current = -1;
    round = { startedAt: null, hold: null, readings: [] };
    staff.clearTrace();
    staff.hidePlayed();
    status.textContent = "";
    results.replaceChildren();
    drawStaff();
  }

  function stop() {
    round = null;
    current = -1;
    staff.hidePlayed();
    status.textContent = "";
    drawStaff();
  }

  function finish(readings: TechniqueReading[], seconds: number) {
    stop();
    const { words, score } = outcome(readings, seconds);
    results.replaceChildren(...words.map(chip));
    const run = session();
    if (run && score !== null) run.exerciseScore = score;
    onDone();
  }

  // How the round went, in a few words each, and as a score out of 100: the average of its shares, of the bows smooth
  // for slurs, or how steady a long bow was, and of how close the round came to taking just its beats.
  function outcome(readings: TechniqueReading[], seconds: number) {
    const options = { beatMs: beatMs(), minRms: settings.minRms };
    const beatSeconds = Math.round((starts.at(-1)! * options.beatMs) / 1000);
    const time = { words: [t.timeTaken(Math.round(seconds), beatSeconds)], share: Math.min(1, beatSeconds / seconds) };
    if (settings.bowNotes > 1) {
      const { smooth, bows } = scoreSlurs(notes, settings.bowNotes, readings, options);
      return { words: [t.smoothSlurs(smooth, bows), ...time.words], score: roundScore([smooth / bows, time.share]) };
    }
    const { pitchSpread, steadiness } = scoreLongBow(notes, readings, options);
    return {
      words: [...(pitchSpread === null ? [] : [t.pitchSpread(pitchSpread)]), ...(steadiness === null ? [] : [t.volumeSteady(steadiness)]), ...time.words],
      score: roundScore([...(steadiness === null ? [] : [steadiness / 100]), time.share]),
    };
  }

  // Each choice is kept, and starts the exercise again.
  const changed = () => {
    saveSettings();
    start();
  };
  const perBow = chipGroup(t.notesPerBow, NOTES_PER_BOW, String, () => settings.bowNotes, (count) => {
    settings.bowNotes = count;
    changed();
  });
  const strings = chipGroup(t.bowString, BOW_STRINGS, (string) => t.strings[string], () => settings.bowString, (string) => {
    settings.bowString = string;
    changed();
  });
  const beats = chipGroup(t.beatsPerNote, BEATS_PER_NOTE, String, () => settings.bowBeats, (count) => {
    settings.bowBeats = count;
    changed();
  });

  return {
    // The exercise's settings, for the settings panel; what the round is doing, then how it went, for the stage.
    options: [dockOption(t.notesPerBow, perBow), dockOption(t.bowString, strings), dockOption(t.beatsPerNote, beats)],
    status,
    results,
    // The note to play now, or before the round, the first one, for the fingerboard.
    get note() {
      return notes[Math.max(0, current)] ?? null;
    },
    start,
    stop,
    // Draws the notes again, after a toggle changes their labels.
    relabel: drawStaff,
    // Each reading from the mic: the pitch heard, if any, and how loud it was. The note being played moves on once it's
    // been held in tune for its beats.
    read(frequency: number | null, now: number, rms: number) {
      if (!round) return;
      if (settings.metronomeOn && sharedAudioContext().state === "running") metronome.tick(now, settings.bpm);
      if (current < 0) {
        current = 0;
        showNote();
      }
      const note = notes[current];
      const cents = frequency === null ? null : centsFrom(frequency, midiOf(note.pitch!));
      const inTune = cents !== null && Math.abs(cents) <= passCents();
      if (round.startedAt === null) {
        if (!inTune) return;
        round.startedAt = now;
      }
      round.hold = holdAfter(round.hold ?? { ms: 0, outSince: null, at: now }, inTune, now);
      const noteMs = note.beats! * beatMs();
      const beat = starts[current] + (note.beats! * Math.min(round.hold.ms, noteMs)) / noteMs;
      round.readings.push({ beat, frequency, rms });
      staff.tracePlayed(drawnBeat(beat), frequency, cents, inTune);
      if (round.hold.ms < noteMs) return;
      if (current === notes.length - 1) return finish(round.readings, (now - round.startedAt) / 1000);
      current++;
      round.hold = null;
      showNote();
    },
  };
}
