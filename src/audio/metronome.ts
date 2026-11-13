import { COMMON_TIME, type Meter } from "../music/notes";
import { sharedAudioContext } from "./reference";

// Above the detector's 2000 Hz ceiling, so a click the mic hears reads as no note rather than a wrong one.
const CLICK_HZ = 2500;
const ACCENT_HZ = 3200;
const CLICK_MS = 20;
const CLICK_VOLUME = 0.5;
const SCHEDULE_AHEAD_MS = 100;
// Long enough for a new audio context to start, so the first click isn't late.
export const FIRST_CLICK_DELAY_MS = 500;

const outputLatencyMs = () => (sharedAudioContext().outputLatency || 0) * 1000;

function playClick(atMs: number, accent: boolean) {
  const context = sharedAudioContext();
  // Sent early by the output latency, so the sound reaches the speakers on the beat rather than leaving for them then.
  const startsAt = context.currentTime + Math.max(0, (atMs - performance.now() - outputLatencyMs()) / 1000);
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = accent ? ACCENT_HZ : CLICK_HZ;
  gain.gain.setValueAtTime(CLICK_VOLUME, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startsAt + CLICK_MS / 1000);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + CLICK_MS / 1000);
}

export function createMetronome() {
  let nextClick: number | null = null;
  let lastClick: number | null = null;
  let count = 0;
  let meter = COMMON_TIME;

  return {
    // The piece's bars: each one's first beat gets the accent.
    get meter() {
      return meter;
    },
    set meter(next: Meter) {
      meter = next;
    },
    // Runs on Practice's own timer while it's switched on, run or no run.
    tick(now: number, bpm: number) {
      if (nextClick === null || nextClick < now) nextClick = now + FIRST_CLICK_DELAY_MS;
      while (nextClick - now < SCHEDULE_AHEAD_MS + outputLatencyMs()) {
        playClick(nextClick, count % meter.beatsPerBar === 0);
        lastClick = nextClick;
        nextClick += 60000 / bpm;
        count++;
      }
    },
    // leadBeats is how many clicks come before the first note, which is the one that gets the accent.
    // firstClickAt, if given, is when the first click is due, instead of a short delay from the next tick.
    reset(leadBeats = 0, firstClickAt: number | null = null) {
      nextClick = firstClickAt;
      lastClick = null;
      count = (meter.beatsPerBar - (leadBeats % meter.beatsPerBar)) % meter.beatsPerBar;
    },
    // When the next click is due, if it's ticking.
    get nextClick() {
      return nextClick !== null && nextClick > performance.now() ? nextClick : null;
    },
    nearestBeat(time: number, bpm: number) {
      // Before the first click is scheduled, the time it's due still sets the beat.
      const reference = lastClick ?? nextClick;
      if (reference === null) return null;

      const beatMs = 60000 / bpm;
      return reference + Math.round((time - reference) / beatMs) * beatMs;
    },
  };
}
