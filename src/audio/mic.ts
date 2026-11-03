import { createDetector } from "./detector";

const FRAME_SIZE = 2048;

export type Mic = { stream: MediaStream; stop(): void };

export async function startMic(
  minRms: () => number,
  onReading: (frequency: number | null, now: number) => void,
): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  context.createMediaStreamSource(stream).connect(analyser);

  const detect = createDetector(FRAME_SIZE, context.sampleRate);
  const frame = new Float32Array(FRAME_SIZE);
  let animationFrame = 0;
  const tick = (now: number) => {
    analyser.getFloatTimeDomainData(frame);
    onReading(detect(frame, minRms()), now);
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);

  return {
    stream,
    stop() {
      cancelAnimationFrame(animationFrame);
      stream.getTracks().forEach((track) => track.stop());
      context.close();
    },
  };
}
