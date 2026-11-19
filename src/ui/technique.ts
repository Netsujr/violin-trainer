import { sharedMetronome as metronome } from "../audio/metronome";
import { sharedAudioContext } from "../audio/reference";
import { t } from "../i18n";
import { fillFingering, stringFor } from "../music/fingering";
import { centsFrom, countNotes, midiOf, type PieceNote, type StringName } from "../music/notes";
import type { Session } from "../practice/session";
import { noteChanges, noteStarts, ON_TIME_MS, roundScore, scoreLongBow, scoreSlurs, type NoteChange, type TechniqueReading } from "../practice/technique";
import { getSettings, passCents, saveSettings } from "../storage";
import { h } from "./dom";
import { levelNotes, toggleLabels } from "./guesser";
import { createCountIn } from "./practice/countIn";
import { beatMs, MIC_DELAY_MS } from "./practice/timing";
import type { createStaff } from "./staff";
import { boxToggle, chipGroup, PAUSE_ICON } from "./toggles";

const NOTES_PER_BOW = [1, 2, 3, 4];
const BOW_STRINGS: StringName[] = ["G", "D", "A", "E"];
const BEATS_PER_NOTE = [1, 2, 4, 8];
// The fingers played with each number of notes to a bow: up the string and, where the bows need it, back down, so
// every bow is full and a round ends on an up bow.
const BOW_FINGERS: Record<number, number[]> = { 1: [0, 1, 2, 3], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3, 2, 1], 4: [0, 1, 2, 3, 3, 2, 1, 0] };
// With a pause before each note: up the string and back, a beat a note, so fingers both go down and lift.
const PAUSED_FINGERS = BOW_FINGERS[3];

// A rest has neither pitch nor bow.
type ExerciseNote = PieceNote & { bow?: "down" | "up" };

// The open string, then fingers 1, 2 and 3 on it: the beginner's pattern.
const stringNotes = (string: StringName) => levelNotes("medium").filter((pitch) => stringFor(midiOf(pitch)) === string);
const chip = (text: string) => h("span", { className: "info-chip" }, text);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

// The note changes in a few words: how many were clean, and how late or early the fingers were on average, going down
// and lifting, each when there were some. Clean changes are also a share of the round's score.
function changeWords(changes: NoteChange[]) {
  const timed = changes.flatMap(({ ms, lift }) => (ms === null ? [] : [{ ms, lift }]));
  if (!timed.length) return { words: changes.length ? [t.changesNotHeard] : [], shares: [] };
  const clean = timed.filter(({ ms }) => Math.abs(ms) <= ON_TIME_MS).length;
  const kinds = [false, true].flatMap((lift) => {
    const ms = timed.filter((change) => change.lift === lift).map((change) => change.ms);
    const average = Math.round(mean(ms) / 10) * 10;
    return ms.length ? [t.fingerTiming(lift, Math.abs(average) <= ON_TIME_MS ? 0 : average)] : [];
  });
  return { words: [t.cleanChanges(clean, timed.length), ...kinds], shares: [clean / timed.length] };
}

