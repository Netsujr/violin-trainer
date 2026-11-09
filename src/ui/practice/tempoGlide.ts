import type { createMetronome } from "../../audio/metronome";
import type { createJudge } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { getSettings } from "../../storage";
import type { createHighway } from "../highway";
import { beatMs } from "./timing";

// A hit closer to the beat than this waits for the following beat, so the glide never looks rushed.
const MIN_GLIDE_BEATS = 0.1;

type Hit = { cents: number; at: number; arrivesAt: number };

// With tempo on, a hit waits for the next beat while the timeline glides there.
// A hit lands one hold time after the bow starts, so the first note's start sets the beat, not its hit.
export function createTempoGlide(
  metronome: ReturnType<typeof createMetronome>,
  judge: ReturnType<typeof createJudge>,
  highway: ReturnType<typeof createHighway>,
) {
  const settings = getSettings();
  let pending: Hit | null = null;
  let lastBeat: number | null = null;

  return {
    get pending() {
      return pending !== null;
    },
    // Forgets the beat, so the next hit sets a new one.
    resetBeat() {
      lastBeat = null;
    },
    glide(session: Session, cents: number, now: number, holdMs: number) {
      const noteMs = (session.current.beats ?? 1) * beatMs();
      const gridMs = Math.min(noteMs, beatMs());
      // With the metronome on, the first note joins its beat instead of setting one.
      const attack = now - holdMs;
      const clickBeat = settings.metronomeOn ? metronome.nearestBeat(attack, settings.bpm) : null;
      const due = (lastBeat ?? clickBeat ?? attack) + noteMs;
      lastBeat = due + Math.max(0, Math.ceil((now + MIN_GLIDE_BEATS * gridMs - due) / gridMs)) * gridMs;
      pending = { cents, at: now, arrivesAt: lastBeat };
      judge.setTarget(session.currentMidi, session.currentMidi);
      highway.glideTo(session.index + 1, lastBeat - now);
    },
    // The waiting hit, once its beat has come.
    arrived(now: number) {
      if (!pending || now < pending.arrivesAt) return null;

      const hit = pending;
      pending = null;
      return hit;
    },
    // Drops a waiting hit, and says whether there was one.
    cancel() {
      const had = pending !== null;
      pending = null;
      return had;
    },
  };
}
