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
const SPACING = 120;
const TILE_WIDTH = 92;
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

export function createHighway(onPick: (noteIndex: number) => void) {
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
      onscroll: paint,
      onclick(event) {
        const noteIndex = noteAt(event);
        if (noteIndex !== null) onPick(noteIndex);
      },
      onpointermove(event) {
        scroller.style.cursor = noteAt(event) === null ? "" : "pointer";
      },
      onkeydown(event) {
        if (event.key === "Enter") onPick(Math.min(Math.round(position()), notes.length - 1));
      },
    },
    track,
  );
  let notes: PieceNote[] = [];
  let currentIndex = 0;
  let holdProgress = 0;

  const pixelsPerNote = () => (SPACING * (scroller.clientWidth || WIDTH)) / WIDTH;
  const position = () => scroller.scrollLeft / pixelsPerNote();
  const tileX = (noteIndex: number) => HIT_X + (noteIndex - position()) * SPACING;
  const laneCenter = (note: PieceNote) => (LANES.indexOf(note.string!) + 0.5) * LANE_HEIGHT;

  function noteAt(event: MouseEvent) {
    const box = canvas.getBoundingClientRect();
    const x = ((event.clientX - box.left) * WIDTH) / box.width;
    const y = ((event.clientY - box.top) * HEIGHT) / box.height;
    const noteIndex = Math.round(position() + (x - HIT_X) / SPACING);
    const note = notes[noteIndex];
    if (!note) return null;

    const overTile = Math.abs(tileX(noteIndex) - x) <= TILE_WIDTH / 2 && Math.abs(laneCenter(note) - y) <= TILE_HEIGHT / 2;
    return overTile ? noteIndex : null;
  }

  function drawLanes() {
    LANES.forEach((lane, index) => {
      context.fillStyle = LANE_COLORS[index % 2];
      context.fillRect(0, index * LANE_HEIGHT, WIDTH, LANE_HEIGHT);
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
    context.fillStyle = TILE_COLOR;
    context.beginPath();
    context.roundRect(x - TILE_WIDTH / 2, y - TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT, 8);
    context.fill();
    context.textAlign = "center";

    const { solfege, letter } = noteLabels(note.pitch);
    if (toggles.fingers) {
      context.fillStyle = note.finger?.startsWith("L") ? LOW_FINGER_COLOR : "#111";
      context.font = "bold 22px system-ui";
      context.fillText(note.finger?.replace("L", "") ?? "?", x, y - 12);
    }
    if (toggles.noteNames) {
      context.fillStyle = NAME_COLOR;
      context.font = "bold 16px system-ui";
      context.fillText(solfege, x, y + 10);
    }
    if (toggles.letterNames) {
      context.fillStyle = LETTER_COLOR;
      context.font = "12px system-ui";
      context.fillText(letter, x, y + 27);
    }
  }

  function outlineTile(note: PieceNote, x: number, color: string, portion = 1) {
    const width = TILE_WIDTH + OUTLINE_GAP * 2;
    const height = TILE_HEIGHT + OUTLINE_GAP * 2;
    const perimeter = 2 * (width + height);
    context.strokeStyle = color;
    context.lineWidth = 4;
    context.setLineDash([portion * perimeter, perimeter]);
    context.beginPath();
    context.roundRect(x - width / 2, laneCenter(note) - height / 2, width, height, OUTLINE_CORNER);
    context.stroke();
    context.setLineDash([]);
  }

  function paint() {
    context.clearRect(0, 0, WIDTH, HEIGHT);
    drawLanes();
    notes.forEach((note, noteIndex) => {
      const x = tileX(noteIndex);
      if (x < -TILE_WIDTH || x > WIDTH + TILE_WIDTH) return;

      drawTile(note, x);
      if (noteIndex !== currentIndex) return;

      outlineTile(note, x, CURRENT_COLOR);
      if (holdProgress > 0) outlineTile(note, x, HOLD_COLOR, holdProgress);
    });
  }

  return {
    element: h("div", { className: "highway" }, canvas, scroller),
    draw(pieceNotes: PieceNote[], index: number, progress: number) {
      notes = pieceNotes;
      holdProgress = progress;
      track.style.width = `${100 + (notes.length * SPACING * 100) / WIDTH}%`;
      if (index !== currentIndex) {
        currentIndex = index;
        scroller.scrollTo({ left: index * pixelsPerNote(), behavior: "smooth" });
      }
      paint();
    },
    jumpTo(index: number) {
      currentIndex = index;
      scroller.scrollLeft = index * pixelsPerNote();
    },
  };
}
