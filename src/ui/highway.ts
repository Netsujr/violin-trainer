import { t } from "../i18n";
import type { PieceNote, StringName } from "../music/notes";
import { noteLabels } from "../music/notes";
import { getSettings } from "../storage";
import { h } from "./dom";

const LANES: StringName[] = ["E", "A", "D", "G"];
const WIDTH = 960;
const LANE_HEIGHT = 84;
const HEIGHT = LANE_HEIGHT * LANES.length;
const HIT_X = 130;
const BEAT_WIDTH = 120;
const BAR_BEATS = 4;
const TILE_GAP = 8;
const TILE_HEIGHT = 74;
const OUTLINE_GAP = 3;
const OUTLINE_CORNER = 11;
const LOW_FINGER_COLOR = "#b03020";
const NAME_COLOR = "#6b3a1e";
const LETTER_COLOR = "#666";
const TILE_COLOR = "#f3ead9";
const CURRENT_COLOR = "#ff9500";
const HOLD_COLOR = "#4cd07d";
// Matches the palette in style.css.
const LANE_COLORS = ["#211c16", "#1b1712"];
const LANE_LABEL_COLOR = "#a39a8b";
const HIT_LINE_COLOR = "#e8e2d6";
const BEAT_LINE_COLOR = "#3a3228";
const BAR_LINE_COLOR = "#5a4e42";

const tileWidth = (note: PieceNote) => (note.beats ?? 1) * BEAT_WIDTH - TILE_GAP;

