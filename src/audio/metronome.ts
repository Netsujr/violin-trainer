import { sharedAudioContext } from "./reference";

const BEATS_PER_BAR = 4;
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
  if (context.state === "suspended") context.resume();
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

  return {
    // Runs from the mic loop, so clicks stop by themselves when a session ends.
    tick(now: number, bpm: number) {
      if (nextClick === null || nextClick < now) {
        sharedAudioContext();
        nextClick = now + FIRST_CLICK_DELAY_MS;
      }
      while (nextClick - now < SCHEDULE_AHEAD_MS + outputLatencyMs()) {
        playClick(nextClick, count % BEATS_PER_BAR === 0);
        lastClick = nextClick;
        nextClick += 60000 / bpm;
        count++;
      }
    },
    // leadBeats is how many clicks come before the first note, which is the one that gets the accent.
    reset(leadBeats = 0) {
      nextClick = lastClick = null;
      count = (BEATS_PER_BAR - (leadBeats % BEATS_PER_BAR)) % BEATS_PER_BAR;
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
