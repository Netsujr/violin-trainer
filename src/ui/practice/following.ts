import type { createMetronome } from "../../audio/metronome";
import type { PieceNote } from "../../music/notes";
import { createFollow } from "../../practice/follow";
import { centsToTarget } from "../../practice/judge";
import type { Session } from "../../practice/session";
import { getSettings } from "../../storage";
import type { createHighway } from "../highway";
import type { createStaff } from "../staff";
import { beatMs, MIC_DELAY_MS } from "./timing";

type Deps = {
  metronome: ReturnType<typeof createMetronome>;
  highway: ReturnType<typeof createHighway>;
  staff: ReturnType<typeof createStaff>;
  showReading: (cents: number | null, frequency: number | null) => void;
  isMuted: (now: number) => boolean;
  endIndex: () => number;
  // Called after each note is judged, hit or missed.
  moveOn: (session: Session) => void;
};

// "Don't wait": the lanes hold on the first note until it's played in tune, then keep moving at the BPM,
// judging each note as it passes.
export function createFollowing({ metronome, highway, staff, showReading, isMuted, endIndex, moveOn }: Deps) {
  const settings = getSettings();
  // The clock the lanes move to, in beats. Until the first note is played in tune, waiting holds when it came in tune.
  let state: {
    tracker: ReturnType<typeof createFollow>;
    beat: number;
    at: number;
    results: Map<number, boolean>;
    waiting: { inTuneSince: number | null } | null;
  } | null = null;

  // Once the first note has been in tune for the hold time, the lanes start as if it began when it came in tune.
  function waitForFirstNote(session: Session, frequency: number | null, now: number) {
    const current = state!;
    const waiting = current.waiting!;
    const cents = frequency === null || isMuted(now) ? null : centsToTarget(frequency, session.currentMidi);
    const inTune = cents !== null && Math.abs(cents) <= settings.toleranceCents;
    waiting.inTuneSince = inTune ? (waiting.inTuneSince ?? now) : null;
    showReading(cents, frequency);
    staff.showPlayed(session.index, cents, inTune);
    if (waiting.inTuneSince === null || now - waiting.inTuneSince < settings.holdMs) return;

    current.waiting = null;
    current.at = now;
    current.beat = current.tracker.startBeat + (now - waiting.inTuneSince) / beatMs();
    // The metronome joins on the next whole beat, accenting each bar's first.
    const nextBeat = Math.ceil(current.beat);
    metronome.reset(4 - (nextBeat % 4), now + (nextBeat - current.beat) * beatMs());
  }

  return {
    get active() {
      return state !== null;
    },
    get waiting() {
      return Boolean(state?.waiting);
    },
    // Each judged note so far, by index: hit or missed.
    get results() {
      return state?.results ?? null;
    },
    start(notes: PieceNote[], index: number) {
      const tracker = createFollow(notes, index, () => settings.toleranceCents, endIndex());
      state = { tracker, beat: tracker.startBeat, at: performance.now(), results: new Map(), waiting: { inTuneSince: null } };
      metronome.reset();
      highway.showResults(state.results);
      highway.jumpTo(index);
    },
    stop() {
      state = null;
      highway.showResults(null);
    },
    // Moves the lanes on to now, judging any note they've passed. Returns the current note's progress, while they're moving.
    read(session: Session, frequency: number | null, now: number) {
      const current = state!;
      if (current.waiting) {
        waitForFirstNote(session, frequency, now);
        return null;
      }
      const stepBeats = (now - current.at) / beatMs();
      current.at = now;
      current.beat += stepBeats;
      const heard = isMuted(now) ? null : frequency;
      // What the mic hears now was played a moment ago.
      const micBeat = current.beat - MIC_DELAY_MS / beatMs();
      for (const { index, hit, cents } of current.tracker.update(heard, micBeat, stepBeats)) {
        current.results.set(index, hit);
        if (hit) {
          const startedAt = now - MIC_DELAY_MS - (micBeat - current.tracker.starts[index]) * beatMs();
          // A recording's marker sits one hold time before this, which puts it where the note starts.
          session.hit(cents, startedAt + settings.holdMs, now);
        } else session.miss(now);
        moveOn(session);
      }
      // Looping has already started the next time round.
      if (state !== current) return null;

      highway.moveToBeat(Math.max(current.tracker.startBeat, Math.min(current.beat, current.tracker.starts[endIndex()])));
      if (session.finished) return null;

      const cents = frequency === null ? null : centsToTarget(frequency, session.currentMidi);
      showReading(cents, frequency);
      const played = heard === null || current.beat < current.tracker.startBeat ? null : cents;
      staff.showPlayed(session.index, played, played !== null && Math.abs(played) <= settings.toleranceCents);
      return current.tracker.progress;
    },
  };
}
