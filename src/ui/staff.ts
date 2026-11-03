import { Note } from "tonal";
import { Accidental, BarNote, Beam, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow/bravura";
import { h } from "./dom";

export type StaffNote = { pitch: string; beats?: number };

const TOP = 30;
const LINE_HEIGHT = 130;
const CLEF_SPACE = 60;
const NOTE_WIDTH = 56;
// Rhythm patterns are drawn in bars, packed tighter because they hold more notes.
const BAR_BEATS = 4;
const BAR_NOTE_WIDTH = 40;
const MAX_BARS_PER_LINE = 6;
const DURATIONS: Record<number, string> = { 0.5: "8", 1: "q", 2: "h", 4: "w" };
// Collapsed, the first notehead lands under the timeline's hit line, 130 of its 960 width, with room for the clef.
const COLLAPSED_NOTE_START = 118;
const COLLAPSED_MARGIN = 16;
const HIT_LINE_SHARE = 130 / 960;
const COLLAPSED_BEAT_WIDTH = 72;

function toStaveNote({ pitch, beats = 1 }: StaffNote, showAccidental: boolean) {
  const { letter, acc, oct } = Note.get(pitch);
  const note = new StaveNote({ keys: [`${letter.toLowerCase()}${acc}/${oct}`], duration: DURATIONS[beats], autoStem: true });
  if (acc && showAccidental) note.addModifier(new Accidental(acc));
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

export function createStaff(width = 300, startCollapsed = false) {
  const element = h("div", { className: "staff" });
  let collapsed = startCollapsed;
  let shown: string | null = null;
  // Where each note starts, in beats and in pixels on the collapsed line.
  let noteBeats: number[] = [];
  let noteXs: number[] = [];
  let followedBeat = 0;

  function render(notes: StaffNote[]) {
    element.replaceChildren();
    element.classList.toggle("collapsed", collapsed);
    const room = width - CLEF_SPACE;
    const barred = notes.some((note) => note.beats);
    const lines = collapsed ? [barred ? toBars(notes) : [notes]] : layOut(notes, room, barred);
    const totalBeats = notes.reduce((sum, note) => sum + beatsOf(note), 0);
    // Collapsed, there is a screen of empty staff after the last note, so it can still reach the hit line.
    const fullWidth = collapsed ? COLLAPSED_NOTE_START + totalBeats * COLLAPSED_BEAT_WIDTH + width : width;
    const height = TOP + lines.length * LINE_HEIGHT;
    const renderer = new Renderer(element, Renderer.Backends.SVG);
    renderer.resize(fullWidth, height);
    const context = renderer.getContext();
    const svg = element.querySelector("svg")!;
    svg.setAttribute("viewBox", `0 0 ${fullWidth} ${height}`);
    if (!collapsed) {
      // Scale with the page instead of VexFlow's fixed pixel size.
      svg.style.width = "100%";
      svg.style.height = "auto";
    }

    const allNotes: StaveNote[] = [];
    lines.forEach((line, lineIndex) => {
      const staveX = collapsed ? COLLAPSED_MARGIN : 0;
      const stave = new Stave(staveX, TOP + lineIndex * LINE_HEIGHT, fullWidth - staveX - 1).addClef("treble");
      if (collapsed) stave.setNoteStartX(COLLAPSED_NOTE_START);
      stave.setContext(context).draw();
      const lineNotes = line.flat();
      if (lineNotes.length === 0) return;

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
      const barredWidth = ((room - 20) * line.length) / lines[0].length;
      const formatWidth = collapsed ? lineBeats * COLLAPSED_BEAT_WIDTH : barred ? barredWidth : lineNotes.length * NOTE_WIDTH;
      new Formatter().joinVoices([voice]).format([voice], formatWidth);
      voice.draw(context, stave);
      beams.forEach((beam) => beam.setContext(context).draw());
    });

    noteXs = allNotes.map((note) => note.getAbsoluteX());
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
    element.scrollLeft = noteXs[index] + between * (nextX - noteXs[index]) - element.clientWidth * HIT_LINE_SHARE;
  }

  return {
    element,
    draw(notes: StaffNote[], current = 0) {
      const key = notes.map((note) => `${note.pitch}:${note.beats}`).join();
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
    // Keeps the collapsed line in step with the timeline, beat for beat.
    follow(beat: number) {
      followedBeat = beat;
      scrollToBeat();
    },
  };
}