// Listen's technique exercises, on one string: a long bow, with one note to a bow, or slurs, with more. Each note
// lasts the beats picked, at Practice's BPM, after a count-in, while the pitch line shows what's played. A long bow
// ends with how steady the pitch and the loudness were, slurs with the notes in tune and the bows without a break,
// and both with how many beats were held and how the finger was timed at each note change, with a late or early
// finger picked out on the pitch line. A long bow can pause before each note, to place the finger, then bow.
// The round's score goes on the run's session, for the log. onDone ends the run once a round is played.
export function createTechnique(staff: ReturnType<typeof createStaff>, session: () => Session | null, onDone: () => void) {
  const settings = getSettings();
  const status = h("p", { className: "technique-status" });
  const results = h("div", { className: "chip-row" });
  const countIn = createCountIn(metronome, (text) => (status.textContent = text));
  let notes: ExerciseNote[] = [];
  let starts: number[] = [];
  let current = -1;
  // A round under way: it counts in on the run's first reading, then plays from when its first note began.
  let round: { firstNoteAt: number | null; readings: TechniqueReading[] } | null = null;

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
  const pausing = () => settings.bowPause && settings.bowNotes === 1;

  // Where a beat of the round falls on the staff, where a note longer than a whole one is drawn as a whole one.
  function drawnBeat(beat: number) {
    const index = Math.max(0, starts.findLastIndex((start) => start <= beat));
    const drawnStart = notes.slice(0, index).reduce((sum, note) => sum + Math.min(note.beats!, longestDrawn()), 0);
    const note = notes[Math.min(index, notes.length - 1)];
    return drawnStart + ((beat - starts[index]) * Math.min(note.beats!, longestDrawn())) / note.beats!;
  }

  // A new round of the exercise as the choices set it. It begins once the run is going.
  function start() {
    const pitches = stringNotes(settings.bowString);
    const fingers = pausing() ? PAUSED_FINGERS : BOW_FINGERS[settings.bowNotes];
    // With the pause, a beat's rest comes between each note and the next.
    notes = fingers.flatMap((finger, index): ExerciseNote[] => {
      const bow = Math.floor(index / settings.bowNotes) % 2 ? "up" : "down";
      const note: ExerciseNote = { ...fillFingering({ pitch: pitches[finger], beats: pausing() ? 1 : settings.bowBeats }), bow };
      return pausing() && index < fingers.length - 1 ? [note, { beats: 1 }] : [note];
    });
    starts = noteStarts(notes);
    // The pause only fits a long bow, and sets the beats itself. The beats keep their room, so the row doesn't move.
    pauseButton.hidden = settings.bowNotes !== 1;
    beatsChoice.style.visibility = pausing() ? "hidden" : "";
    current = -1;
    round = { firstNoteAt: null, readings: [] };
    countIn.cancel();
    countIn.hideOverlay();
    staff.clearTrace();
    staff.hidePlayed();
    status.textContent = "";
    results.replaceChildren();
    drawStaff();
  }

  function stop() {
    round = null;
    current = -1;
    countIn.cancel();
    countIn.hideOverlay();
    staff.hidePlayed();
    status.textContent = "";
    drawStaff();
  }

  function finish(readings: TechniqueReading[]) {
    stop();
    const { words, score, changes } = outcome(readings);
    results.replaceChildren(...words.map(chip));
    for (const { ms, wrong } of changes) if (wrong && Math.abs(ms!) > ON_TIME_MS) staff.markTrace(drawnBeat(wrong[0]), drawnBeat(wrong[1]));
    const run = session();
    if (run && score !== null) run.exerciseScore = score;
    onDone();
  }

  // How the round went, in a few words each, and as a score out of 100: the average of its shares, of the notes in tune
  // and bows smooth for slurs, or how steady a long bow was, and of the beats held.
  function outcome(readings: TechniqueReading[]) {
    const options = { beatMs: beatMs(), minRms: settings.minRms, toleranceCents: passCents(), holdMs: settings.holdMs };
    if (!readings.some(({ rms }) => rms >= settings.minRms)) return { words: [t.nothingHeard], score: null, changes: [] };
    const changes = noteChanges(notes, settings.bowNotes, readings, options);
    const timing = changeWords(changes);
    if (settings.bowNotes > 1) {
      const { inTune, smooth, bows, held, beats } = scoreSlurs(notes, settings.bowNotes, readings, options);
      return {
        words: [t.inTuneNotes(inTune, notes.length), t.smoothSlurs(smooth, bows), t.heldBeats(held, beats), ...timing.words],
        score: roundScore([inTune / notes.length, smooth / bows, held / beats, ...timing.shares]),
        changes,
      };
    }
    const { pitchSpread, steadiness, held, beats } = scoreLongBow(notes, readings, options);
    return {
      words: [...(pitchSpread === null ? [] : [t.pitchSpread(pitchSpread)]), ...(steadiness === null ? [] : [t.volumeSteady(steadiness)]), t.heldBeats(held, beats), ...timing.words],
      score: roundScore([...(steadiness === null ? [] : [steadiness / 100]), held / beats, ...timing.shares]),
      changes,
    };
  }

  // Each choice is kept, and starts the exercise again.
  const changed = () => {
    saveSettings();
    start();
  };
  const captioned = (caption: string, group: HTMLElement) => h("span", { className: "chip-choice" }, caption, group);
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
  const beatsChoice = captioned(t.beats, beats);
  const pauseButton = boxToggle(h("span", { className: "icon", innerHTML: PAUSE_ICON }), t.pauseFirstHint, settings.bowPause, (on) => {
    settings.bowPause = on;
    saveSettings();
    start();
  });

  const panel = h(
    "div",
    { className: "technique" },
    h("div", { className: "row" }, captioned(t.perBow, perBow), captioned(t.bowString, strings), beatsChoice),
    status,
    results,
    countIn.overlay,
  );

  return {
    panel,
    // The pause switch, for Listen to put over the staff.
    pause: pauseButton,
    // The note to play now, or in a rest or before the round, the next one, for the fingerboard.
    get note() {
      return notes.slice(Math.max(0, current)).find((note) => note.pitch) ?? null;
    },
    start,
    stop,
    // Draws the notes again, after a toggle changes their labels.
    relabel: drawStaff,
    // Each reading from the mic: the pitch heard, if any, and how loud it was.
    read(frequency: number | null, now: number, rms: number) {
      if (!round) return;
      if (settings.metronomeOn && sharedAudioContext().state === "running") metronome.tick(now, settings.bpm);
      if (round.firstNoteAt === null) {
        if (!countIn.active) countIn.start();
        if (!countIn.tick(now)) return;
        countIn.hideOverlay();
        round.firstNoteAt = now;
      }

      // What the mic hears now was played a moment ago.
      const beat = (now - round.firstNoteAt - MIC_DELAY_MS) / beatMs();
      if (beat >= starts.at(-1)!) return finish(round.readings);
      if (beat < 0) return;

      round.readings.push({ beat, frequency, rms });
      const index = starts.findLastIndex((start) => start <= beat);
      const note = notes[index];
      if (index !== current) {
        current = index;
        drawStaff();
        const bow = note.bow === "down" ? t.downBow : t.upBow;
        status.textContent = note.pitch ? `${t.noteOf(countNotes(notes.slice(0, index + 1)), countNotes(notes))} · ${bow}` : t.placeNextFinger;
      }
      const cents = frequency === null || !note.pitch ? null : centsFrom(frequency, midiOf(note.pitch));
      staff.tracePlayed(drawnBeat(beat), frequency, cents, cents !== null && Math.abs(cents) <= passCents());
    },
  };
}
