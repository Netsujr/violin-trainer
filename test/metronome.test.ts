import { beforeEach, describe, expect, it, vi } from "vitest";

type Click = { hz: number; at: number };
const clicks: Click[] = [];
const audio = { outputLatency: 0 };

class FakeAudioContext {
  currentTime = 0;
  state = "running";
  destination = {};
  get outputLatency() {
    return audio.outputLatency;
  }
  createOscillator() {
    const oscillator = {
      frequency: { value: 0 },
      connect: (target: unknown) => target,
      start: (at: number) => clicks.push({ hz: oscillator.frequency.value, at }),
      stop() {},
    };
    return oscillator;
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (target: unknown) => target,
    };
  }
}

vi.stubGlobal("AudioContext", FakeAudioContext);
const { createMetronome } = await import("../src/audio/metronome");

// Steps through a mic loop's frames, from one time to another.
function run(metronome: ReturnType<typeof createMetronome>, from: number, to: number, bpm: number) {
  for (let now = from; now < to; now += 16) metronome.tick(now, bpm);
}

describe("metronome", () => {
  beforeEach(() => {
    clicks.length = 0;
    audio.outputLatency = 0;
  });

  it("gives audio time to start before the first click", () => {
    const metronome = createMetronome();
    run(metronome, 1000, 1300, 60);
    expect(clicks).toHaveLength(0);
    run(metronome, 1300, 1450, 60);
    expect(clicks).toHaveLength(1);
  });

  it("clicks once a beat, with an accent every four", () => {
    const metronome = createMetronome();
    run(metronome, 0, 8500, 60);
    expect(clicks).toHaveLength(9);
    expect(clicks.map((click) => click.hz)).toEqual([3200, 2500, 2500, 2500, 3200, 2500, 2500, 2500, 3200]);
  });

  it("keeps its clicks above what the detector listens to", () => {
    const metronome = createMetronome();
    run(metronome, 0, 3000, 60);
    expect(clicks.every((click) => click.hz > 2000)).toBe(true);
  });

  it("follows a change of tempo", () => {
    const metronome = createMetronome();
    run(metronome, 0, 2000, 60);
    const before = clicks.length;
    run(metronome, 2000, 4000, 120);
    expect(clicks.length - before).toBe(4);
  });

  it("finds the nearest beat, once it has one", () => {
    const metronome = createMetronome();
    expect(metronome.nearestBeat(1000, 60)).toBeNull();
    metronome.tick(0, 60);
    run(metronome, 0, 500, 60);
    expect(metronome.nearestBeat(1400, 60)).toBe(1500);
    expect(metronome.nearestBeat(1000, 120)).toBe(1000);
  });

  it("schedules further ahead on a slow audio device", () => {
    audio.outputLatency = 0.3;
    const metronome = createMetronome();
    // The first click is 500 ms away. Without latency it would wait until 100 ms before that, at 400.
    run(metronome, 0, 90, 60);
    expect(clicks).toHaveLength(0);
    run(metronome, 90, 150, 60);
    expect(clicks).toHaveLength(1);
  });

  it("starts over after a reset", () => {
    const metronome = createMetronome();
    run(metronome, 0, 2000, 60);
    metronome.reset();
    clicks.length = 0;
    expect(metronome.nearestBeat(2000, 60)).toBeNull();
    run(metronome, 5000, 5500, 60);
    expect(clicks[0].hz).toBe(3200);
  });
});
