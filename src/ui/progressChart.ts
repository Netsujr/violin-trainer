import { h } from "./dom";

const HEIGHT = 96;
const PAD = { left: 40, right: 44, top: 10, bottom: 20 };
const SVG = "http://www.w3.org/2000/svg";

type Point = { label: string; value: number | null };
type Options = { title: string; min: number; max: number; format: (value: number) => string };

function svg<Tag extends keyof SVGElementTagNameMap>(tag: Tag, attributes: Record<string, string | number>, ...children: Node[]) {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  element.append(...children);
  return element;
}

const title = (text: string) => svg("title", {}, document.createTextNode(text));
const text = (content: string, attributes: Record<string, string | number>) => svg("text", { class: "chart-text", ...attributes }, document.createTextNode(content));

// One measure over the days, as a line with a dot a day, its first and last day under it, and its last value at the end.
// Days are spaced evenly, by practice day. A day with no value breaks the line. Each dot names its day and value on hover.
export function lineChart(points: Point[], { title: name, min, max, format }: Options) {
  const known = points.filter((point): point is { label: string; value: number } => point.value !== null);
  const figure = h("figure", { className: "progress-chart" }, h("figcaption", {}, name));
  figure.role = "img";
  figure.ariaLabel = known.length ? `${name}: ${known.map((point) => `${point.label} ${format(point.value)}`).join(", ")}` : name;
  let drawnWidth = 0;

  function draw(width: number) {
    if (width === drawnWidth || width <= PAD.left + PAD.right) return;
    drawnWidth = width;
    const plotWidth = width - PAD.left - PAD.right;
    const x = (index: number) => PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => PAD.top + (1 - (value - min) / (max - min || 1)) * (HEIGHT - PAD.top - PAD.bottom);
    const grid = [min, max].map((value) =>
      svg("g", {}, svg("line", { class: "chart-grid", x1: PAD.left, x2: width - PAD.right, y1: y(value), y2: y(value) }), text(format(value), { x: PAD.left - 6, y: y(value) + 4, "text-anchor": "end" })),
    );
    // The line, in pieces between days with no value.
    let path = "";
    points.forEach((point, index) => {
      if (point.value === null) return;
      path += `${index > 0 && points[index - 1].value !== null ? "L" : "M"}${x(index)},${y(point.value)}`;
    });
    const dots = points.flatMap((point, index) =>
      point.value === null
        ? []
        : [svg("g", {}, svg("circle", { class: "chart-dot", cx: x(index), cy: y(point.value), r: 4 }), svg("circle", { class: "chart-hit", cx: x(index), cy: y(point.value), r: 12 }, title(`${point.label}: ${format(point.value)}`)))],
    );
    const last = known.at(-1);
    const lastIndex = last ? points.lastIndexOf(last) : 0;
    figure.querySelector("svg")?.remove();
    figure.append(
      svg(
        "svg",
        { width, height: HEIGHT, viewBox: `0 0 ${width} ${HEIGHT}`, "aria-hidden": "true" },
        ...grid,
        svg("path", { class: "chart-line", d: path }),
        ...dots,
        text(points[0].label, { x: x(0), y: HEIGHT - 4, "text-anchor": points.length === 1 ? "middle" : "start" }),
        ...(points.length > 1 ? [text(points.at(-1)!.label, { x: x(points.length - 1), y: HEIGHT - 4, "text-anchor": "end" })] : []),
        ...(last ? [text(format(last.value), { class: "chart-text chart-value", x: x(lastIndex) + 10, y: y(last.value) + 4 })] : []),
      ),
    );
  }

  new ResizeObserver(([entry]) => draw(Math.floor(entry.contentRect.width))).observe(figure);
  return figure;
}
