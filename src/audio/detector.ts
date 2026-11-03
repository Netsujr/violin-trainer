import { PitchDetector } from "pitchy";

const MIN_CLARITY = 0.9;
const MIN_HZ = 180;
const MAX_HZ = 2000;
const SMOOTHING_READINGS = 5;

const rootMeanSquare = (frame: Float32Array) =>
  Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1];

export function createDetector(frameSize: number, sampleRate: number) {
  const pitchDetector = PitchDetector.forFloat32Array(frameSize);
  const recent: number[] = [];

  return (frame: Float32Array, minRms: number): number | null => {
    const [frequency, clarity] = rootMeanSquare(frame) < minRms ? [0, 0] : pitchDetector.findPitch(frame, sampleRate);
    if (clarity < MIN_CLARITY || frequency < MIN_HZ || frequency > MAX_HZ) {
      recent.length = 0;
      return null;
    }

    recent.push(frequency);
    if (recent.length > SMOOTHING_READINGS) recent.shift();

    return median(recent);
  };
}
