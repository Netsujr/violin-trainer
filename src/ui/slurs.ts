import type { RenderContext } from "vexflow/bravura";

// How high a slur arches over its ends, and how thick it is in the middle.
const LIFT = 7;
const THICKNESS = 3;

// Slurs joining the notes played in one bow, as arcs with their ends at height y over the notes at xs: from a note
// marked slurred to the first after it that isn't. A slur carrying on to the next line ends at this line's last note.
export function drawSlurs(context: RenderContext, slurred: boolean[], xs: number[], y: number) {
  const slur = (from: number, to: number) => {
    const [left, right] = [xs[from], xs[to]];
    const bend = (right - left) / 4;
    context.openGroup("slur");
    context.beginPath();
    context.moveTo(left, y);
    context.bezierCurveTo(left + bend, y - LIFT, right - bend, y - LIFT, right, y);
    context.bezierCurveTo(right - bend, y - LIFT - THICKNESS, left + bend, y - LIFT - THICKNESS, left, y);
    context.closePath();
    context.fill();
    context.closeGroup();
  };
  let first: number | null = null;
  slurred.forEach((joined, index) => {
    if (joined) first ??= index;
    else if (first !== null) {
      slur(first, index);
      first = null;
    }
  });
  if (first !== null && first < xs.length - 1) slur(first, xs.length - 1);
}
