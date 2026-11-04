import { frequencyOf } from "../music/notes";

const VOLUME = 0.3;
const FADE_SECONDS = 0.02;

let context: AudioContext | undefined;

export const sharedAudioContext = () => (context ??= new AudioContext());

// A steady tone that sounds until it's stopped, with short fades so it doesn't click.
export function startReference(midi: number) {
  const context = sharedAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequencyOf(midi);
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(VOLUME, context.currentTime + FADE_SECONDS);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();

  return {
    setNote(next: number) {
      oscillator.frequency.value = frequencyOf(next);
    },
    stop() {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_SECONDS);
      oscillator.stop(context.currentTime + FADE_SECONDS);
    },
  };
}
