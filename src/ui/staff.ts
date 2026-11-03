import { Note } from "tonal";
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow/bravura";
import { h } from "./dom";

const WIDTH = 300;
const HEIGHT = 160;
const STAVE_Y = 30;
const CLEF_SPACE = 60;
const CURRENT_NOTE_COLOR = "#b03020";

function toStaveNote(pitch: string, index: number) {
  const { letter, acc, oct } = Note.get(pitch);
  const note = new StaveNote({ keys: [`${letter.toLowerCase()}${acc}/${oct}`], duration: "q", autoStem: true });
  if (acc) note.addModifier(new Accidental(acc));
  if (index === 0) note.setStyle({ fillStyle: CURRENT_NOTE_COLOR, strokeStyle: CURRENT_NOTE_COLOR });
  return note;
}

export function createStaff() {
  const element = h("div", { className: "staff" });
  let shown: string | null = null;

  return {
    element,
    draw(pitches: string[]) {
      const key = pitches.join();
      if (key === shown) return;

      shown = key;
      element.replaceChildren();
      const renderer = new Renderer(element, Renderer.Backends.SVG);
      renderer.resize(WIDTH, HEIGHT);
      const context = renderer.getContext();
      const stave = new Stave(0, STAVE_Y, WIDTH - 1).addClef("treble");
      stave.setContext(context).draw();
      if (pitches.length === 0) return;

      const notes = pitches.map(toStaveNote);
      const voice = new Voice({ numBeats: notes.length, beatValue: 4 }).addTickables(notes);
      new Formatter().joinVoices([voice]).format([voice], WIDTH - CLEF_SPACE - 20);
      voice.draw(context, stave);
    },
  };
}
