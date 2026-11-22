import { Note } from "tonal";
import { BarlineType, Formatter, Renderer, Stave, Voice } from "vexflow/bravura";
import { t } from "../i18n";
import { BAR_BEATS, barMarks, noteLabels, type PieceNote } from "../music/notes";
import { h } from "./dom";
import { contentWidth } from "./layout";
import { createNoteTools } from "./noteTools";
import { toStaveNote } from "./staff";

// The sheet is drawn larger than the Practice staff, so a note's position is easy to hit. Sizes are in staff units,
// except a beat's width, which is whole pixels so the pieces of a staff line meet exactly.
const SCALE = 1.5;
const MAX_BEAT_PX = 72;
const CLEF_WIDTH = 40;
const NOTEHEAD_LEFT = 10;
const NOTEHEAD_CENTER = NOTEHEAD_LEFT + 6;
const SHEET_HEIGHT = 128;
const TOP_LINE_Y = 30;
const BOTTOM_LINE_Y = 70;
const STAVE_Y = TOP_LINE_Y - 40; // VexFlow leaves four lines of space above the top line.
const STEP_HEIGHT = 5;
const BEAT_NUMBER_Y = 12;
const BEAT_LINE_COLOR = "#2c3442";
const BEAT_NUMBER_COLOR = "#8590a2";
const BAR_LINE_COLOR = "#6f7a8d";
const GHOST_COLOR = "#e6ae48";
// Staff positions counted from the bottom line, E4. The violin's first position runs from G3 to B5.
const LETTERS = "CDEFGAB";
const BOTTOM_LINE_POSITION = 4 * 7 + LETTERS.indexOf("E");
const LOWEST_STEP = -5;
const HIGHEST_STEP = 11;
// How close to a note a press has to be to pick it up, so a stray touch nearby doesn't move it.
const GRAB_STEPS = 3;

const stepOf = (pitch: string) => {
  const { letter, oct } = Note.get(pitch);
  return oct! * 7 + LETTERS.indexOf(letter) - BOTTOM_LINE_POSITION;
};
const pitchAt = (step: number) => {
  const position = BOTTOM_LINE_POSITION + step;
  return `${LETTERS[position % 7]}${Math.floor(position / 7)}`;
};
// A new pitch drops the note's string and finger, which were for the old one. Saving works them out again.
export const withPitch = ({ beats }: PieceNote, pitch: string): PieceNote => ({ pitch, beats });

// A stretch of the staff, starting on a beat counted from the start of the piece. It holds a note, the part of a
// too-long note that spills into the next bar, or nothing yet. None of them cross a bar line, so the bars stay put.
type Segment = { start: number; beats: number; noteIndex?: number; crossesBar?: boolean; spill?: boolean };

// A stretch's width, in beats. A long note pushes what follows along, but nothing gets less than a beat's room, so
// quick notes don't collide. Printed music spaces notes much the same way, which is why a bar's width can vary.
const widthOf = ({ beats }: Segment) => Math.max(beats, 1);

