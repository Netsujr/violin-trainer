import { sharedAudioContext } from "./reference";

// Finds a recording's beat: its tempo, and where the first beat falls. Good on music with a clear pulse, like a
// backing track or drums. Rubato or a soft, bowed start can fool it, which is why the result can be adjusted by hand.

const HOP_SECONDS = 0.01;
const MIN_BPM = 60;
const MAX_BPM = 180;
// Tempos far from this are less likely, which keeps it from picking half or double the real one.
const LIKELY_BPM = 115;
// The search around the first guess, as a share of its period, and the step through it.
const REFINE_SPAN = 0.04;
const REFINE_STEPS = 160;
// The first note is the first rise in loudness at least this share of the biggest.
const FIRST_ONSET_SHARE = 0.3;

export function detectTempo(samples: Float32Array, sampleRate: number) {
  const hop = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const frameSeconds = hop / sampleRate;
  const onset = onsetStrength(samples, hop);
  const duration = onset.length * frameSeconds;

  // How strongly the rises line up on a grid of beats this far apart, starting at this time.
  const onsetAt = (seconds: number) => {
    const frame = Math.round(seconds / frameSeconds);
    return Math.max(onset[frame - 1] ?? 0, onset[frame] ?? 0, onset[frame + 1] ?? 0);
  };
  function gridScore(period: number, phase: number) {
    let sum = 0;
    let beats = 0;
    for (let time = phase; time < duration; time += period, beats++) sum += onsetAt(time);
    return beats ? sum / beats : 0;
  }

  // A first guess at the period from how the rises repeat, then a finer search for the period and phase that fit best.
  const guess = likeliestPeriod(onset, frameSeconds);
  let best = { score: -1, period: guess, phase: 0 };
  for (let step = -REFINE_STEPS / 2; step <= REFINE_STEPS / 2; step++) {
    const period = guess * (1 + (step / REFINE_STEPS) * 2 * REFINE_SPAN);
    for (let phase = 0; phase < period; phase += frameSeconds) {
      const score = gridScore(period, phase);
      if (score > best.score) best = { score, period, phase };
    }
  }

  // The first beat is the grid line nearest the first clear note.
  const loudest = onset.reduce((max, value) => Math.max(max, value), 0);
  const firstFrame = onset.findIndex((value) => value >= loudest * FIRST_ONSET_SHARE);
  const firstOnset = Math.max(0, firstFrame) * frameSeconds;
  let offset = best.phase + Math.round((firstOnset - best.phase) / best.period) * best.period;
  if (offset < 0) offset += best.period;

  return { bpm: Math.round((600 / best.period)) / 10, offset: Math.round(offset * 1000) / 1000 };
}

// How much the loudness rises at each step, on a log scale so quiet and loud passages count alike.
function onsetStrength(samples: Float32Array, hop: number) {
  const frames = Math.floor(samples.length / hop);
  const onset = new Float32Array(frames);
  let previous = 0;
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let i = frame * hop; i < (frame + 1) * hop; i++) sum += samples[i] * samples[i];
    const level = Math.log1p((1000 * sum) / hop);
    onset[frame] = Math.max(0, level - previous);
    previous = level;
  }
  return onset;
}

function likeliestPeriod(onset: Float32Array, frameSeconds: number) {
  const minLag = Math.floor(60 / MAX_BPM / frameSeconds);
  const maxLag = Math.ceil(60 / MIN_BPM / frameSeconds);
  let best = { score: -1, lag: minLag };
  for (let lag = minLag; lag <= maxLag && lag < onset.length; lag++) {
    let sum = 0;
    for (let frame = lag; frame < onset.length; frame++) sum += onset[frame] * onset[frame - lag];
    const bpm = 60 / (lag * frameSeconds);
    const score = (sum / (onset.length - lag)) * Math.exp(-0.5 * Math.log2(bpm / LIKELY_BPM) ** 2);
    if (score > best.score) best = { score, lag };
  }
  return best.lag * frameSeconds;
}

// A recording's sound, from a file. Throws if it isn't audio the browser can read.
export async function decodeAudio(blob: Blob) {
  return sharedAudioContext().decodeAudioData(await blob.arrayBuffer());
}

export async function findBeat(blob: Blob) {
  const audio = await decodeAudio(blob);
  return detectTempo(audio.getChannelData(0), audio.sampleRate);
}
