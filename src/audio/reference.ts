import { frequencyOf, midiOf, type PieceNote } from "../music/notes";

const VOLUME = 0.3;
const FADE_SECONDS = 0.02;
// A moment's silence at the end of each note played in turn, so a repeated note is heard again.
const NOTE_GAP_SECONDS = 0.05;

let context: AudioContext | undefined;

export function sharedAudioContext() {
  context ??= new AudioContext();
  // Safari can start one suspended.
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

// A triangle tone, starting on the note given if any, silent until its volume is raised. Stopping it fades it out
// quickly, so it doesn't click.
function createTone(midi?: number) {
  const context = sharedAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  if (midi !== undefined) oscillator.frequency.value = frequencyOf(midi);
  gain.gain.setValueAtTime(0, context.currentTime);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();

  return {
    context,
    oscillator,
    volume: gain.gain,
    stop() {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
      gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_SECONDS);
      oscillator.stop(context.currentTime + FADE_SECONDS);
    },
  };
}

// A steady tone that sounds until it's stopped, with short fades so it doesn't click.
export function startReference(midi: number) {
  const { context, oscillator, volume, stop } = createTone(midi);
  volume.linearRampToValueAtTime(VOLUME, context.currentTime + FADE_SECONDS);

  return {
    setNote(next: number) {
      oscillator.frequency.value = frequencyOf(next);
    },
    stop,
  };
}

// Plays notes one after another, each for its beats, with a rest silent for its own. Returns how to stop early, and
// calls onEnd once it has stopped, at the end or early.
export function playNotes(notes: PieceNote[], beatMs: number, onEnd: () => void) {
  const { context, oscillator, volume, stop } = createTone();
  let at = context.currentTime;
  for (const note of notes) {
    const end = at + (note.beats! * beatMs) / 1000;
    if (note.pitch) {
      oscillator.frequency.setValueAtTime(frequencyOf(midiOf(note.pitch)), at);
      volume.setValueAtTime(0, at);
      volume.linearRampToValueAtTime(VOLUME, at + FADE_SECONDS);
      volume.setValueAtTime(VOLUME, end - NOTE_GAP_SECONDS - FADE_SECONDS);
      volume.linearRampToValueAtTime(0, end - NOTE_GAP_SECONDS);
    }
    at = end;
  }
  oscillator.onended = onEnd;
  oscillator.stop(at);
  return stop;
}