function drawSheet(container: HTMLDivElement, width: number, options: { clef?: boolean; note?: PieceNote; start?: number; beats?: number; beatWidth?: number }) {
  container.replaceChildren();
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, SHEET_HEIGHT);
  const context = renderer.getContext();
  const stave = new Stave(0, STAVE_Y, width);
  stave.setBegBarType(BarlineType.NONE);
  stave.setEndBarType(BarlineType.NONE);
  if (options.clef) stave.addClef("treble");
  stave.setContext(context).draw();
  const svg = container.querySelector("svg")!;
  svg.setAttribute("viewBox", `0 0 ${width} ${SHEET_HEIGHT}`);
  svg.style.width = `${width * SCALE}px`;
  svg.style.height = `${SHEET_HEIGHT * SCALE}px`;

  const addLine = (x: number, color: string) => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", String(TOP_LINE_Y));
    line.setAttribute("y2", String(BOTTOM_LINE_Y));
    line.setAttribute("stroke", color);
    svg.append(line);
  };
  const { start = 0, beats = 0, beatWidth = 0 } = options;
  // A faint line and a count for each beat. The bar line itself is drawn inside the end, where it isn't cut off.
  for (let beat = Math.ceil(start); beat < start + beats; beat++) {
    const x = (beat - start) * beatWidth;
    if (beat % BAR_BEATS !== 0) addLine(x, BEAT_LINE_COLOR);
    const number = document.createElementNS("http://www.w3.org/2000/svg", "text");
    number.textContent = String((beat % BAR_BEATS) + 1);
    number.setAttribute("x", String(x + 2));
    number.setAttribute("y", String(BEAT_NUMBER_Y));
    number.setAttribute("fill", BEAT_NUMBER_COLOR);
    number.setAttribute("stroke", "none");
    number.setAttribute("font-size", "9");
    number.setAttribute("font-family", "system-ui, sans-serif");
    svg.append(number);
  }
  if (beats && (start + beats) % BAR_BEATS === 0) addLine(width - 0.5, BAR_LINE_COLOR);

  if (options.note) {
    const note = toStaveNote(options.note, true);
    const voice = new Voice({ numBeats: options.note.beats!, beatValue: 4 }).addTickables([note]);
    new Formatter().joinVoices([voice]).format([voice], 0);
    note.setStave(stave);
    // The formatter pushes a note with a sharp or flat to the right, so this puts every notehead in the same place.
    stave.setNoteStartX(stave.getNoteStartX() + NOTEHEAD_LEFT - note.getAbsoluteX());
    voice.draw(context, stave);
  }
}

