import { midiOf, type PieceNote } from "../music/notes";

const VOLUME = 0.9;
const FADE_SECONDS = 0.02;
// A note ends over this long, as a bow leaves the string, rather than cutting off.
const RELEASE_SECONDS = 0.08;
// A moment's silence at the end of each note played in turn, so a repeated note is heard again.
const NOTE_GAP_SECONDS = 0.05;

// Real violin notes, one for each note of first position, G3 to B5, named by MIDI number. src/assets/violin/README.md
// says where they're from. Each plays its bow's start once, then loops from LOOP_START_SECONDS to its end, so a note
// sounds for as long as it's needed. They're decoded at their own rate, which keeps the loop exact.
const SAMPLE_URLS = import.meta.glob<string>("../assets/violin/*.flac", { eager: true, query: "?url", import: "default" });
const SAMPLES = new Map(Object.entries(SAMPLE_URLS).map(([path, url]) => [Number(path.match(/(\d+)\.flac$/)![1]), url]));
export const SAMPLE_MIDIS = [...SAMPLES.keys()].sort((a, b) => a - b);
const SAMPLE_RATE = 32000;
const LOOP_START_SECONDS = 0.26;

let context: AudioContext | undefined;

export function sharedAudioContext() {
  context ??= new AudioContext();
  // Safari can start one suspended.
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

// The recording for a note, and how much faster to play it: the note's own, as recorded, or outside first position,
// the nearest one's, retuned.
export function sampleFor(midi: number) {
  const nearest = SAMPLE_MIDIS.reduce((best, sample) => (Math.abs(sample - midi) < Math.abs(best - midi) ? sample : best));
  return { midi: nearest, rate: 2 ** ((midi - nearest) / 12) };
}

let recordings: Map<number, Promise<AudioBuffer>> | undefined;
// Fetches and decodes every recording, once, so the first note asked for is ready, or nearly.
export function loadRecordings() {
  recordings ??= new Map(
    SAMPLE_MIDIS.map((midi) => [midi, fetch(SAMPLES.get(midi)!).then((response) => response.arrayBuffer()).then((data) => new OfflineAudioContext(1, 1, SAMPLE_RATE).decodeAudioData(data))]),
  );
  return recordings;
}

// One note from `at`: its recording, looping for as long as it sounds, faded in so it doesn't click, and ended by
// `end` if given, or else when it's stopped.
function bow(buffer: AudioBuffer, rate: number, at: number, end?: number) {
  const context = sharedAudioContext();
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = LOOP_START_SECONDS;
  source.loopEnd = buffer.duration;
  source.playbackRate.value = rate;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(VOLUME, at + FADE_SECONDS);
  source.connect(gain).connect(context.destination);
  source.start(at);
  if (end !== undefined) {
    gain.gain.setValueAtTime(VOLUME, end - RELEASE_SECONDS);
    gain.gain.linearRampToValueAtTime(0, end);
    source.stop(end);
  }
  let done = false;
  source.onended = () => (done = true);

  return {
    stop() {
      if (done) return;
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + RELEASE_SECONDS);
      source.stop(now + RELEASE_SECONDS);
    },
  };
}

// A note that sounds until it's stopped. A new note is bowed afresh, once its recording is ready, unless by then it's
// been stopped or moved on again.
export function startReference(midi: number) {
  let playing: number | null = null;
  let note: ReturnType<typeof bow> | null = null;

  async function play(next: number) {
    if (next === playing) return;
    playing = next;
    const { midi: sample, rate } = sampleFor(next);
    const buffer = await loadRecordings().get(sample)!;
    if (playing !== next) return;
    note?.stop();
    note = bow(buffer, rate, sharedAudioContext().currentTime);
  }
  void play(midi);

  return {
    setNote: (next: number) => void play(next),
    stop() {
      playing = null;
      note?.stop();
      note = null;
    },
  };
}

// Plays notes one after another, each for its beats, with a rest silent for its own, once their recordings are ready.
// Returns how to stop early, and calls onEnd once it has stopped, at the end or early.
export function playNotes(notes: PieceNote[], beatMs: number, onEnd: () => void) {
  const bowed: ReturnType<typeof bow>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  function end(early = true) {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    if (early) bowed.forEach((note) => note.stop());
    onEnd();
  }

  const pitched = notes.flatMap((note) => (note.pitch ? [sampleFor(midiOf(note.pitch))] : []));
  void Promise.all(pitched.map(({ midi }) => loadRecordings().get(midi)!)).then((buffers) => {
    if (ended) return;
    const context = sharedAudioContext();
    let at = context.currentTime;
    let next = 0;
    for (const note of notes) {
      const until = at + (note.beats! * beatMs) / 1000;
      if (note.pitch) bowed.push(bow(buffers[next], pitched[next++].rate, at, until - NOTE_GAP_SECONDS));
      at = until;
    }
    timer = setTimeout(() => end(false), (at - context.currentTime) * 1000);
  });
  return () => end();
}
