import { describe, expect, it } from "vitest";
import { detectTempo } from "../src/audio/tempo";

const RATE = 22050;

// A click on every beat, from the first one on, over a quiet hum, with a long held note in the middle to get in the way.
function clickTrack(bpm: number, firstBeat: number, seconds = 20) {
  const samples = new Float32Array(RATE * seconds);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.01 * Math.sin((2 * Math.PI * 110 * i) / RATE);
  for (let i = RATE * 8; i < RATE * 11; i++) samples[i] += 0.2 * Math.sin((2 * Math.PI * 440 * i) / RATE);
  for (let beat = firstBeat; beat < seconds; beat += 60 / bpm) {
    const start = Math.round(beat * RATE);
    for (let i = 0; i < RATE * 0.03 && start + i < samples.length; i++) {
      samples[start + i] += 0.8 * Math.exp(-i / (RATE * 0.008)) * Math.sin((2 * Math.PI * 1500 * i) / RATE);
    }
  }
  return samples;
}

describe("tempo detection", () => {
  it.each([
    [100, 1.3],
    [72, 0.5],
    [150, 2],
  ])("finds %s BPM with the first beat at %s s", (bpm, firstBeat) => {
    const found = detectTempo(clickTrack(bpm, firstBeat), RATE);
    expect(Math.abs(found.bpm - bpm)).toBeLessThan(0.6);
    expect(Math.abs(found.offset - firstBeat)).toBeLessThan(0.03);
  });

  it("doesn't fall over on silence", () => {
    const found = detectTempo(new Float32Array(RATE * 3), RATE);
    expect(found.bpm).toBeGreaterThanOrEqual(55);
    expect(found.bpm).toBeLessThanOrEqual(190);
    expect(found.offset).toBeGreaterThanOrEqual(0);
  });
});
