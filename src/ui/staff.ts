import { Note } from "tonal";
import { BAR_BEATS, midiOf, noteLabels, staffStepsFrom } from "../music/notes";
import { Accidental, BarNote, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice, type RenderContext } from "vexflow/bravura";
import { h } from "./dom";
import type { Section } from "./highway";

type StaffNote = { pitch: string; beats?: number; finger?: string };
export type StaffLabels = { names: boolean; fingers: boolean };
type WriteLabel = (text: string, x: number, y: number, fill: string, fontSize: number) => void;

const TOP = 30;
export const LINE_HEIGHT = 130;
const CLEF_SPACE = 60;
const BAR_NOTE_WIDTH = 40;
// An open sheet always has four bars to a line, however wide the page.
const BARS_PER_LINE = 4;
// A sheet fitted to the screen is never drawn smaller than this.
const MIN_FITTED_SCALE = 1;
const DURATIONS: Record<number, string> = { 0.5: "8", 1: "q", 1.5: "qd", 2: "h", 3: "hd", 4: "w" };
// How far a line's rows of fingers and names sit outside the staff and its notes, measured to the text's baseline.
const FINGER_GAP = 5;
const NAME_GAP = 14;
// The furthest those rows go from a stave's y, which keeps them inside its line and off the next line's labels.
const HIGHEST_FINGER_ROW = 10;
const LOWEST_NAME_ROW = 126;
const NOTEHEAD_CENTER = 6;
const NOTEHEAD_RADIUS = 5;
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
const STAFF_STEP_HEIGHT = 5;
const PLAYED_COLOR = "#1f6fd1";
const PLAYED_IN_TUNE_COLOR = "#14914a";
// How far a note's clickable slot and the section's band start before its notehead, and how far the last one runs after it.
const NOTE_LEAD = 20;
const NOTE_TAIL = 40;

