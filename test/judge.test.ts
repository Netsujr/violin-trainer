import { describe, expect, it } from "vitest";
import { frequencyOf, midiOf } from "../src/music/notes";
import { createJudge } from "../src/practice/judge";

const FRAME_MS = 16;
const A4 = midiOf("A4");
const inTune = frequencyOf(A4);

function stream(judge: ReturnType<typeof createJudge>, start: number, durationMs: number, frequency: number | null) {
  let hit = false;
  let now = start;
  for (; now < start + durationMs; now += FRAME_MS) hit = judge.update(frequency, now).hit || hit;
  return { hit, now };
}

const newJudge = (target = A4, previous?: number) => {
  const judge = createJudge({ toleranceCents: 40, holdMs: 200 });
  judge.setTarget(target, previous);
  return judge;
};

describe("judge", () => {
  it("reports when a note has stopped sounding, which tempo mode needs for repeated notes", () => {
    const judge = newJudge(A4, A4);
    expect(judge.released).toBe(false);
    stream(judge, 0, 200, inTune);
    expect(judge.released).toBe(false);
    stream(judge, 200, 100, null);
    expect(judge.released).toBe(true);
  });

  it("reads its hold time live, so a pattern note can have its own", () => {
    const options = { toleranceCents: 40, holdMs: 200 };
    const judge = createJudge(options);
    judge.setTarget(A4);
    options.holdMs = 1000;
    expect(stream(judge, 0, 500, inTune).hit).toBe(false);
    expect(stream(judge, 500, 600, inTune).hit).toBe(true);
  });

  it("hits only after the hold time", () => {
    expect(stream(newJudge(), 0, 150, inTune).hit).toBe(false);
    expect(stream(newJudge(), 0, 220, inTune).hit).toBe(true);
  });

  it("never hits on a wrong note", () => {
    expect(stream(newJudge(), 0, 2000, frequencyOf(A4 + 1)).hit).toBe(false);
  });

  it("respects the tolerance", () => {
    expect(stream(newJudge(), 0, 400, inTune * 2 ** (35 / 1200)).hit).toBe(true);
    expect(stream(newJudge(), 0, 400, inTune * 2 ** (45 / 1200)).hit).toBe(false);
  });

  it("keeps the hold through a gap under 60 ms", () => {
    const judge = newJudge();
    const first = stream(judge, 0, 120, inTune);
    const gap = stream(judge, first.now, 40, null);
    expect(stream(judge, gap.now, 50, inTune).hit).toBe(true);
  });

  it("resets the hold after a gap of 60 ms or more", () => {
    const judge = newJudge();
    const first = stream(judge, 0, 150, inTune);
    const gap = stream(judge, first.now, 80, null);
    expect(stream(judge, gap.now, 100, inTune).hit).toBe(false);
  });

  it("counts a reading exactly an octave off as the target", () => {
    expect(stream(newJudge(), 0, 220, inTune * 2).hit).toBe(true);
    expect(stream(newJudge(), 0, 220, inTune / 2).hit).toBe(true);
  });

  it("does not count two octaves off", () => {
    expect(stream(newJudge(), 0, 400, inTune * 4).hit).toBe(false);
  });

  it("does not count an octave plus a semitone", () => {
    expect(stream(newJudge(), 0, 400, frequencyOf(A4 + 13)).hit).toBe(false);
  });

  it("makes a repeated note wait for a release", () => {
    const judge = newJudge(A4, A4);
    const held = stream(judge, 0, 1000, inTune);
    expect(held.hit).toBe(false);
    const quiet = stream(judge, held.now, 40, null);
    const tooShort = stream(judge, quiet.now, 400, inTune);
    expect(tooShort.hit).toBe(false);
    const released = stream(judge, tooShort.now, 80, null);
    expect(stream(judge, released.now, 220, inTune).hit).toBe(true);
  });

  it("accepts leaving the pitch as a release", () => {
    const judge = newJudge(A4, A4);
    const off = stream(judge, 0, 80, frequencyOf(A4 + 2));
    expect(stream(judge, off.now, 220, inTune).hit).toBe(true);
  });

  it("makes a note an octave from the last one wait for a release too", () => {
    const judge = newJudge(A4 + 12, A4);
    expect(stream(judge, 0, 1000, inTune).hit).toBe(false);
  });

  it("reports the average cents of the hold", () => {
    const judge = newJudge();
    const frequency = inTune * 2 ** (10 / 1200);
    let verdict = judge.update(frequency, 0);
    for (let now = FRAME_MS; !verdict.hit; now += FRAME_MS) verdict = judge.update(frequency, now);
    expect(verdict.averageCents).toBeCloseTo(10, 5);
  });
});
