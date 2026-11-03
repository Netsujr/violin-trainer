import { writeFileSync } from "node:fs";
const RATE = 48000;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const saw = (p) => 2 * (p - Math.floor(p + 0.5));
export function wav(path, segments) {
  const total = segments.reduce((s, x) => s + Math.round(x.seconds * RATE), 0);
  const data = Buffer.alloc(total * 2);
  let i = 0, phase = 0;
  for (const seg of segments) {
    const n = Math.round(seg.seconds * RATE);
    for (let k = 0; k < n; k++) {
      let v = 0;
      if (seg.hz) { phase += seg.hz / RATE; v = (seg.wave === "sine" ? Math.sin(2 * Math.PI * phase) : saw(phase)) * 0.3; }
      data.writeInt16LE(Math.round(v * 32767), i * 2); i++;
    }
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
export const note = (m, seconds = 0.6) => ({ hz: midiHz(m), seconds });
export const rest = (seconds = 0.15) => ({ seconds });
