const SVG = "http://www.w3.org/2000/svg";
// Each point is the middle of this many readings in a row, so a single stray one doesn't spike the line.
const MEDIAN_OF = 3;

type Reading = { beat: number; frequency: number };
type Place = (beat: number, frequency: number) => { x: number; y: number; line: number } | null;

const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

// The pitch played, drawn through the staff as it's played, like karaoke: right with the beat, up and down with the
// pitch, crossing the middle of a notehead when in tune. Silence breaks it, and so do a rest and going on to the sheet's next line.
// place says where a reading goes on the sheet as it's drawn now.
export function createTrace(place: Place) {
  let readings: (Reading | null)[] = [];
  let recent: number[] = [];
  let group: SVGGElement | null = null;
  let segment: { line: SVGPolylineElement; sheetLine: number } | null = null;
  // Stretches of beats picked out under the line, as a highlighter would.
  let marks: [from: number, to: number][] = [];

  function drawMark([from, to]: [number, number]) {
    const points = readings.flatMap((reading) => (reading && reading.beat >= from && reading.beat <= to ? (place(reading.beat, reading.frequency) ?? []) : []));
    if (!group || points.length < 2) return;
    const mark = document.createElementNS(SVG, "polyline");
    mark.classList.add("mark");
    mark.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
    group.prepend(mark);
  }

  function draw(reading: Reading | null) {
    const point = group && reading && place(reading.beat, reading.frequency);
    if (!group || !point) {
      segment = null;
      return null;
    }
    if (segment?.sheetLine !== point.line) {
      segment = { line: document.createElementNS(SVG, "polyline"), sheetLine: point.line };
      group.append(segment.line);
    }
    const svgPoint = group.ownerSVGElement!.createSVGPoint();
    Object.assign(svgPoint, { x: point.x, y: point.y });
    segment.line.points.appendItem(svgPoint);
    return point;
  }

  return {
    // What's heard at a beat, or silence with null. Returns where it's drawn, if it is.
    add(beat: number, frequency: number | null) {
      if (frequency === null) {
        recent = [];
        if (readings.length && readings.at(-1) !== null) readings.push(null);
        return draw(null);
      }
      recent = [...recent.slice(1 - MEDIAN_OF), frequency];
      const reading = { beat, frequency: median(recent) };
      readings.push(reading);
      return draw(reading);
    },
    // Draws it all again on a sheet that's just been drawn.
    redraw(svg: SVGSVGElement) {
      group = document.createElementNS(SVG, "g");
      group.classList.add("pitch-trace");
      svg.append(group);
      segment = null;
      readings.forEach(draw);
      marks.forEach(drawMark);
    },
    // Picks out the line from one beat to another.
    mark(from: number, to: number) {
      marks.push([from, to]);
      drawMark([from, to]);
    },
    clear() {
      readings = [];
      recent = [];
      marks = [];
      segment = null;
      group?.replaceChildren();
    },
  };
}
