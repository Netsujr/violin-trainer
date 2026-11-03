import { centsFrom } from "../music/notes";

const GAP_GRACE_MS = 60;
const RELEASE_MS = 60;

const centsToTarget = (frequency: number, target: number) =>
  [target, target - 12, target + 12]
    .map((midi) => centsFrom(frequency, midi))
    .reduce((closest, cents) => (Math.abs(cents) < Math.abs(closest) ? cents : closest));

const soundsLikeSameNote = (midi: number, other: number) => midi === other || Math.abs(midi - other) === 12;

export type Verdict = { cents: number | null; inTune: boolean; progress: number; hit: boolean; averageCents: number };

export function createJudge(options: { toleranceCents: number; holdMs: number }) {
  let target = 0;
  let needsRelease = false;
  let releaseStart: number | null = null;
  let holdStart: number | null = null;
  let lastInTune = 0;
  let heldCents: number[] = [];

  const resetHold = () => {
    holdStart = null;
    heldCents = [];
  };

  return {
    setTarget(midi: number, previous?: number) {
      target = midi;
      needsRelease = previous !== undefined && soundsLikeSameNote(midi, previous);
      releaseStart = null;
      resetHold();
    },

    // After setTarget(midi, midi), this turns true once that note has stopped sounding.
    get released() {
      return !needsRelease;
    },

    update(frequency: number | null, now: number): Verdict {
      const cents = frequency === null ? null : centsToTarget(frequency, target);
      const inTune = cents !== null && Math.abs(cents) <= options.toleranceCents;
      const verdict = (progress: number, hit = false, averageCents = 0): Verdict => ({
        cents,
        inTune,
        progress,
        hit,
        averageCents,
      });

      if (needsRelease) {
        releaseStart = inTune ? null : (releaseStart ?? now);
        needsRelease = releaseStart === null || now - releaseStart < RELEASE_MS;
        return verdict(0);
      }

      if (inTune) {
        holdStart ??= now;
        lastInTune = now;
        heldCents.push(Math.abs(cents));
        const progress = Math.min(1, (now - holdStart) / options.holdMs);
        const average = heldCents.reduce((sum, value) => sum + value, 0) / heldCents.length;
        return verdict(progress, progress === 1, average);
      }

      if (holdStart !== null && now - lastInTune >= GAP_GRACE_MS) resetHold();

      return verdict(holdStart === null ? 0 : Math.min(1, (now - holdStart) / options.holdMs));
    },
  };
}
