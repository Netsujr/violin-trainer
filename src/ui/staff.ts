import { Note } from "tonal";
import { noteLabels } from "../music/notes";
import { Accidental, BarNote, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow/bravura";
import { h } from "./dom";
import type { Section } from "./highway";

export type StaffNote = { pitch: string; beats?: number; finger?: string };
export type StaffLabels = { names: boolean; fingers: boolean };

const TOP = 30;
const LINE_HEIGHT = 130;
const CLEF_SPACE = 60;
const NOTE_WIDTH = 56;
// Rhythm patterns are drawn in bars, packed tighter because they hold more notes.
const BAR_BEATS = 4;
const BAR_NOTE_WIDTH = 40;
const MAX_BARS_PER_LINE = 6;
const DURATIONS: Record<number, string> = { 0.5: "8", 1: "q", 1.5: "qd", 2: "h", 4: "w" };
// Rows relative to a stave's y: clear of the highest and lowest first-position notes, as on the printed sheet.
const FINGER_ROW = 14;
const NAME_ROW = 126;
const NOTEHEAD_CENTER = 6;
// With labels on, their rows use the space that high notes otherwise get above the staff.
const LABELLED_TOP = 6;
const LABELLED_BOTTOM = 8;
const LOW_FINGER_COLOR = "#b03020";
const FINGER_COLOR = "#111";
const NAME_COLOR = "#6b3a1e";
// Matches the timeline's hit line, in the same units, so the current note lines up with its tile.
const HIT_LINE_X = 130;
// Collapsed, the first notehead lands under the hit line, with room for the clef.
const COLLAPSED_NOTE_START = 118;
const COLLAPSED_MARGIN = 16;
const COLLAPSED_BEAT_WIDTH = 72;
const SECTION_COLOR = "rgba(255, 149, 0, 0.28)";
// How far a note's clickable slot and the section's band start before its notehead, and how far the last one runs after it.
const NOTE_LEAD = 20;
const NOTE_TAIL = 40;

function toStaveNote({ pitch, beats = 1 }: StaffNote, showAccidental: boolean) {
  const { letter, acc, oct } = Note.get(pitch);
  const note = new StaveNote({ keys: [`${letter.toLowerCase()}${acc}/${oct}`], duration: DURATIONS[beats], autoStem: true });
  if (acc && showAccidental) note.addModifier(new Accidental(acc));
  if (beats === 1.5) Dot.buildAndAttach([note], { all: true });
  return note;
}

function beamEighths(bar: StaffNote[], staveNotes: StaveNote[]) {
  const beams: Beam[] = [];
  let run: StaveNote[] = [];
  const closeRun = () => {
    if (run.length > 1) beams.push(new Beam(run, true));
    run = [];
  };
  bar.forEach((note, index) => {
    if (note.beats === 0.5) run.push(staveNotes[index]);
    else closeRun();
  });
  closeRun();
  return beams;
}

function toBars(notes: StaffNote[]) {
  const bars: StaffNote[][] = [[]];
  let beats = 0;
  for (const note of notes) {
    if (beats === BAR_BEATS) {
      bars.push([]);
      beats = 0;
    }
    bars.at(-1)!.push(note);
    beats += note.beats!;
  }
  return bars;
}

// Lines of bars. Without a rhythm pattern, each line is one long "bar" with no barlines.
function layOut(notes: StaffNote[], room: number, barred: boolean) {
  if (!barred) {
    const perLine = Math.floor(room / NOTE_WIDTH);
    const lineCount = Math.max(1, Math.ceil(notes.length / perLine));
    return Array.from({ length: lineCount }, (_, line) => [notes.slice(line * perLine, (line + 1) * perLine)]);
  }

  const lines: StaffNote[][][] = [[]];
  for (const bar of toBars(notes)) {
    const line = lines.at(-1)!;
    const isFull = line.length === MAX_BARS_PER_LINE || (line.flat().length + bar.length) * BAR_NOTE_WIDTH > room;
    if (line.length > 0 && isFull) lines.push([bar]);
    else line.push(bar);
  }
  return lines;
}

const beatsOf = (note: StaffNote) => note.beats ?? 1;

function svgText(svg: SVGSVGElement, text: string, x: number, y: number, fill: string, fontSize: number) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "text");
  element.textContent = text;
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("fill", fill);
  element.setAttribute("stroke", "none");
  element.setAttribute("font-size", String(fontSize));
  element.setAttribute("font-weight", "700");
  element.setAttribute("font-family", "system-ui, sans-serif");
  element.setAttribute("text-anchor", "middle");
  svg.append(element);
}

