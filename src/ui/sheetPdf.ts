import { Renderer, Stave } from "vexflow/bravura";
import type { PieceNote } from "../music/notes";
import { pdfFromJpegs } from "../pdf";
import { drawLine, LINE_HEIGHT, openLines, type StaffLabels } from "./staff";

// A4, in PDF points. Each point gets 4 pixels, which is about 290 dots per inch: sharp on paper, and under a megabyte.
const PAGE = { width: 595, height: 842 };
const PIXELS_PER_POINT = 4;
const PIXELS = { width: PAGE.width * PIXELS_PER_POINT, height: PAGE.height * PIXELS_PER_POINT };
const MARGIN = 40;
// The sheet's own units, the same as the Practice staff's. This width fits about four bars of quarter notes on a line.
const SHEET_WIDTH = 700;
const POINTS_PER_UNIT = (PAGE.width - 2 * MARGIN) / SHEET_WIDTH;
const TITLE_Y = 24;
const LINES_TOP = 44;
// Paper has the room to set each line, with its fingers and names, clearly apart from the next.
const LINE_SPACING = LINE_HEIGHT + 24;
const LINES_PER_PAGE = Math.floor(((PAGE.height - 2 * MARGIN) / POINTS_PER_UNIT - LINES_TOP) / LINE_SPACING);

function drawPage(title: string, lines: ReturnType<typeof openLines>, labels: StaffLabels) {
  const canvas = document.createElement("canvas");
  canvas.width = PIXELS.width;
  canvas.height = PIXELS.height;
  const context = new Renderer(canvas, Renderer.Backends.CANVAS).getContext();
  const canvas2d = canvas.getContext("2d")!;
  canvas2d.fillStyle = "#fff"; // A JPEG has no transparency, and a clear canvas would turn out black.
  canvas2d.fillRect(0, 0, PIXELS.width, PIXELS.height);
  canvas2d.fillStyle = "#000";
  canvas2d.scale(PIXELS_PER_POINT, PIXELS_PER_POINT);
  canvas2d.translate(MARGIN, MARGIN);
  canvas2d.scale(POINTS_PER_UNIT, POINTS_PER_UNIT);

  const writeText = (text: string, x: number, y: number, fill: string, fontSize: number, align: CanvasTextAlign = "center") => {
    canvas2d.save();
    canvas2d.font = `700 ${fontSize}px system-ui, sans-serif`;
    canvas2d.textAlign = align;
    canvas2d.fillStyle = fill;
    canvas2d.fillText(text, x, y);
    canvas2d.restore();
  };
  writeText(title, 0, TITLE_Y, "#000", 24, "left");
  lines.forEach(({ line, formatWidth }, index) => {
    const stave = new Stave(0, LINES_TOP + index * LINE_SPACING, SHEET_WIDTH - 1).addClef("treble");
    drawLine(context, stave, line, formatWidth, labels, writeText);
  });

  const encoded = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
  return Uint8Array.from(encoded, (character) => character.charCodeAt(0));
}

export function downloadSheet(title: string, notes: PieceNote[], labels: StaffLabels) {
  const lines = openLines(notes, SHEET_WIDTH);
  const pages = [];
  for (let first = 0; first < lines.length; first += LINES_PER_PAGE) {
    pages.push(drawPage(title, lines.slice(first, first + LINES_PER_PAGE), labels));
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(pdfFromJpegs(pages, PIXELS, PAGE));
  link.download = `${title}.pdf`;
  link.click();
  // Not straight away: Safari is still reading the file after the click returns.
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
