import { frequencyOf } from "../music/notes";

const VOLUME = 0.22;
const ATTACK_SECONDS = 0.12;
const RELEASE_SECONDS = 0.15;
const NOTE_GLIDE_SECONDS = 0.015;
// Two slightly apart, because a bow never holds one perfectly steady pitch.
const STRING_DETUNE_CENTS = 4;
const VIBRATO_HZ = 5.5;
const VIBRATO_CENTS = 12;
const VIBRATO_DELAY_SECONDS = 0.35;
// A violin's body: its air and wood resonances, and the "bridge hill" that gives it its bite.
const BODY_RESONANCES = [
  { hz: 280, gain: 6, q: 2 },
  { hz: 500, gain: 5, q: 2 },
  { hz: 2500, gain: 7, q: 1 },
];
const HIGHEST_HZ = 6000;

let context: AudioContext | undefined;

export const sharedAudioContext = () => (context ??= new AudioContext());

// A bowed string is close to a sawtooth wave. The rest shapes it the way a violin does, with a slow bow attack
// and vibrato that starts after the note does. It keeps sounding until it's stopped.
export function createViolinVoice(context: BaseAudioContext, midi: number, output: AudioNode) {
  const now = context.currentTime;
  const volume = context.createGain();
  volume.gain.setValueAtTime(0, now);
  volume.gain.linearRampToValueAtTime(VOLUME, now + ATTACK_SECONDS);

  let next: AudioNode = volume;
  for (const { hz, gain, q } of BODY_RESONANCES) {
    const resonance = context.createBiquadFilter();
    resonance.type = "peaking";
    resonance.frequency.value = hz;
    resonance.gain.value = gain;
    resonance.Q.value = q;
    next.connect(resonance);
    next = resonance;
  }
  const brightness = context.createBiquadFilter();
  brightness.type = "lowpass";
  brightness.frequency.value = HIGHEST_HZ;
  next.connect(brightness).connect(output);

  const vibrato = context.createOscillator();
  const vibratoDepth = context.createGain();
  vibrato.frequency.value = VIBRATO_HZ;
  vibratoDepth.gain.setValueAtTime(0, now + VIBRATO_DELAY_SECONDS);
  vibratoDepth.gain.linearRampToValueAtTime(VIBRATO_CENTS, now + VIBRATO_DELAY_SECONDS * 2);
  vibrato.connect(vibratoDepth);
  vibrato.start();

  const strings = [-STRING_DETUNE_CENTS, STRING_DETUNE_CENTS].map((cents) => {
    const string = context.createOscillator();
    string.type = "sawtooth";
    string.frequency.value = frequencyOf(midi);
    string.detune.value = cents;
    vibratoDepth.connect(string.detune);
    string.connect(volume);
    string.start();
    return string;
  });

  return {
    setNote(note: number) {
      for (const string of strings) string.frequency.setTargetAtTime(frequencyOf(note), context.currentTime, NOTE_GLIDE_SECONDS);
    },
    stop() {
      const stopAt = context.currentTime + RELEASE_SECONDS;
      volume.gain.cancelScheduledValues(context.currentTime);
      volume.gain.setValueAtTime(volume.gain.value, context.currentTime);
      volume.gain.linearRampToValueAtTime(0, stopAt);
      vibrato.stop(stopAt);
      for (const string of strings) string.stop(stopAt);
    },
  };
}

export function startReference(midi: number) {
  const context = sharedAudioContext();
  return createViolinVoice(context, midi, context.destination);
}
