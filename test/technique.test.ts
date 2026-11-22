import { describe, expect, it } from "vitest";
import { frequencyOf, midiOf } from "../src/music/notes";
import { holdAfter, scoreLongBow, scoreSlurs, SLIP_MS, type TechniqueReading } from "../src/practice/technique";

// At 60 BPM a beat is a second, and the mic reads 60 times a second.
const BEAT_MS = 1000;
const NOTES = [
  { pitch: "A4", beats: 2 },
  { pitch: "B4", beats: 2 },
];
const MIN_RMS = 0.01;

// Readings across all four beats, from what's played at each beat: cents off the note, and loudness, or null for silence.
function play(at: (beat: number) => { cents: number; rms: number } | null, notes = NOTES): TechniqueReading[] {
  return Array.from({ length: 240 }, (_, index) => {
    const beat = index / 60;
    const note = notes[Math.floor(beat / notes[0].beats)];
    const sound = at(beat);
    return sound ? { beat, frequency: frequencyOf(midiOf(note.pitch)) * 2 ** (sound.cents / 1200), rms: sound.rms } : { beat, frequency: null, rms: 0 };
  });
}

const score = (readings: TechniqueReading[]) => scoreLongBow(NOTES, readings, { beatMs: BEAT_MS, minRms: MIN_RMS });

describe("long bow", () => {
  it("scores a steady, even bow held throughout as perfect", () => {
    expect(score(play(() => ({ cents: 0, rms: 0.1 })))).toEqual({ pitchSpread: 0, steadiness: 100 });
  });

  it("measures how far the pitch wanders, leaving out each note's attack", () => {
    const wobbling = play((beat) => ({ cents: beat % 2 < 0.1 ? 80 : 10 * Math.sin(beat * 2 * Math.PI * 3), rms: 0.1 }));
    expect(score(wobbling).pitchSpread).toBe(7);
  });

  it("measures how evenly loud it stays", () => {
    const pulsing = play((beat) => ({ cents: 0, rms: Math.round(beat * 60) % 2 ? 0.2 : 0.1 }));
    expect(score(pulsing).steadiness).toBe(67);
  });

  it("has nothing to say about pitch or loudness when nothing is heard", () => {
    expect(score(play(() => null))).toEqual({ pitchSpread: null, steadiness: null });
  });
});

describe("slurs", () => {
  // Two notes to a bow, a beat each: A and B in a down bow, then C sharp and D in an up bow.
  const SLURS = ["A4", "B4", "C#5", "D5"].map((pitch) => ({ pitch, beats: 1 }));
  const options = { beatMs: BEAT_MS, minRms: MIN_RMS };
  const score = (at: Parameters<typeof play>[0]) => scoreSlurs(SLURS, 2, play(at, SLURS), options);
  const steady = { cents: 0, rms: 0.1 };

  it("scores slurs played smoothly as perfect", () => {
    expect(score(() => steady)).toEqual({ smooth: 2, bows: 2 });
  });

  it("counts a dip between the notes of one bow as a break in its slur", () => {
    expect(score((beat) => (beat > 0.9 && beat < 1.1 ? { cents: 0, rms: 0.01 } : steady)).smooth).toBe(1);
  });

  it("doesn't count the dip of a bow change against either bow", () => {
    expect(score((beat) => (beat > 1.92 && beat < 2.08 ? null : steady)).smooth).toBe(2);
  });

  it("doesn't call a silent bow smooth", () => {
    expect(score((beat) => (beat < 2 ? null : steady)).smooth).toBe(1);
  });
});

describe("holding a note", () => {
  // Readings every 10 ms, in tune or not, from a fresh hold; the ms held at the end.
  const held = (inTune: (ms: number) => boolean, ms: number) => {
    let hold = { ms: 0, outSince: null as number | null, at: 0 };
    for (let now = 10; now <= ms; now += 10) hold = holdAfter(hold, inTune(now), now);
    return hold.ms;
  };

  it("counts the time in tune", () => {
    expect(held(() => true, 1000)).toBe(1000);
  });

  it("forgives a short slip, counting neither the slip nor the reading that ends it", () => {
    expect(held((now) => now <= 400 || now > 500, 1000)).toBe(890);
  });

  it("starts again after a slip longer than SLIP_MS", () => {
    expect(held((now) => now <= 400 || now > 400 + SLIP_MS + 100, 1000)).toBe(1000 - (400 + SLIP_MS + 100) - 10);
  });
});