export function createHighway(onPick: (noteIndex: number) => void, onMove: (beat: number) => void) {
  const canvas = h("canvas", { width: WIDTH * devicePixelRatio, height: HEIGHT * devicePixelRatio });
  const context = canvas.getContext("2d")!;
  context.scale(devicePixelRatio, devicePixelRatio);
  const track = h("div");
  // The canvas stays put. This clear layer on top scrolls natively, and the canvas repaints to match it.
  const scroller = h(
    "div",
    {
      className: "highway-scroll",
      tabIndex: 0,
      role: "region",
      ariaLabel: t.timelineLabel,
      onscroll() {
        paint();
        onMove(position());
      },
      onclick(event) {
        const noteIndex = noteAt(event);
        if (noteIndex !== null) onPick(noteIndex);
      },
      onpointermove(event) {
        scroller.style.cursor = noteAt(event) === null ? "" : "pointer";
      },
      onkeydown(event) {
        // A little past the line, so a view that rounded just short of a note still picks it.
        if (event.key === "Enter") onPick(Math.min(noteAtBeat(position() + 0.02), notes.length - 1));
      },
    },
    track,
  );
  let notes: PieceNote[] = [];
  // The beat each note starts on, then the total, so index notes.length is the end of the piece.
  let starts = [0];
  let currentIndex = 0;
  let holdProgress = 0;
  let glideFrame = 0;

  const pixelsPerBeat = () => (BEAT_WIDTH * (scroller.clientWidth || WIDTH)) / WIDTH;
  const position = () => scroller.scrollLeft / pixelsPerBeat();
  const scrollLeftOf = (index: number) => starts[index] * pixelsPerBeat();
  const tileX = (noteIndex: number) => HIT_X + (starts[noteIndex] - position()) * BEAT_WIDTH + TILE_GAP / 2;
  const laneCenter = (note: PieceNote) => (LANES.indexOf(note.string!) + 0.5) * LANE_HEIGHT;
  const noteAtBeat = (beat: number) => starts.findLastIndex((start) => start <= beat);

  function noteAt(event: MouseEvent) {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) * WIDTH) / box.width;
    const y = ((event.clientY - box.top) * HEIGHT) / box.height;
    const noteIndex = noteAtBeat(position() + (x - HIT_X) / BEAT_WIDTH);
    const note = notes[noteIndex];
    if (!note) return null;

    return Math.abs(laneCenter(note) - y) <= TILE_HEIGHT / 2 ? noteIndex : null;
  }

  function drawGrid() {
    if (!getSettings().toggles.grid) return;

    const at = position();
    const first = Math.max(0, Math.ceil(at - HIT_X / BEAT_WIDTH));
    const last = Math.min(starts.at(-1)!, Math.floor(at + (WIDTH - HIT_X) / BEAT_WIDTH));
    for (let beat = first; beat <= last; beat++) {
      context.fillStyle = notes[0]?.beats && beat % BAR_BEATS === 0 ? BAR_LINE_COLOR : BEAT_LINE_COLOR;
      context.fillRect(HIT_X + (beat - at) * BEAT_WIDTH, 0, 1, HEIGHT);
    }
  }

  function drawLanes() {
    LANES.forEach((_, index) => {
      context.fillStyle = LANE_COLORS[index % 2];
      context.fillRect(0, index * LANE_HEIGHT, WIDTH, LANE_HEIGHT);
    });
    drawGrid();
    LANES.forEach((lane, index) => {
      context.fillStyle = LANE_LABEL_COLOR;
      context.font = "bold 18px system-ui";
      context.textAlign = "left";
      context.fillText(t.strings[lane], 12, index * LANE_HEIGHT + LANE_HEIGHT / 2 + 6);
    });
    context.fillStyle = HIT_LINE_COLOR;
    context.fillRect(HIT_X - 1, 0, 2, HEIGHT);
  }

  function drawTile(note: PieceNote, x: number) {
    const { toggles } = getSettings();
    const y = laneCenter(note);
    const width = tileWidth(note);
    context.fillStyle = TILE_COLOR;
    context.beginPath();
    context.roundRect(x, y - TILE_HEIGHT / 2, width, TILE_HEIGHT, 8);
    context.fill();
    context.textAlign = "center";

    // Labels stay at the front of a long tile, the end that reaches the hit line first.
    const textX = x + Math.min(width, BEAT_WIDTH - TILE_GAP) / 2;
    const { solfege, letter } = noteLabels(note.pitch);
    if (toggles.fingers) {
      context.fillStyle = note.finger?.startsWith("L") ? LOW_FINGER_COLOR : "#111";
      context.font = "bold 22px system-ui";
      context.fillText(note.finger?.replace("L", "") ?? "?", textX, y - 12);
    }
    if (toggles.noteNames) {
      context.fillStyle = NAME_COLOR;
      context.font = "bold 16px system-ui";
      context.fillText(solfege, textX, y + 10);
    }
    if (toggles.letterNames) {
      context.fillStyle = LETTER_COLOR;
      context.font = "12px system-ui";
      context.fillText(letter, textX, y + 27);
    }
  }

  function outlineTile(note: PieceNote, x: number, color: string, portion = 1) {
    const width = tileWidth(note) + OUTLINE_GAP * 2;
    const height = TILE_HEIGHT + OUTLINE_GAP * 2;
    const perimeter = 2 * (width + height);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.setLineDash([portion * perimeter, perimeter]);
    context.beginPath();
    context.roundRect(x - OUTLINE_GAP, laneCenter(note) - height / 2, width, height, OUTLINE_CORNER);
    context.stroke();
    context.setLineDash([]);
  }

  function paint() {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    drawLanes();
    notes.forEach((note, noteIndex) => {
      const x = tileX(noteIndex);
      if (x + tileWidth(note) < 0 || x > WIDTH) return;

      drawTile(note, x);
      if (noteIndex !== currentIndex) return;

      outlineTile(note, x, CURRENT_COLOR);
      if (holdProgress > 0) outlineTile(note, x, HOLD_COLOR, holdProgress);
    });
  }

  return {
    element: h("div", { className: "highway" }, canvas, scroller),
    draw(pieceNotes: PieceNote[], index: number, progress: number) {
      if (pieceNotes !== notes) {
        notes = pieceNotes;
        starts = [0];
        for (const note of notes) starts.push(starts.at(-1)! + (note.beats ?? 1));
        track.style.width = `${100 + (starts.at(-1)! * BEAT_WIDTH * 100) / WIDTH}%`;
      }
      holdProgress = progress;
      if (index !== currentIndex) {
        currentIndex = index;
        scroller.scrollTo({ left: scrollLeftOf(index), behavior: "smooth" });
      }
      paint();
    },
    glideTo(index: number, ms: number) {
      const from = scroller.scrollLeft;
      const to = scrollLeftOf(index);
      const startedAt = performance.now();
      const step = () => {
        const progress = Math.min(1, (performance.now() - startedAt) / ms);
        scroller.scrollLeft = from + (to - from) * progress * progress * (3 - 2 * progress);
        if (progress < 1) glideFrame = requestAnimationFrame(step);
      };
      cancelAnimationFrame(glideFrame);
      glideFrame = requestAnimationFrame(step);
    },
    jumpTo(index: number) {
      cancelAnimationFrame(glideFrame);
      currentIndex = index;
      scroller.scrollLeft = scrollLeftOf(index);
    },
  };
}