// The staff for writing a piece: a sheet of joined-up columns, one per note. A tap places the next note, which can be
// dragged up or down, and picks a note out for the note tools, docked under the staff.
export function createPieceEditor(startingNotes: PieceNote[], onChange: () => void) {
  let notes = startingNotes;
  let fitted = "";
  let beatPx = MAX_BEAT_PX;
  let segmentOf: Segment[] = [];
  let dragging = false;
  // The note picked out for the note tools, by its place in notes.
  let selected: number | null = null;
  // Each note's line on the sheet, for hearing the line it's on.
  let lineOf: number[][] = [];
  const rows = h("div", { className: "editor-rows" });
  const warning = h("p", { className: "warning" });
  const ghost = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  ghost.setAttribute("rx", "7");
  ghost.setAttribute("ry", "5");
  ghost.setAttribute("fill", GHOST_COLOR);
  ghost.setAttribute("opacity", "0.5");
  ghost.setAttribute("pointer-events", "none");

  const crossesBar = () => barMarks(notes).some((mark) => mark.crossesBar);
  const totalBeats = () => notes.reduce((sum, note) => sum + note.beats!, 0);
  // A new note or rest starts at 1 beat, or at what's left of the bar if that's less.
  const newBeats = () => Math.min(1, BAR_BEATS - (totalBeats() % BAR_BEATS));
  const beatWidth = () => beatPx / SCALE;

  // A beat is narrowed only as far as it takes to fit an evenly spaced bar on a small phone.
  function measure() {
    const room = (rows.clientWidth || contentWidth()) - CLEF_WIDTH * SCALE;
    const px = Math.min(MAX_BEAT_PX, Math.floor(room / BAR_BEATS / 2) * 2);
    return { beatPx: px, beatsPerRow: Math.max(BAR_BEATS, Math.floor(room / px)) };
  }

  const stepAt = (clientY: number, sheet: Element) => {
    const box = sheet.getBoundingClientRect();
    const y = ((clientY - box.top) * SHEET_HEIGHT) / box.height;
    return Math.max(LOWEST_STEP, Math.min(HIGHEST_STEP, Math.round((BOTTOM_LINE_Y - y) / STEP_HEIGHT)));
  };

  function change(update: () => void) {
    update();
    render();
    onChange();
  }

  function emptySheet(segment: Segment) {
    const sheet = h("div", { className: "editor-sheet" });
    drawSheet(sheet, widthOf(segment) * beatWidth(), { start: segment.start, beats: segment.beats, beatWidth: beatWidth() });
    return sheet;
  }

  function sized<Element extends HTMLElement>(element: Element, segment: Segment) {
    element.style.width = `${widthOf(segment) * beatPx}px`;
    return element;
  }

  // A rest can't be dragged up or down. The selected note is marked, for the note tools.
  function noteColumn(segment: Segment) {
    const index = segment.noteIndex!;
    const note = notes[index];
    const sheet = h("div", { className: "editor-sheet" });
    drawSheet(sheet, widthOf(segment) * beatWidth(), { note, start: segment.start, beats: segment.beats, beatWidth: beatWidth() });
    const column = h("div", { className: `editor-column${segment.crossesBar ? " crosses-bar" : ""}${note.pitch ? "" : " rest"}${index === selected ? " selected" : ""}` }, sheet);
    column.dataset.index = String(index);
    // Its name shows on hover.
    if (note.pitch) column.title = noteLabels(note.pitch).solfege;
    return sized(column, segment);
  }

  const blankColumn = (segment: Segment) => sized(h("div", { className: "editor-column blank" }, emptySheet(segment)), segment);

  const spillColumn = (segment: Segment) => sized(h("div", { className: "editor-column spill" }, emptySheet(segment)), segment);

  // Lays the notes along the bars, then fills out the last bar so there's always a place for the next note.
  function segments() {
    const list: Segment[] = [];
    let beat = 0;
    notes.forEach((note, noteIndex) => {
      const room = BAR_BEATS - (beat % BAR_BEATS);
      const crosses = note.beats! > room;
      list.push({ start: beat, beats: Math.min(note.beats!, room), noteIndex, crossesBar: crosses });
      if (crosses) list.push({ start: beat + room, beats: note.beats! - room, spill: true });
      beat += note.beats!;
    });
    // A bar that's exactly full leaves a whole fresh one here, so there's always somewhere for the next note.
    const room = BAR_BEATS - (beat % BAR_BEATS);
    list.push({ start: beat, beats: room });
    return list;
  }

  // Starts a row at a bar line, or inside a bar too wide for a row of its own, then fills the last row with empty bars.
  function toRows(list: Segment[], beatsPerRow: number) {
    const barOf = ({ start }: Segment) => Math.floor(start / BAR_BEATS);
    const rowList: Segment[][] = [[]];
    let used = 0;
    const startRow = () => {
      rowList.push([]);
      used = 0;
    };
    for (const segment of list) {
      if (segment.start % BAR_BEATS === 0) {
        const barWidth = list.filter((other) => barOf(other) === barOf(segment)).reduce((sum, other) => sum + widthOf(other), 0);
        if (used && used + barWidth > beatsPerRow) startRow();
      }
      if (used + widthOf(segment) > beatsPerRow) startRow();
      rowList.at(-1)!.push(segment);
      used += widthOf(segment);
    }
    const last = list.at(-1)!;
    for (let start = last.start + last.beats; used + BAR_BEATS <= beatsPerRow; start += BAR_BEATS, used += BAR_BEATS) {
      rowList.at(-1)!.push({ start, beats: BAR_BEATS });
    }
    return rowList;
  }

  // A line playing stops, as its notes may have changed.
  function render() {
    tools.stopPlaying();
    const measured = measure();
    beatPx = measured.beatPx;
    fitted = `${measured.beatPx}:${measured.beatsPerRow}`;
    const list = segments();
    segmentOf = [];
    for (const segment of list) if (segment.noteIndex !== undefined) segmentOf[segment.noteIndex] = segment;

    lineOf = [];
    rows.replaceChildren(
      ...toRows(list, measured.beatsPerRow).map((row) => {
        const clef = h("div", { className: "editor-sheet editor-clef" });
        drawSheet(clef, CLEF_WIDTH, { clef: true });
        const lineNotes = row.flatMap(({ noteIndex }) => (noteIndex === undefined ? [] : [noteIndex]));
        lineNotes.forEach((index) => (lineOf[index] = lineNotes));
        const columns = row.map((segment) => (segment.noteIndex !== undefined ? noteColumn(segment) : segment.spill ? spillColumn(segment) : blankColumn(segment)));
        return h("div", { className: "editor-row" }, clef, ...columns);
      }),
    );
    warning.textContent = crossesBar() ? t.crossesBar : "";
    tools.show();
  }

  // Follows the pointer until it's released, redrawing only the note being moved.
  function dragNote(index: number) {
    dragging = true;
    const move = (event: PointerEvent) => {
      const column = rows.querySelector(`[data-index="${index}"]`)!;
      const step = stepAt(event.clientY, column.querySelector(".editor-sheet")!);
      if (step === stepOf(notes[index].pitch!)) return;

      notes[index] = withPitch(notes[index], pitchAt(step));
      column.replaceWith(noteColumn(segmentOf[index]));
      tools.show();
    };
    const end = () => {
      dragging = false;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", end);
      removeEventListener("pointercancel", end);
      onChange();
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end);
    addEventListener("pointercancel", end);
  }

  const hideGhost = () => ghost.remove();

  rows.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    const sheet = target.closest(".editor-sheet:not(.editor-clef)");
    const column = sheet?.closest<HTMLElement>(".editor-column");
    if (!sheet || !column || column.classList.contains("spill") || target.closest("button")) return;

    const step = stepAt(event.clientY, sheet);
    event.preventDefault();
    // Redrawing a moved note replaces what's under the finger, which would otherwise end a touch drag.
    rows.setPointerCapture(event.pointerId);
    if (column.classList.contains("blank")) {
      hideGhost();
      notes.push({ pitch: pitchAt(step), beats: newBeats() });
      selected = notes.length - 1;
      render();
      onChange();
      dragNote(notes.length - 1);
    } else {
      const index = Number(column.dataset.index);
      const { pitch } = notes[index];
      if (selected !== index) {
        selected = index;
        render();
      }
      if (pitch && Math.abs(step - stepOf(pitch)) <= GRAB_STEPS) dragNote(index);
    }
  });

  // With a mouse, shows where a click would put the next note, whichever blank part of the staff it's over.
  rows.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || dragging) return;

    const over = (event.target as Element).closest(".editor-column.blank .editor-sheet");
    const next = rows.querySelector(".editor-column.blank");
    if (!over || !next || (event.target as Element).closest("button")) return hideGhost();

    const step = stepAt(event.clientY, over);
    ghost.setAttribute("cx", String(NOTEHEAD_CENTER));
    ghost.setAttribute("cy", String(BOTTOM_LINE_Y - step * STEP_HEIGHT));
    next.querySelector("svg")!.append(ghost);
  });
  rows.addEventListener("pointerleave", hideGhost);

  // Picks up the real width once on the page, and refits when the screen turns.
  new ResizeObserver(() => {
    const { beatPx: px, beatsPerRow } = measure();
    if (rows.clientWidth && `${px}:${beatsPerRow}` !== fitted) render();
  }).observe(rows);

  const tools = createNoteTools({
    notes: () => notes,
    selected: () => selected,
    startOf: (index) => segmentOf[index].start,
    line: (index) => lineOf[index].map((at) => notes[at]),
    change,
    // A note deleted takes the selection with it; a rest added is selected.
    remove: (index) => change(() => {
      notes.splice(index, 1);
      selected = null;
    }),
    addRest: () => change(() => {
      notes.push({ beats: newBeats() });
      selected = notes.length - 1;
    }),
  });
  render();

  return {
    element: h("div", { className: "piece-editor" }, rows, h("p", { className: "editor-hint" }, t.editorHint), warning),
    tools: tools.element,
    notes: () => notes,
    crossesBar,
    setNotes: (newNotes: PieceNote[]) => change(() => {
      notes = newNotes;
      selected = null;
    }),
    stopPlaying: tools.stopPlaying,
  };
}
