import { Note } from "tonal";
import { t } from "../i18n";
import { HIGHEST_MIDI, LOWEST_MIDI } from "../music/fingering";
import { BAR_BEATS, BEAT_LABELS, BEAT_LENGTHS, midiOf, noteLabels, type PieceNote } from "../music/notes";
import { h } from "./dom";
import { createLinePlayer } from "./linePlayer";
import { dockOption } from "./panels";
import { withPitch } from "./pieceEditor";
import { TRASH_ICON } from "./toggles";

const ACCIDENTALS = ["", "#", "b"];

type Editor = {
  notes: () => PieceNote[];
  selected: () => number | null;
  // The beat a note starts on, counted from the start of the piece.
  startOf: (index: number) => number;
  // The notes on the same line of the sheet as a note.
  line: (index: number) => PieceNote[];
  change: (update: () => void) => void;
  remove: (index: number) => void;
  addRest: () => void;
};

// The note tools, docked under the staff for the note picked out on it: its name and bar, its beats, sharp or flat,
// and buttons to hear its line, add a rest and delete it. With no note picked, only Add a rest shows.
export function createNoteTools(editor: Editor) {
  const name = h("p", { className: "selected-note" });
  const beats = BEAT_LENGTHS.map((length) =>
    h("button", { type: "button", textContent: BEAT_LABELS[length], onclick: () => set((note) => ({ ...note, beats: length })) }),
  );
  const accidentals = ACCIDENTALS.map((accidental, index) =>
    h("button", {
      type: "button",
      textContent: [t.natural, t.sharp, t.flat][index],
      onclick() {
        const { letter, oct } = Note.get(editor.notes()[editor.selected()!].pitch!);
        set((note) => withPitch(note, `${letter}${accidental}${oct}`));
      },
    }),
  );
  const player = createLinePlayer();
  const hear = player.button(() => editor.line(editor.selected()!));
  const remove = h("button", { type: "button", className: "ghost-button icon-only", innerHTML: TRASH_ICON, ariaLabel: t.deleteNote, onclick: () => editor.remove(editor.selected()!) });
  const rest = h("button", { type: "button", className: "ghost-button", textContent: t.addRest, onclick: editor.addRest });
  const noteOption = dockOption(t.selectedNote, name);
  const beatsOption = dockOption(t.noteBeats, h("div", { role: "group", className: "segments", ariaLabel: t.noteBeats }, ...beats));
  const accidentalOption = dockOption(t.sharpOrFlat, h("div", { role: "group", className: "segments", ariaLabel: t.sharpOrFlat }, ...accidentals));

  // Changes the selected note.
  const set = (update: (note: PieceNote) => PieceNote) => {
    const index = editor.selected()!;
    editor.change(() => (editor.notes()[index] = update(editor.notes()[index])));
  };

  function show() {
    const index = editor.selected();
    const note = index === null ? undefined : editor.notes()[index];
    [noteOption, beatsOption, hear, remove].forEach((part) => (part.hidden = !note));
    accidentalOption.hidden = !note?.pitch;
    if (!note) return;
    const start = editor.startOf(index!);
    const bar = Math.floor(start / BAR_BEATS) + 1;
    name.textContent = note.pitch ? t.noteInBar(noteLabels(note.pitch).solfege, noteLabels(note.pitch).letter, bar) : t.restInBar(bar);
    // Only lengths that fit what's left of the bar, and the note's own if earlier changes have pushed it over.
    const room = BAR_BEATS - (start % BAR_BEATS);
    beats.forEach((button, at) => {
      button.ariaPressed = String(BEAT_LENGTHS[at] === note.beats);
      button.disabled = BEAT_LENGTHS[at] > room && BEAT_LENGTHS[at] !== note.beats;
    });
    // Natural, sharp and flat, but none that would leave the violin's range.
    if (!note.pitch) return;
    const { letter, acc, oct } = Note.get(note.pitch);
    accidentals.forEach((button, at) => {
      const midi = midiOf(`${letter}${ACCIDENTALS[at]}${oct}`);
      button.ariaPressed = String(ACCIDENTALS[at] === acc);
      button.disabled = midi < LOWEST_MIDI || midi > HIGHEST_MIDI;
    });
  }

  return {
    element: h(
      "section",
      { className: "dock note-tools", ariaLabel: t.selectedNote },
      noteOption,
      beatsOption,
      accidentalOption,
      dockOption(t.edit, h("div", { className: "row" }, hear, rest, remove)),
    ),
    show,
    stopPlaying: player.stop,
  };
}
