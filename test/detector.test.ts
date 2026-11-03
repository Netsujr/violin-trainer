import { describe, expect, it } from "vitest";
import { createDetector } from "../src/audio/detector";

const SAMPLE_RATE = 48000;
const FRAME_SIZE = 2048;
const MIN_RMS = 0.01;

const sine = (phase: number) => Math.sin(2 * Math.PI * phase);
const sawtooth = (phase: number) => 2 * (phase - Math.floor(phase + 0.5));

const tone = (wave: (phase: number) => number, frequency: number, amplitude = 0.5, offset = 0) =>
  Float32Array.from({ length: FRAME_SIZE }, (_, sample) => amplitude * wave((frequency * (sample + offset)) / SAMPLE_RATE));

function detect(wave: (phase: number) => number, frequency: number, amplitude = 0.5) {
  const read = createDetector(FRAME_SIZE, SAMPLE_RATE);
  let result: number | null = null;
  for (let frame = 0; frame < 5; frame++) result = read(tone(wave, frequency, amplitude, frame * 800), MIN_RMS);
  return result;
}

const centsOff = (detected: number, frequency: number) => Math.abs(1200 * Math.log2(detected / frequency));

const FIRST_POSITION = [196, 220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77];

describe("detector", () => {
  it("reads A440 within 1 Hz", () => {
    expect(Math.abs(detect(sine, 440)! - 440)).toBeLessThan(1);
    expect(Math.abs(detect(sawtooth, 440)! - 440)).toBeLessThan(1);
  });

  it.each(FIRST_POSITION)("reads a %f Hz sine within 5 cents", (frequency) => {
    expect(centsOff(detect(sine, frequency)!, frequency)).toBeLessThan(5);
  });

  it.each(FIRST_POSITION)("reads a %f Hz sawtooth within 5 cents, overtones included", (frequency) => {
    expect(centsOff(detect(sawtooth, frequency)!, frequency)).toBeLessThan(5);
  });

  it("ignores silence and quiet room noise", () => {
    const read = createDetector(FRAME_SIZE, SAMPLE_RATE);
    expect(read(new Float32Array(FRAME_SIZE), MIN_RMS)).toBeNull();
    expect(read(tone(sine, 440, 0.005), MIN_RMS)).toBeNull();
  });

  it("rejects noise as unclear", () => {
    const read = createDetector(FRAME_SIZE, SAMPLE_RATE);
    const noise = Float32Array.from({ length: FRAME_SIZE }, () => Math.random() - 0.5);
    expect(read(noise, MIN_RMS)).toBeNull();
  });

  it("rejects pitches below the frequency range", () => {
    expect(detect(sine, 120)).toBeNull();
  });

  it("smooths a lone wrong reading away", () => {
    const read = createDetector(FRAME_SIZE, SAMPLE_RATE);
    for (let frame = 0; frame < 4; frame++) read(tone(sine, 440, 0.5, frame * 800), MIN_RMS);
    const result = read(tone(sine, 880), MIN_RMS)!;
    expect(Math.abs(result - 440)).toBeLessThan(1);
  });
});
