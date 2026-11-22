// A five-minute recording: it saves, plays back in the Calendar, and its note markers land on their notes.
import { rmSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, setRecord, dockButton, D_MAJOR, OUT } from "./lib.mjs";
const profile = OUT + "profile-long";
rmSync(profile, { recursive: true, force: true });
wav(OUT + "dmajor-long.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);
const s = await open(OUT + "dmajor-long.wav", profile);
const page = s.page;
await nav(page, "Practice");
await setRecord(page, true);
// Loop keeps the run going round the scale for the whole five minutes.
await dockButton(page, "Loop").click();
await start(page);
await page.waitForSelector('button:text-is("Stop")');
await sleep(5 * 60 * 1000 + 5000);
const stopClicked = Date.now();
await stop(page);
await nav(page, "Calendar");
await page.waitForSelector(".recording-note", { timeout: 15000 });
console.log("save took about", Date.now() - stopClicked, "ms, and the recording appears with no reload");
await page.reload();
await page.waitForSelector("nav button");
await nav(page, "Calendar");
await page.click(".recording-note");
await page.waitForSelector("audio", { state: "attached" });
await sleep(1500);
const result = await page.evaluate(async () => {
  const { createDetector } = await import("/src/audio/detector.ts");
  const { nearestMidi, midiOf } = await import("/src/music/notes.ts");
  const { getRecording, loadLog } = await import("/src/storage.ts");
  const { markers } = await getRecording(loadLog().at(-1).recordingId);
  const audio = document.querySelector("audio");
  const blob = await (await fetch(audio.src)).blob();
  const decoded = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(await blob.arrayBuffer());
  const samples = decoded.getChannelData(0);
  // The first two markers, one in the middle and the last two. The middle one follows a different note: where Loop goes
  // round, the scale's last D and the next round's first are one held sound, its marker at its end.
  const middle = markers.findIndex((marker, index) => index >= markers.length / 2 && marker.pitch !== markers[index - 1].pitch);
  const picks = [0, 1, middle, markers.length - 2, markers.length - 1].map((i) => markers[i]);
  const rows = picks.map((marker) => {
    const detect = createDetector(2048, decoded.sampleRate);
    let hz = null;
    const at = Math.floor((marker.seconds + 0.24) * decoded.sampleRate);
    for (let f = 0; f < 5; f++) hz = detect(samples.slice(at + f * 512, at + f * 512 + 2048), 0.01) ?? hz;
    return { want: marker.pitch, seconds: +marker.seconds.toFixed(2), ok: !!hz && nearestMidi(hz) === midiOf(marker.pitch) };
  });
  return { duration: audio.duration, decoded: decoded.duration, mb: blob.size / 1048576, markers: markers.length, rows };
});
console.log(JSON.stringify(result, null, 1));
check("5-minute recording plays back", result.duration > 300 && result.decoded > 300, `${result.duration}s, ${result.mb.toFixed(1)} MB, ${result.markers} markers`);
check("its markers land on their notes", result.rows.every((r) => r.ok), JSON.stringify(result.rows));
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
