import type { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { getSettings } from "../../storage";
import type { createStaff } from "../staff";
import type { createTempoGlide } from "./tempoGlide";

type Deps = {
  judge: ReturnType<typeof createJudge>;
  glide: ReturnType<typeof createTempoGlide>;
  staff: ReturnType<typeof createStaff>;
  isMuted: (now: number) => boolean;
  endIndex: () => number;
  holdMs: () => number;
  // How far the current note has got towards counting, from 0 to 1.
  showProgress: (progress: number) => void;
  // Called after each note is hit, with the note before it when the bow needn't change to play the next.
  moveOn: (session: Session, previousMidi?: number) => void;
};

// The usual run: each note waits until it's played in tune for its hold time. With tempo on, a hit glides on to the next beat.
export function createWaitingRun({ judge, glide, staff, isMuted, endIndex, holdMs, showProgress, moveOn }: Deps) {
  const settings = getSettings();

  // A hit that waited for its beat lands on it.
  function arriveOnBeat(session: Session, { cents, at, arrivesAt }: { cents: number; at: number; arrivesAt: number }) {
    const previousMidi = session.currentMidi;
    const released = judge.released;
    session.hit(cents, at, arrivesAt);
    moveOn(session, released ? undefined : previousMidi);
  }

  return {
    // Judges what the mic hears now.
    read(session: Session, frequency: number | null, now: number) {
      const arrived = glide.arrived(now);
      if (arrived) arriveOnBeat(session, arrived);
      const verdict = judge.update(isMuted(now) ? null : frequency, now);
      showProgress(glide.pending ? 1 : verdict.progress);
      staff.showPlayed(session.index, verdict.cents, verdict.inTune);
      if (verdict.hit && !glide.pending) {
        if (settings.tempoOn && session.index < endIndex() - 1) {
          glide.glide(session, verdict.averageCents, now, holdMs());
        } else {
          const previousMidi = session.currentMidi;
          session.hit(verdict.averageCents, now);
          moveOn(session, previousMidi);
        }
      }
    },
  };
}