export function createStaff(width = 300, startCollapsed = false, scale = 1, onPick?: (noteIndex: number, extend: boolean) => void) {
  const element = h("div", { className: "staff" });
  if (onPick) {
    element.classList.add("pickable");
    element.addEventListener("click", (event) => {
      const noteIndex = noteAt(event);
      if (noteIndex >= 0) onPick(noteIndex, event.shiftKey);
    });
    // Otherwise Shift+click also selects the page's text.
    element.addEventListener("mousedown", (event) => {
      if (event.shiftKey) event.preventDefault();
    });
  }
  let collapsed = startCollapsed;
  let shown: string | null = null;
  let labels: StaffLabels = { names: false, fingers: false };
  // Where each note starts, in beats and in pixels on the collapsed line.
  let noteBeats: number[] = [];
  let noteXs: number[] = [];
  // The line each note is on, and the sheet's measurements, to find the note under a click.
  let noteLines: number[] = [];
  let sheet = { width: 0, height: 0, top: 0 };
  let section: Section | null = null;
  let followedBeat = 0;

  function noteAt(event: MouseEvent) {
    const box = element.querySelector("svg")!.getBoundingClientRect();
    const x = ((event.clientX - box.left) * sheet.width) / box.width;
    const y = ((event.clientY - box.top) * sheet.height) / box.height;
    const line = Math.max(0, Math.min(noteLines.at(-1) ?? 0, Math.floor((y - sheet.top) / LINE_HEIGHT)));
    const noteIndex = noteXs.findLastIndex((noteX, index) => noteLines[index] === line && noteX - NOTE_LEAD <= x);
    const isLastOnLine = noteLines[noteIndex + 1] !== line;
    return isLastOnLine && x > noteXs[noteIndex] + NOTE_TAIL ? -1 : noteIndex;
  }

  // A band behind each selected note, line by line, so a section can wrap across the sheet.
  function drawSection(svg: SVGSVGElement) {
    if (!section) return;

    for (let index = section.first; index <= section.last; index++) {
      const continues = index < section.last && noteLines[index + 1] === noteLines[index];
      const left = noteXs[index] - NOTE_LEAD;
      const right = continues ? noteXs[index + 1] - NOTE_LEAD : noteXs[index] + NOTE_TAIL;
      const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      band.classList.add("section-band");
      band.setAttribute("x", String(left));
      band.setAttribute("y", String(sheet.top + noteLines[index] * LINE_HEIGHT));
      band.setAttribute("width", String(right - left));
      band.setAttribute("height", String(LINE_HEIGHT));
      band.setAttribute("fill", SECTION_COLOR);
      band.setAttribute("stroke", "none");
      svg.prepend(band);
    }
  }

  function render(notes: StaffNote[]) {
    element.replaceChildren();
    element.classList.toggle("collapsed", collapsed);
    const room = width - CLEF_SPACE;
    const barred = notes.some((note) => note.beats);
    const lines = collapsed ? [barred ? toBars(notes) : [notes]] : layOut(notes, room, barred);
    const totalBeats = notes.reduce((sum, note) => sum + beatsOf(note), 0);
    // Collapsed, there is a screen of empty staff after the last note, so it can still reach the hit line.
    const fullWidth = collapsed ? COLLAPSED_NOTE_START + totalBeats * COLLAPSED_BEAT_WIDTH + width : width;
    // Bars can hold different numbers of notes, so the fullest line sets the width of a bar, not the first line.
    const mostBars = Math.max(...lines.map((line) => line.length));
    const labelled = labels.names || labels.fingers;
    const top = labelled ? LABELLED_TOP : TOP;
    const height = top + lines.length * LINE_HEIGHT + (labelled ? LABELLED_BOTTOM : 0);
    sheet = { width: fullWidth, height, top };
    noteLines = [];
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(fullWidth, height);
    const context = renderer.getContext();
    const svg = element.querySelector("svg")!;
    svg.setAttribute("viewBox", `0 0 ${fullWidth} ${height}`);
    // Open, the sheet fills the page. Collapsed, it keeps the timeline's scale and scrolls.
    svg.style.width = collapsed ? `${fullWidth * scale}px` : "100%";
    svg.style.height = collapsed ? `${height * scale}px` : "auto";

    const allNotes: StaveNote[] = [];
    lines.forEach((line, lineIndex) => {
      const staveX = collapsed ? COLLAPSED_MARGIN : 0;
      const stave = new Stave(staveX, top + lineIndex * LINE_HEIGHT, fullWidth - staveX - 1).addClef("treble");
      if (collapsed) stave.setNoteStartX(COLLAPSED_NOTE_START);
      stave.setContext(context).draw();
      const lineNotes = line.flat();
      if (lineNotes.length === 0) return;

      const firstNote = allNotes.length;
      const beams: Beam[] = [];
      const tickables = line.flatMap((bar, barIndex) => {
        // In a bar, an accidental is only written the first time.
        const written = new Set<string>();
        const staveNotes = bar.map((note) => {
          const staveNote = toStaveNote(note, !barred || !written.has(note.pitch));
          written.add(note.pitch);
          return staveNote;
        });
        beams.push(...beamEighths(bar, staveNotes));
        allNotes.push(...staveNotes);
        return barIndex > 0 ? [new BarNote(), ...staveNotes] : staveNotes;
      });

      const lineBeats = lineNotes.reduce((sum, note) => sum + beatsOf(note), 0);
      const voice = new Voice({ numBeats: lineBeats, beatValue: 4 }).addTickables(tickables);
      const barredWidth = ((room - 20) * line.length) / mostBars;
      const formatWidth = collapsed ? lineBeats * COLLAPSED_BEAT_WIDTH : barred ? barredWidth : lineNotes.length * NOTE_WIDTH;
      new Formatter().joinVoices([voice]).format([voice], formatWidth);
      voice.draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
      const staveY = top + lineIndex * LINE_HEIGHT;
      for (const _ of lineNotes) noteLines.push(lineIndex);
      lineNotes.forEach((note, index) => {
        const x = allNotes[firstNote + index].getAbsoluteX() + NOTEHEAD_CENTER;
        if (labels.fingers && note.finger) {
          const color = note.finger.startsWith("L") ? LOW_FINGER_COLOR : FINGER_COLOR;
          svgText(svg, note.finger.replace("L", ""), x, staveY + FINGER_ROW, color, 13);
        }
        if (labels.names) svgText(svg, noteLabels(note.pitch).solfege, x, staveY + NAME_ROW, NAME_COLOR, 11);
      });
    });

    noteXs = allNotes.map((note) => note.getAbsoluteX());
    drawSection(svg);
    noteBeats = [];
    let beat = 0;
    for (const note of notes) {
      noteBeats.push(beat);
      beat += beatsOf(note);
    }
  }

  function scrollToBeat() {
    if (!collapsed || noteXs.length === 0) return;

    const index = Math.max(0, noteBeats.findLastIndex((start) => start <= followedBeat));
    const nextX = noteXs[index + 1] ?? noteXs[index];
    const nextBeat = noteBeats[index + 1] ?? noteBeats[index] + 1;
    const between = Math.min(1, (followedBeat - noteBeats[index]) / (nextBeat - noteBeats[index]));
    element.scrollLeft = (noteXs[index] + between * (nextX - noteXs[index]) - HIT_LINE_X) * scale;
  }

  return {
    element,
    draw(notes: StaffNote[], current = 0, newLabels: StaffLabels = labels, newSection: Section | null = null) {
      labels = newLabels;
      section = newSection;
      const key = [labels.names, labels.fingers, section?.first, section?.last, ...notes.map((note) => `${note.pitch}:${note.beats}:${note.finger}`)].join();
      if (key !== shown) {
        shown = key;
        render(notes);
      }
      element.querySelectorAll(".vf-stavenote").forEach((note, index) => note.classList.toggle("current", index === current));
      scrollToBeat();
      // The first draw happens before the staff is on the page, when it has no width to scroll in.
      if (!element.isConnected) requestAnimationFrame(scrollToBeat);
    },
    setCollapsed(value: boolean) {
      collapsed = value;
      shown = null;
    },
    resize(newWidth: number, newScale: number) {
      width = newWidth;
      scale = newScale;
      shown = null;
    },
    // Keeps the collapsed line in step with the timeline, beat for beat.
    follow(beat: number) {
      followedBeat = beat;
      scrollToBeat();
    },
  };
}
