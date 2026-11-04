import { rmSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, D_MAJOR, OUT } from "./lib.mjs";
const profile = OUT + "profile-long";
rmSync(profile, { recursive: true, force: true });
wav(OUT + "dmajor-long.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);
const s = await open(OUT + "dmajor-long.wav", profile);
const page = s.page;
await nav(page, "Practice");
await page.locator('label:has-text("Record") input').check();
await start(page);
await page.waitForSelector('button:text-is("Stop")');
const t0 = Date.now();
while (Date.now() - t0 < 5 * 60 * 1000 + 5000) {
  if (await page.locator('button:text-is("Play again")').count()) await page.click('button:text-is("Play again")');
  await sleep(200);
}
const stopClicked = Date.now();
await stop(page);
await nav(page, "Log");
await page.waitForSelector("audio", { timeout: 15000 });
console.log("save took about", Date.now() - stopClicked, "ms, and the player appears with no reload");
await page.reload();
await page.waitForSelector("nav button");
await nav(page, "Log");
await page.waitForSelector("audio");
await sleep(1500);
const result = await page.evaluate(async () => {
  const { createDetector } = await import("/src/audio/detector.ts");
  const { nearestMidi, midiOf } = await import("/src/music/notes.ts");
  const audio = document.querySelector("audio");
  const blob = await (await fetch(audio.src)).blob();
  const decoded = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(await blob.arrayBuffer());
  const samples = decoded.getChannelData(0);
  const buttons = [...document.querySelectorAll("button.marker")];
  const picks = [0, 1, Math.floor(buttons.length / 2), buttons.length - 2, buttons.length - 1].map((i) => buttons[i]);
  const rows = [];
  for (const button of picks) {
    const startedAt = performance.now();
    button.click();
    await new Promise((r) => audio.addEventListener("seeked", r, { once: true }));
    const seekMs = performance.now() - startedAt;
    const seekTo = audio.currentTime;
    await new Promise((r) => setTimeout(r, 150));
    const played = audio.currentTime;
    audio.pause();
    const detect = createDetector(2048, decoded.sampleRate);
    let hz = null;
    const at = Math.floor((seekTo + 0.12) * decoded.sampleRate);
    for (let f = 0; f < 5; f++) hz = detect(samples.slice(at + f * 512, at + f * 512 + 2048), 0.01) ?? hz;
    rows.push({ want: button.textContent, seekTo: +seekTo.toFixed(2), seekMs: Math.round(seekMs), advancing: played > seekTo, ok: !!hz && nearestMidi(hz) === midiOf(button.textContent) });
  }
  return { duration: audio.duration, decoded: decoded.duration, mb: blob.size / 1048576, markers: buttons.length, rows };
});
console.log(JSON.stringify(result, null, 1));
check("5-minute recording plays back", result.duration > 300 && result.decoded > 300, `${result.duration}s, ${result.mb.toFixed(1)} MB, ${result.markers} markers`);
check("jumps land on the note, and play", result.rows.every((r) => r.ok && r.advancing));
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
