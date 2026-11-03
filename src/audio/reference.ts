import { frequencyOf } from "../music/notes";

export const REFERENCE_MS = 1000;

let context: AudioContext | undefined;

export function playReference(midi: number) {
  context ??= new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const seconds = REFERENCE_MS / 1000;
  oscillator.type = "triangle";
  oscillator.frequency.value = frequencyOf(midi);
  gain.gain.setValueAtTime(0.3, context.currentTime);
  gain.gain.linearRampToValueAtTime(0, context.currentTime + seconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + seconds);
}
