import { describe, expect, it } from "vitest";
import { frequencyOf, midiOf, type PieceNote } from "../src/music/notes";
import { noteChanges, scoreLongBow, scoreSlurs, type TechniqueReading } from "../src/practice/technique";

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
    expect(score(play(() => ({ cents: 0, rms: 0.1 })))).toEqual({ pitchSpread: 0, steadiness: 100, held: 4, beats: 4 });
  });

  it("measures how far the pitch wanders, leaving out each note's attack", () => {
    const wobbling = play((beat) => ({ cents: beat % 2 < 0.1 ? 80 : 10 * Math.sin(beat * 2 * Math.PI * 3), rms: 0.1 }));
    expect(score(wobbling).pitchSpread).toBe(7);
  });

  it("measures how evenly loud it stays", () => {
    const pulsing = play((beat) => ({ cents: 0, rms: Math.round(beat * 60) % 2 ? 0.2 : 0.1 }));
    expect(score(pulsing).steadiness).toBe(67);
  });

  it("counts a beat with the sound gone for half of it as not held", () => {
    const stopping = play((beat) => (beat >= 2.5 && beat < 3 ? null : { cents: 0, rms: 0.1 }));
    expect(score(stopping)).toMatchObject({ held: 3, beats: 4 });
  });

  it("has nothing to say about pitch or loudness when nothing is heard", () => {
    expect(score(play(() => null))).toEqual({ pitchSpread: null, steadiness: null, held: 0, beats: 4 });
  });
});

describe("slurs", () => {
  // Two notes to a bow, a beat each: A and B in a down bow, then C sharp and D in an up bow.
  const SLURS = ["A4", "B4", "C#5", "D5"].map((pitch) => ({ pitch, beats: 1 }));
  const options = { beatMs: BEAT_MS, minRms: MIN_RMS, toleranceCents: 40, holdMs: 200 };
  const score = (at: Parameters<typeof play>[0]) => scoreSlurs(SLURS, 2, play(at, SLURS), options);
  const steady = { cents: 0, rms: 0.1 };

  it("scores slurs played in tune, smoothly and held as perfect", () => {
    expect(score(() => steady)).toEqual({ inTune: 4, notes: 4, smooth: 2, bows: 2, held: 4, beats: 4 });
  });

  it("counts a dip between the notes of one bow as a break in its slur", () => {
    expect(score((beat) => (beat > 0.9 && beat < 1.1 ? { cents: 0, rms: 0.01 } : steady)).smooth).toBe(1);
  });

  it("doesn't count the dip of a bow change against either bow", () => {
    expect(score((beat) => (beat > 1.92 && beat < 2.08 ? null : steady)).smooth).toBe(2);
  });

  it("counts a note out of tune, or not held in tune long enough", () => {
    expect(score((beat) => (beat >= 2 && beat < 3 ? { cents: -50, rms: 0.1 } : steady)).inTune).toBe(3);
    expect(score((beat) => (beat >= 3 && (beat * 60) % 6 < 1 ? { cents: 60, rms: 0.1 } : steady)).inTune).toBe(3);
  });

  it("doesn't call a silent bow smooth", () => {
    expect(score((beat) => (beat < 2 ? null : steady))).toMatchObject({ smooth: 1, held: 2 });
  });
});

describe("note changes", () => {
  const TWO: PieceNote[] = [
    { pitch: "A4", beats: 1 },
    { pitch: "B4", beats: 1 },
  ];
  // What's heard at each reading, from the sound at each beat: a pitch at a loudness, or silence with null.
  const hear = (beats: number, at: (beat: number) => { pitch: string; rms: number } | null): TechniqueReading[] =>
    Array.from({ length: beats * 60 }, (_, index) => {
      const beat = index / 60;
      const sound = at(beat);
      return sound ? { beat, frequency: frequencyOf(midiOf(sound.pitch)), rms: sound.rms } : { beat, frequency: null, rms: 0 };
    });
  // A bow change, a moment's silence at beat 1, with the finger reaching B4 at fingerAt.
  const bowChange = (fingerAt: number) => hear(2, (beat) => (Math.abs(beat - 1) < 0.03 ? null : { pitch: beat < fingerAt ? "A4" : "B4", rms: 0.1 }));
  const timed = (readings: TechniqueReading[], notes: PieceNote[] = TWO, perBow = 1) => noteChanges(notes, perBow, readings, { beatMs: BEAT_MS, toleranceCents: 40 });

  it("finds a late finger as the old note sounding on the new bow, and where it sounded", () => {
    const [change] = timed(bowChange(1.15));
    expect(change.lift).toBe(false);
    expect(change.ms).toBeGreaterThan(100);
    expect(change.ms).toBeLessThan(140);
    expect(change.wrong![0]).toBeGreaterThan(1);
  });

  it("finds an early finger as the new note sounding on the old bow", () => {
    const [change] = timed(bowChange(0.85));
    expect(change.ms).toBeLessThan(-120);
    expect(change.ms).toBeGreaterThan(-150);
    expect(change.wrong![1]).toBeLessThan(1);
  });

  it("calls a finger down by the bow change clean", () => {
    expect(timed(bowChange(1))).toEqual([{ lift: false, ms: 0, wrong: null }]);
  });

  it("times a change inside a slur against its beat, and knows a finger lifting", () => {
    const [change] = timed(hear(2, (beat) => ({ pitch: beat < 1.1 ? "B4" : "A4", rms: 0.1 })), TWO.toReversed(), 2);
    expect(change.lift).toBe(true);
    expect(change.ms).toBeGreaterThan(90);
    expect(change.ms).toBeLessThan(110);
  });

  it("finds a late finger after a pause, and says when the new note never came", () => {
    const paused = [TWO[0], { beats: 1 }, TWO[1]];
    const [late] = timed(hear(3, (beat) => (beat >= 1 && beat < 2 ? null : { pitch: beat < 2.1 ? "A4" : "B4", rms: 0.1 })), paused);
    expect(late.ms).toBeGreaterThan(90);
    expect(late.ms).toBeLessThan(110);
    expect(timed(hear(2, () => ({ pitch: "A4", rms: 0.1 })))).toEqual([{ lift: false, ms: null, wrong: null }]);
  });
});
