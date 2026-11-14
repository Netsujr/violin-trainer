import { h } from "./dom";

// About five seconds, at the mic's 60 readings a second.
const READINGS = 300;
// The loudest reading shown sits this far below the top, so a steady bow draws a flat line near it.
const HEADROOM = 1.15;

// How loud the playing is, as a line moving left as it's played, over a faint line at the mic's gate: below that,
// nothing counts as played. It's scaled to the loudest reading shown, so evenness shows whatever the volume.
export function createVolumeCurve() {
  const canvas = h("canvas", { className: "volume-curve", ariaHidden: "true" });
  const levels: number[] = [];
  let color = "";

  function draw(gate: number) {
    const ratio = devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height });

    const context = canvas.getContext("2d")!;
    color ||= getComputedStyle(canvas).color;
    const top = Math.max(gate * 2, ...levels) * HEADROOM;
    const y = (level: number) => height - (Math.min(level, top) / top) * height;
    const x = (index: number) => width - (levels.length - 1 - index) * (width / (READINGS - 1));
    context.clearRect(0, 0, width, height);
    context.strokeStyle = color;
    context.lineWidth = ratio;
    context.globalAlpha = 0.35;
    context.beginPath();
    context.moveTo(0, y(gate));
    context.lineTo(width, y(gate));
    context.stroke();
    context.lineWidth = 2 * ratio;
    context.globalAlpha = 1;
    context.beginPath();
    levels.forEach((level, index) => (index ? context.lineTo(x(index), y(level)) : context.moveTo(x(index), y(level))));
    context.stroke();
  }

  return {
    element: canvas,
    // Each reading's loudness, and the gate it's measured against.
    add(rms: number, gate: number) {
      levels.push(rms);
      if (levels.length > READINGS) levels.shift();
      draw(gate);
    },
    clear() {
      levels.length = 0;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
