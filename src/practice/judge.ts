import { centsFrom } from "../music/notes";

const GAP_GRACE_MS = 60;
const RELEASE_MS = 60;
// Further off than this, it's nearer the next note than the one being played, so it's a wrong note, not an out-of-tune one.
export const NEAR_CENTS = 50;

export const centsToTarget = (frequency: number, target: number) =>
  [target, target - 12, target + 12]
    .map((midi) => centsFrom(frequency, midi))
    .reduce((closest, cents) => (Math.abs(cents) < Math.abs(closest) ? cents : closest));

const soundsLikeSameNote = (midi: number, other: number) => midi === other || Math.abs(midi - other) === 12;

// slid: the finger landed off the note, so being in tune now doesn't count until it's placed again.
type Verdict = { cents: number | null; inTune: boolean; progress: number; hit: boolean; averageCents: number; slid: boolean };

export function createJudge(options: { toleranceCents: number; holdMs: number }) {
  let target = 0;
  let needsRelease = false;
  let releaseStart: number | null = null;
  let holdStart: number | null = null;
  let lastInTune = 0;
  let heldCents: number[] = [];
  // Whether the finger landed on the note in tune, from the first reading near it, or null until it's placed. Sliding
  // into tune doesn't count, so the finger learns where to land: the note waits until the bow stops or the finger lifts,
  // and it's placed again.
  let landed: boolean | null = null;
  let lastNear = 0;

  const resetHold = () => {
    holdStart = null;
    heldCents = [];
  };

  return {
    setTarget(midi: number, previous?: number) {
      target = midi;
      needsRelease = previous !== undefined && soundsLikeSameNote(midi, previous);
      releaseStart = null;
      landed = null;
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
        slid: landed === false,
      });

      if (needsRelease) {
        releaseStart = inTune ? null : (releaseStart ?? now);
        needsRelease = releaseStart === null || now - releaseStart < RELEASE_MS;
        return verdict(0);
      }

      if (cents !== null && Math.abs(cents) <= NEAR_CENTS) {
        landed ??= inTune;
        lastNear = now;
      } else if (now - lastNear >= GAP_GRACE_MS) landed = null;

      if (inTune && landed) {
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