export function toStaveNote({ pitch, beats = 1 }: StaffNote, showAccidental: boolean) {
  const { letter, acc, oct } = Note.get(pitch);
  const note = new StaveNote({ keys: [`${letter.toLowerCase()}${acc}/${oct}`], duration: DURATIONS[beats], autoStem: true });
  if (acc && showAccidental) note.addModifier(new Accidental(acc));
  if (beats === 1.5 || beats === 3) Dot.buildAndAttach([note], { all: true });
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

const beatsOf = (note: StaffNote) => note.beats ?? 1;
const beatsIn = (notes: StaffNote[]) => notes.reduce((sum, note) => sum + beatsOf(note), 0);

// A note with no written length, like a scale's, counts as one beat.
function toBars(notes: StaffNote[]) {
  const bars: StaffNote[][] = [[]];
  let beats = 0;
  for (const note of notes) {
    if (beats === BAR_BEATS) {
      bars.push([]);
      beats = 0;
    }
    bars.at(-1)!.push(note);
    beats += beatsOf(note);
  }
  return bars;
}

function layOut(notes: StaffNote[]) {
  const bars = toBars(notes);
  return Array.from({ length: Math.ceil(bars.length / BARS_PER_LINE) }, (_, line) => bars.slice(line * BARS_PER_LINE, (line + 1) * BARS_PER_LINE));
}

// The bars on each line of an open sheet, and the width to space each line's notes in.
export function openLines(notes: StaffNote[], width: number) {
  const room = width - CLEF_SPACE;
  const lines = layOut(notes);
  // Bars can hold different numbers of notes, so the fullest line sets the width of a bar, not the first line.
  const mostBars = Math.max(...lines.map((line) => line.length));
  return lines.map((line) => ({ line, formatWidth: ((room - 20) * line.length) / mostBars }));
}

// Draws a line of bars on the page's SVG or a PDF's canvas, and returns its notes.
export function drawLine(context: RenderContext, stave: Stave, line: StaffNote[][], formatWidth: number, labels: StaffLabels, writeLabel: WriteLabel) {
  stave.setContext(context).draw();
  const lineNotes = line.flat();
  if (lineNotes.length === 0) return [];

  const drawn: StaveNote[] = [];
  const beams: Beam[] = [];
  const tickables = line.flatMap((bar, barIndex) => {
    // In a bar, an accidental is only written the first time.
    const written = new Set<string>();
    const staveNotes = bar.map((note) => {
      const staveNote = toStaveNote(note, !written.has(note.pitch));
      written.add(note.pitch);
      return staveNote;
    });
    beams.push(...beamEighths(bar, staveNotes));
    drawn.push(...staveNotes);
    return barIndex > 0 ? [new BarNote(), ...staveNotes] : staveNotes;
  });

  const voice = new Voice({ numBeats: beatsIn(lineNotes), beatValue: 4 }).addTickables(tickables);
  new Formatter().joinVoices([voice]).format([voice], formatWidth);
  voice.draw(context, stave);
  beams.forEach((beam) => beam.setContext(context).draw());
  // The labels stay as close as this line's notes allow, so they read as part of it and not of the next line.
  const reaches = drawn.flatMap((note) => {
    const head = note.getYs()[0];
    return [head - NOTEHEAD_RADIUS, head + NOTEHEAD_RADIUS, ...(note.hasStem() ? Object.values(note.getStemExtents()) : [])];
  });
  const fingerRow = Math.max(stave.getY() + HIGHEST_FINGER_ROW, Math.min(stave.getYForLine(0), ...reaches) - FINGER_GAP);
  const nameRow = Math.min(stave.getY() + LOWEST_NAME_ROW, Math.max(stave.getYForLine(4), ...reaches) + NAME_GAP);
  lineNotes.forEach((note, index) => {
    const x = drawn[index].getAbsoluteX() + NOTEHEAD_CENTER;
    if (labels.fingers && note.finger) {
      const color = note.finger.startsWith("L") ? LOW_FINGER_COLOR : FINGER_COLOR;
      writeLabel(note.finger.replace("L", ""), x, fingerRow, color, 13);
    }
    if (labels.names) writeLabel(noteLabels(note.pitch).solfege, x, nameRow, NAME_COLOR, 11);
  });
  return drawn;
}

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

// The ghost notehead showing what's being played, and an arrow saying which way to move.
function createPlayedNote() {
  const svgElement = <Tag extends keyof SVGElementTagNameMap>(tag: Tag) => document.createElementNS("http://www.w3.org/2000/svg", tag);
  const group = svgElement("g");
  const head = svgElement("ellipse");
  const arrow = svgElement("text");
  group.classList.add("played-note");
  group.setAttribute("pointer-events", "none");
  head.setAttribute("rx", "7");
  head.setAttribute("ry", "5");
  head.setAttribute("opacity", "0.8");
  arrow.setAttribute("font-size", "18");
  arrow.setAttribute("font-weight", "700");
  arrow.setAttribute("stroke", "none");
  arrow.setAttribute("font-family", "system-ui, sans-serif");
  group.append(head, arrow);
  return { group, head, arrow };
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
  let noteYs: number[] = [];
  let shownNotes: StaffNote[] = [];
  const played = createPlayedNote();
  let sheet = { width: 0, height: 0, top: 0 };
  let section: Section | null = null;
  let followedBeat = 0;
  // When set, an open sheet is drawn as large as fits this many pixels of height.
  let fitHeight: number | null = null;

  // The width to draw an open sheet at, in its own units: the fewer, the larger it shows. It's sized to fill fitHeight,
  // but never cramps its notes, nor shrinks below a readable size, so a long piece scrolls instead.
  function fittedWidth(notes: StaffNote[], top: number, bottom: number) {
    const lines = layOut(notes);
    const shownWidth = width * scale;
    const needed = CLEF_SPACE + 20 + Math.max(...lines.map((line) => line.flat().length)) * BAR_NOTE_WIDTH;
    const toFill = ((top + lines.length * LINE_HEIGHT + bottom) * shownWidth) / fitHeight!;
    return Math.max(needed, Math.min(shownWidth / MIN_FITTED_SCALE, toFill));
  }

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
    const totalBeats = beatsIn(notes);
    const labelled = labels.names || labels.fingers;
    const top = labelled ? LABELLED_TOP : TOP;
    const bottom = labelled ? LABELLED_BOTTOM : 0;
    const sheetWidth = !collapsed && fitHeight ? fittedWidth(notes, top, bottom) : width;
    const lines = collapsed ? [{ line: toBars(notes), formatWidth: totalBeats * COLLAPSED_BEAT_WIDTH }] : openLines(notes, sheetWidth);
    // Collapsed, there is a screen of empty staff after the last note, so it can still reach the hit line.
    const fullWidth = collapsed ? COLLAPSED_NOTE_START + totalBeats * COLLAPSED_BEAT_WIDTH + width : sheetWidth;
    const height = top + lines.length * LINE_HEIGHT + bottom;
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
    lines.forEach(({ line, formatWidth }, lineIndex) => {
      const staveX = collapsed ? COLLAPSED_MARGIN : 0;
      const stave = new Stave(staveX, top + lineIndex * LINE_HEIGHT, fullWidth - staveX - 1).addClef("treble");
      if (collapsed) stave.setNoteStartX(COLLAPSED_NOTE_START);
      const drawn = drawLine(context, stave, line, formatWidth, labels, (...label) => svgText(svg, ...label));
      allNotes.push(...drawn);
      for (const _ of drawn) noteLines.push(lineIndex);
    });

    noteXs = allNotes.map((note) => note.getAbsoluteX());
    noteYs = allNotes.map((note) => note.getYs()[0]);
    shownNotes = notes;
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
    hidePlayed: () => played.group.remove(),
    // Shows what's being played against the note at index, or nothing with cents null.
    showPlayed(index: number, cents: number | null, inTune: boolean) {
      const note = shownNotes[index];
      if (cents === null || !note) {
        played.group.remove();
        return;
      }
      const x = noteXs[index] + NOTEHEAD_CENTER;
      // Right on the note it lands exactly on it, which is the moment it clears.
      const y = noteYs[index] - (inTune ? 0 : staffStepsFrom(midiOf(note.pitch), cents) * STAFF_STEP_HEIGHT);
      const color = inTune ? PLAYED_IN_TUNE_COLOR : PLAYED_COLOR;
      played.head.setAttribute("cx", String(x));
      played.head.setAttribute("cy", String(y));
      played.head.setAttribute("fill", color);
      played.head.setAttribute("transform", `rotate(-20 ${x} ${y})`);
      played.arrow.textContent = inTune ? "" : cents < 0 ? "↑" : "↓";
      played.arrow.setAttribute("x", String(x + 12));
      played.arrow.setAttribute("y", String(y + 6));
      played.arrow.setAttribute("fill", color);
      played.group.dataset.inTune = String(inTune);
      if (played.group.parentNode !== element.querySelector("svg")) element.querySelector("svg")?.append(played.group);
    },
    setCollapsed(value: boolean) {
      collapsed = value;
      shown = null;
    },
    // Draws an open sheet as large as fits this height in pixels, or as usual with null.
    fitTo(height: number | null) {
      fitHeight = height;
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
