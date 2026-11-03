import { Note } from "tonal";
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow/bravura";
import { h } from "./dom";

const TOP = 30;
const LINE_HEIGHT = 130;
const CLEF_SPACE = 60;
const NOTE_WIDTH = 56;

function toStaveNote(pitch: string) {
  const { letter, acc, oct } = Note.get(pitch);
  const note = new StaveNote({ keys: [`${letter.toLowerCase()}${acc}/${oct}`], duration: "q", autoStem: true });
  if (acc) note.addModifier(new Accidental(acc));
  return note;
}

export function createStaff(width = 300) {
  const element = h("div", { className: "staff" });
  const perLine = Math.floor((width - CLEF_SPACE) / NOTE_WIDTH);
  let shown: string | null = null;

  function render(pitches: string[]) {
    element.replaceChildren();
    const lineCount = Math.max(1, Math.ceil(pitches.length / perLine));
    const height = TOP + lineCount * LINE_HEIGHT;
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const context = renderer.getContext();
    // Scale with the page instead of VexFlow's fixed pixel size.
    const svg = element.querySelector("svg")!;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.width = "100%";
    svg.style.height = "auto";

    for (let line = 0; line < lineCount; line++) {
      const stave = new Stave(0, TOP + line * LINE_HEIGHT, width - 1).addClef("treble");
      stave.setContext(context).draw();
      const linePitches = pitches.slice(line * perLine, (line + 1) * perLine);
      if (linePitches.length === 0) continue;

      const lineNotes = linePitches.map(toStaveNote);
      const voice = new Voice({ numBeats: lineNotes.length, beatValue: 4 }).addTickables(lineNotes);
      new Formatter().joinVoices([voice]).format([voice], lineNotes.length * NOTE_WIDTH);
      voice.draw(context, stave);
    }
  }

  return {
    element,
    draw(pitches: string[], current = 0) {
      const key = pitches.join();
      if (key !== shown) {
        shown = key;
        render(pitches);
      }
      element.querySelectorAll(".vf-stavenote").forEach((note, index) => note.classList.toggle("current", index === current));
    },
  };
}
