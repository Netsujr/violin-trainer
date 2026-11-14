import { createDetector, rootMeanSquare } from "./detector";

const FRAME_SIZE = 2048;

export async function startMic(
  minRms: () => number,
  // Each frame's pitch, if it has a clear one, and how loud it was.
  onReading: (frequency: number | null, now: number, rms: number) => void,
) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext();
  // Made after the permission prompt rather than during the tap, which can leave it suspended on Safari, hearing silence.
  // A refusal isn't fatal, since it may already be running.
  context.resume().catch(() => {});
  const analyser = context.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  context.createMediaStreamSource(stream).connect(analyser);

  const detect = createDetector(FRAME_SIZE, context.sampleRate);
  const frame = new Float32Array(FRAME_SIZE);
  let animationFrame = 0;
  const tick = (now: number) => {
    analyser.getFloatTimeDomainData(frame);
    const rms = rootMeanSquare(frame);
    onReading(detect(frame, minRms(), rms), now, rms);
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
