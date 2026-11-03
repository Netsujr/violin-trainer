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
const RING_GAP = 3;
const RING_CORNER = 11;
const SLIDE_RATE = 0.18;
const LOW_FINGER_COLOR = "#b03020";
const NAME_COLOR = "#6b3a1e";
const LETTER_COLOR = "#666";
const TILE_COLOR = "#f3ead9";
// Matches the palette in style.css.
const LANE_COLORS = ["#211c16", "#1b1712"];
const LANE_LABEL_COLOR = "#a39a8b";
const HIT_LINE_COLOR = "#e8e2d6";

export function createHighway() {
  const canvas = h("canvas", { width: WIDTH * devicePixelRatio, height: HEIGHT * devicePixelRatio });
  const context = canvas.getContext("2d")!;
  context.scale(devicePixelRatio, devicePixelRatio);
  let position = 0;

  function drawLanes() {
    LANES.forEach((lane, index) => {
      context.fillStyle = LANE_COLORS[index % 2];
      context.fillRect(0, index * LANE_HEIGHT, WIDTH, LANE_HEIGHT);
      context.fillStyle = LANE_LABEL_COLOR;
      context.font = "bold 18px system-ui";
      context.textAlign = "left";
      context.fillText(lane, 12, index * LANE_HEIGHT + LANE_HEIGHT / 2 + 6);
    });
    context.fillStyle = HIT_LINE_COLOR;
    context.fillRect(HIT_X - 1, 0, 2, HEIGHT);
  }

  const laneCenter = (note: PieceNote) => (LANES.indexOf(note.string!) + 0.5) * LANE_HEIGHT;

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

  function drawHoldRing(note: PieceNote, x: number, progress: number) {
    const width = TILE_WIDTH + RING_GAP * 2;
    const height = TILE_HEIGHT + RING_GAP * 2;
    const perimeter = 2 * (width + height);
    context.strokeStyle = "#4cd07d";
    context.lineWidth = 4;
    context.setLineDash([progress * perimeter, perimeter]);
    context.beginPath();
    context.roundRect(x - width / 2, laneCenter(note) - height / 2, width, height, RING_CORNER);
    context.stroke();
    context.setLineDash([]);
  }

  return {
    element: canvas,
    draw(notes: PieceNote[], index: number, holdProgress: number) {
      position += (index - position) * SLIDE_RATE;
      context.clearRect(0, 0, WIDTH, HEIGHT);
      drawLanes();
      notes.forEach((note, noteIndex) => {
        const x = HIT_X + (noteIndex - position) * SPACING;
        if (x < -TILE_WIDTH || x > WIDTH + TILE_WIDTH) return;

        drawTile(note, x);
        if (noteIndex === index && holdProgress > 0) drawHoldRing(note, x, holdProgress);
      });
    },
    jumpTo(index: number) {
      position = index;
    },
  };
}
