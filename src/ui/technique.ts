import { createMetronome } from "../audio/metronome";
import { sharedAudioContext } from "../audio/reference";
import { t } from "../i18n";
import { fillFingering, stringFor } from "../music/fingering";
import { centsFrom, midiOf, type PieceNote, type StringName } from "../music/notes";
import { scoreLongBow, scoreSlurs, type TechniqueReading } from "../practice/technique";
import { getSettings, saveSettings } from "../storage";
import { h } from "./dom";
import { levelNotes, toggleLabels } from "./guesser";
import { createCountIn } from "./practice/countIn";
import { iconSwitch } from "./practice/options";
import { beatMs, MIC_DELAY_MS } from "./practice/timing";
import type { createStaff } from "./staff";
import { chipGroup, METRONOME_ICON } from "./toggles";

const NOTES_PER_BOW = [1, 2, 3, 4];
const BOW_STRINGS: StringName[] = ["G", "D", "A", "E"];
const BEATS_PER_NOTE = [2, 4, 8];
// The staff has no note longer than a whole one, so a longer note is drawn as a whole note.
const LONGEST_DRAWN_BEATS = 4;
// The fingers played with each number of notes to a bow: up the string and, where the bows need it, back down, so
// every bow is full and a round ends on an up bow.
const BOW_FINGERS: Record<number, number[]> = { 1: [0, 1, 2, 3], 2: [0, 1, 2, 3], 3: [0, 1, 2, 3, 2, 1], 4: [0, 1, 2, 3, 3, 2, 1, 0] };

type ExerciseNote = PieceNote & { bow: "down" | "up" };

// The open string, then fingers 1, 2 and 3 on it: the beginner's pattern.
const stringNotes = (string: StringName) => levelNotes("medium").filter((pitch) => stringFor(midiOf(pitch)) === string);
const chip = (text: string) => h("span", { className: "info-chip" }, text);

// Listen's technique exercises, on one string: a long bow, with one note to a bow, or slurs, with more. Each note
// lasts the beats picked, at Practice's BPM, after a count-in, while the pitch line shows what's played. A long bow
// ends with how steady the pitch and the loudness were, slurs with the notes in tune and the bows without a break,
// and both with how many beats were held.
// onDone ends the run once a round is played.
export function createTechnique(staff: ReturnType<typeof createStaff>, onDone: () => void) {
  const settings = getSettings();
  const metronome = createMetronome();
  const status = h("p", { className: "technique-status" });
  const results = h("div", { className: "chip-row" });
  const countIn = createCountIn(metronome, (text) => (status.textContent = text));
  let notes: ExerciseNote[] = [];
  let current = -1;
  // A round under way: it counts in on the run's first reading, then plays from when its first note began.
  let round: { firstNoteAt: number | null; readings: TechniqueReading[] } | null = null;

  // Each bow is marked at its first note, with a slur over its notes.
  const drawn = () =>
    notes.map((note, index) => ({
      ...note,
      beats: Math.min(note.beats!, LONGEST_DRAWN_BEATS),
      bow: index % settings.bowNotes ? undefined : note.bow,
      slur: index % settings.bowNotes < settings.bowNotes - 1,
    }));
  const drawStaff = () => staff.draw(drawn(), current, toggleLabels());

  // A new round of the exercise as the choices set it. It begins once the run is going.
  function start() {
    const pitches = stringNotes(settings.bowString);
    notes = BOW_FINGERS[settings.bowNotes].map((finger, index): ExerciseNote => ({
      ...fillFingering({ pitch: pitches[finger], beats: settings.bowBeats }),
      bow: Math.floor(index / settings.bowNotes) % 2 ? "up" : "down",
    }));
    current = -1;
    round = { firstNoteAt: null, readings: [] };
    countIn.cancel();
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
    staff.hidePlayed();
    status.textContent = "";
    drawStaff();
  }

  function finish(readings: TechniqueReading[]) {
    stop();
    results.replaceChildren(...outcome(readings).map(chip));
    onDone();
  }

  // How the round went, in a few words each.
  function outcome(readings: TechniqueReading[]) {
    const options = { beatMs: beatMs(), minRms: settings.minRms, toleranceCents: settings.toleranceCents, holdMs: settings.holdMs };
    if (!readings.some(({ rms }) => rms >= settings.minRms)) return [t.nothingHeard];
    if (settings.bowNotes > 1) {
      const { inTune, smooth, bows, held, beats } = scoreSlurs(notes, settings.bowNotes, readings, options);
      return [t.inTuneNotes(inTune, notes.length), t.smoothSlurs(smooth, bows), t.heldBeats(held, beats)];
    }
    const { pitchSpread, steadiness, held, beats } = scoreLongBow(notes, readings, options);
    return [...(pitchSpread === null ? [] : [t.pitchSpread(pitchSpread)]), ...(steadiness === null ? [] : [t.volumeSteady(steadiness)]), t.heldBeats(held, beats)];
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
  const metronomeSwitch = iconSwitch("metronomeOn", t.metronome, METRONOME_ICON, t.metronome, start);

  const panel = h(
    "div",
    { className: "technique" },
    h("div", { className: "row" }, captioned(t.perBow, perBow), captioned(t.bowString, strings), captioned(t.beats, beats), metronomeSwitch.label),
    status,
    results,
  );

  return {
    panel,
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
        round.firstNoteAt = now;
      }

      // What the mic hears now was played a moment ago.
      const beat = (now - round.firstNoteAt - MIC_DELAY_MS) / beatMs();
      if (beat >= notes.length * settings.bowBeats) return finish(round.readings);
      if (beat < 0) return;

      round.readings.push({ beat, frequency, rms });
      const index = Math.floor(beat / settings.bowBeats);
      if (index !== current) {
        current = index;
        drawStaff();
        status.textContent = `${t.noteOf(index + 1, notes.length)} · ${notes[index].bow === "down" ? t.downBow : t.upBow}`;
      }
      const cents = frequency === null ? null : centsFrom(frequency, midiOf(notes[index].pitch));
      const drawnBeat = (beat * Math.min(settings.bowBeats, LONGEST_DRAWN_BEATS)) / settings.bowBeats;
      staff.tracePlayed(drawnBeat, frequency, cents, cents !== null && Math.abs(cents) <= settings.toleranceCents);
    },
  };
}
