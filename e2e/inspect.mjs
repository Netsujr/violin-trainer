import { open, OUT } from "./lib.mjs";
const s = await open(OUT + "silence.wav", OUT + "profile-long");
const result = await s.page.evaluate(async () => {
  const { getRecording } = await import("/src/storage.ts");
  const log = JSON.parse(localStorage.getItem("log"));
  const rows = [];
  for (const e of log) {
    const r = e.recordingId ? await getRecording(e.recordingId) : null;
    rows.push({ minutes: +e.minutes.toFixed(2), passes: e.passes, hits: e.notesHit, recordingId: e.recordingId, saved: !!r, mb: r ? +(r.blob.size / 1048576).toFixed(2) : null, markers: r?.markers.length });
  }
  return { rows, usage: await navigator.storage.estimate() };
});
console.log(JSON.stringify(result, null, 1));
await s.close();
