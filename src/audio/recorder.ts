// MP4 (AAC) plays almost anywhere. Safari only records it; Chrome records it when asked, and WebM otherwise.
const MP4 = "audio/mp4;codecs=mp4a.40.2";

export function startRecorder(stream: MediaStream) {
  const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported(MP4) ? { mimeType: MP4 } : {});
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.start();

  return {
    startedAt: performance.now(),
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
        recorder.stop();
      }),
  };
}
