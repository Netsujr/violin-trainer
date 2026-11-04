// "Don't wait": the lanes keep moving at the BPM, each note is judged as it passes, and a run ends with a score.
import { wav, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, near, progress, OUT } from "./lib.mjs";

const D = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
const BUNS = [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62];
const BEAT_PX = 120;
wav(OUT + "follow-silent.wav", [rest(3)]);
const s = await open(OUT + "follow-silent.wav");
const { page } = s;
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
const log = () => page.evaluate(() => JSON.parse(localStorage.getItem("log") ?? "[]"));
const dontWait = () => page.locator('button[aria-label="Don\'t wait"]');
const waiting = async () => (await dontWait().getAttribute("aria-pressed")) === "false";
const allDone = () => page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 60000 });
const fresh = async (bpm = 120) => {
  await page.reload(); await page.waitForSelector("nav button"); // Also ends the last run's synthetic player.
  await nav(page, "Practice"); await sleep(250);
  await page.locator(".bpm input").fill(String(bpm));
};
const begin = async () => { await page.click('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")'); };
// Once a frame, from inside the page: the lanes' position and the text above them.
const watch = () => page.evaluate(() => {
  window.frames_ = [];
  const scroller = document.querySelector(".highway-scroll"), text = document.querySelector("section > p");
  const tick = () => { window.frames_.push({ at: performance.now(), left: scroller.scrollLeft, text: text.textContent }); requestAnimationFrame(tick); };
  tick();
});
const frames = () => page.evaluate(() => window.frames_);
const hasColor = (r, g, b) => page.locator("canvas").evaluate((canvas, [r, g, b]) => {
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) < 4 && Math.abs(data[i + 1] - g) < 4 && Math.abs(data[i + 2] - b) < 4) return true;
  return false;
}, [r, g, b]);

await nav(page, "Practice"); await sleep(250);
const color = () => dontWait().evaluate((button) => getComputedStyle(button).color);
const plainColor = await page.locator('button[aria-label="Fullscreen"]').evaluate((button) => getComputedStyle(button).color);
check("off by default, looking like the buttons beside it", (await waiting()) && (await saved()).followOn === false && (await color()) === plainColor, await color());
const { x: followX, width: followWidth } = await dontWait().boundingBox();
check("an icon, right next to Fullscreen", (await dontWait().innerText()) === "" && Math.abs((await page.locator('button[aria-label="Fullscreen"]').boundingBox()).x - (followX + followWidth)) < 16);
check("gone from Options", (await page.locator('.options :text("Don\'t wait")').count()) === 0);
const hint = await dontWait().getAttribute("title");
check("explains itself", hint?.includes("score"), hint);
await dontWait().click(); await sleep(300);
check("turns green when on", (await color()) === "rgb(76, 208, 125)", await color());
check("saved, and Tempo no longer applies", (await saved()).followOn === true && (await page.locator('.options label:has-text("Tempo") input').isDisabled()));

// Silence: the lanes go anyway
await fresh();
check("it stays on after a reload", !(await waiting()));
await watch();
await begin();
check("Skip stays off, since nothing waits", await page.locator('button:text-is("Skip")').isDisabled());
await allDone();
await sleep(150);
const run = await frames();
const started = run.find((frame) => frame.text.startsWith("Starts in"));
const counts = [...new Set(run.map((frame) => frame.text).filter((text) => text.startsWith("Starts in")))];
check("counts in four beats", counts.join() === "Starts in 4…,Starts in 3…,Starts in 2…,Starts in 1…", counts.join());
const moving = run.filter((frame, index) => index > 0 && frame.left > run[index - 1].left);
check("the lanes hold still during the count-in", run.filter((frame) => frame.text.startsWith("Starts in")).every((frame) => frame.left === 0));
const seconds = (moving.at(-1).at - moving[0].at) / 1000;
const speed = (moving.at(-1).left - moving[0].left) / seconds;
check("then move at the BPM, with nothing played", Math.abs(speed - 2 * BEAT_PX) < 8, `${Math.round(speed)} px/s`);
const steps = moving.slice(1).map((frame, index) => frame.left - moving[index].left);
check("smoothly", Math.max(...steps) < 12, `largest step ${Math.max(...steps)}`);
const total = (run.find((frame) => frame.text.startsWith("All")).at - started.at) / 1000;
check("a run lasts delay + count-in + every beat", Math.abs(total - (0.5 + 2 + 7.5)) < 0.4, `${total.toFixed(2)} s`);
const changes = run.filter((frame, index) => index > 0 && frame.text !== run[index - 1].text && frame.text.startsWith("Note"));
const gaps = changes.slice(1).map((frame, index) => Math.round(frame.at - changes[index].at));
// Note 1 shows on its beat, and the rest once the mic has had time to hear the note before, 70 ms later.
check("one note per beat", Math.abs(gaps[0] - 570) < 40 && near(gaps.slice(1), [500], 40), gaps.join(" "));
check("the lanes stop at the end", Math.abs(run.at(-1).left - 15 * BEAT_PX) < 2, String(run.at(-1).left));
const silent = await page.locator(".stats").innerText();
check("silence scores 0%, all missed", silent.includes("Score: 0%") && silent.includes("0 hit, 15 missed") && !silent.includes("Slowest"), silent.replaceAll("\n", " / "));
await page.screenshot({ path: OUT + "follow-silent.png" });
await stop(page); await sleep(200);
const entry = (await log()).at(-1);
check("logged with its score, and not as a timed pass", entry.score === 0 && entry.passes === 0 && entry.averagePassSeconds === null && entry.notesSkipped === 15 && entry.slowest.length === 0, JSON.stringify({ score: entry.score, passes: entry.passes }));

// Playing along
await fresh();
await followNotes(page, { midis: D });
await begin(); await allDone(); await sleep(150);
const perfect = await page.locator(".stats").innerText();
check("playing every note scores 100%", perfect.includes("Score: 100%") && perfect.includes("15 hit, 0 missed"), perfect.replaceAll("\n", " / "));
check("the finished notes fill pale green", await hasColor(201, 237, 212));
check("with no green border left on them", !(await hasColor(76, 208, 125)));
await page.click('button:text-is("Play again")'); await sleep(150);
check("Play again clears the score and counts in again", (await page.locator(".stats").innerText()) === "" && (await progress(page)).startsWith("Starts in"), await progress(page));
await allDone(); await sleep(150);
check("and scores the new run", (await page.locator(".stats").innerText()).includes("15 hit, 0 missed"));
await stop(page); await sleep(200);
const twice = (await log()).at(-1);
check("the log adds up both runs", twice.score === 100 && twice.notesHit === 30, JSON.stringify({ hit: twice.notesHit }));

await fresh();
await followNotes(page, { midis: D.map((midi, index) => (index === 2 ? midi + 2 : midi)), delays: { 6: 60000 } });
await begin();
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 7 of 15", null, { timeout: 15000 });
await sleep(100);
check("a miss fills pale red as it passes", await hasColor(246, 207, 200));
await allDone(); await sleep(150);
const someMissed = await page.locator(".stats").innerText();
check("a wrong note and a silent one are missed: 13 of 15 is 87%", someMissed.includes("Score: 87%") && someMissed.includes("13 hit, 2 missed"), someMissed.replaceAll("\n", " / "));
await stop(page); await sleep(200);

await fresh(90);
await nav(page, "Library"); await sleep(150);
await page.locator(".piece", { hasText: "Hot Cross Buns" }).locator('button[aria-label="Practice"]').click(); await sleep(300);
await followNotes(page, { midis: BUNS });
await begin(); await allDone(); await sleep(150);
const buns = await page.locator(".stats").innerText();
check("a song counts its repeated eighths with no break in the sound", buns.includes("Score: 100%") && buns.includes("17 hit, 0 missed"), buns.replaceAll("\n", " / "));
await stop(page); await sleep(200);

// Changing things mid-run
await fresh();
await begin();
await page.waitForFunction(() => /^Note [2-9] of/.test(document.querySelector("section > p").textContent), null, { timeout: 8000 });
const box = await page.locator("canvas").boundingBox();
await page.mouse.click(box.x + 130 + 40, box.y + 126); // Whatever's on the A string at the hit line, or nothing.
await page.locator(".bpm input").fill("60");
await watch();
await sleep(1500);
const slower = await frames();
const slowSpeed = (slower.at(-1).left - slower[0].left) / ((slower.at(-1).at - slower[0].at) / 1000);
check("a BPM change applies straight away", Math.abs(slowSpeed - BEAT_PX) < 8, `${Math.round(slowSpeed)} px/s`);
await page.locator(".bpm input").fill("120");
const before = (await log()).length;
await dontWait().click(); await sleep(300);
check("switching it off ends the run and logs it", (await page.locator('button:text-is("Start")').count()) === 1 && (await log()).length === before + 1 && !(await page.locator('.options label:has-text("Tempo") input').isDisabled()));
check("back to waiting, on the first note", (await progress(page)) === "Note 1 of 15", await progress(page));
await begin(); await sleep(1200);
check("waiting again: Skip is on, and nothing moves on its own", (await progress(page)) === "Note 1 of 15" && (await page.locator('button:text-is("Skip")').isEnabled()));
await stop(page); await sleep(200);

// Starting partway, and restarting by clicking a note
await dontWait().click(); await sleep(100);
const tile = async (index) => { const box = await page.locator("canvas").boundingBox(); await page.mouse.click(box.x + 130 + (index * BEAT_PX) + 40, box.y + 2.5 * 84); };
await tile(2); await sleep(600);
check("a clicked note is still where a run starts", (await progress(page)) === "Note 3 of 15", await progress(page));
await followNotes(page, { midis: D });
await begin();
await sleep(150);
check("the count-in is for that note", (await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) === 2 * BEAT_PX && (await progress(page)).startsWith("Starts in"), await progress(page));
await allDone(); await sleep(150);
const partial = await page.locator(".stats").innerText();
check("only the notes from there are scored", partial.includes("13 hit, 0 missed") && partial.includes("100%"), partial.replaceAll("\n", " / "));
await stop(page); await sleep(200);

// The metronome counts in the first note
await page.reload(); await page.waitForSelector("nav button");
await nav(page, "Practice"); await sleep(250);
await page.locator(".bpm input").fill("120");
await page.locator('.options label:has-text("Metronome") input').check();
await page.evaluate(() => {
  window.clicks = [];
  const startNode = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (when) {
    window.clicks.push({ at: performance.now() + (when - this.context.currentTime) * 1000 + (this.context.outputLatency || 0) * 1000, hz: this.frequency.value });
    return startNode.call(this, when);
  };
});
await watch();
await begin();
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 6 of 15", null, { timeout: 15000 });
await stop(page); await sleep(200);
const clicks = (await page.evaluate(() => window.clicks)).filter((click) => click.hz >= 2500);
const clickRun = await frames();
const firstMove = clickRun.find((frame, index) => index > 0 && frame.left > clickRun[index - 1].left);
const fifth = clicks[4];
check("four clicks count in, and the fifth lands on the first note", clicks.length >= 6 && Math.abs(firstMove.at - fifth.at) < 40, `${Math.round(firstMove.at - fifth.at)} ms apart`);
check("the first note's click is accented", fifth.hz === 3200 && clicks[1].hz === 2500);
await page.locator('.options label:has-text("Metronome") input').uncheck();

// A recording's markers land on the notes
await fresh();
await page.locator('.options label:has-text("Record") input').check();
await followNotes(page, { midis: D });
await begin(); await allDone();
await stop(page);
await page.waitForSelector('button:text-is("Start"):not([disabled])');
await nav(page, "Log"); await page.waitForSelector("audio"); await sleep(400);
const markers = await page.locator("button.marker").count();
check("a recording gets its 15 markers", markers === 15, String(markers));
const row = await page.locator("section > ul > li").first().innerText();
check("the Log shows the score, not passes and slowest notes", row.includes("Score: 100%") && row.includes("15 hit, 0 missed") && !row.includes("slowest") && !row.includes("pass"), row.replaceAll("\n", " ").slice(0, 130));
const times = await page.evaluate(async () => {
  const { getRecording, loadLog } = await import("/src/storage.ts");
  const entry = loadLog().at(-1);
  return (await getRecording(entry.recordingId)).markers.map((marker) => marker.seconds);
});
const markerGaps = times.slice(1).map((time, index) => Math.round((time - times[index]) * 1000));
check("markers sit a beat apart", near(markerGaps, [500], 60), markerGaps.join(" "));
check("the first marker is after the count-in", times[0] > 2.3 && times[0] < 2.8, String(times[0]));

// Fullscreen
await fresh();
await page.click('button[aria-label="Fullscreen"]'); await sleep(300);
check("the icon stays available in fullscreen", await dontWait().isVisible());
await followNotes(page, { midis: D });
await begin();
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 5 of 15", null, { timeout: 15000 });
const left = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
const scale = (await page.locator("canvas").boundingBox()).height / (84 * 4);
check("in fullscreen the lanes keep their pace at the larger scale", Math.abs(left - 4 * BEAT_PX * scale) < BEAT_PX * scale * 0.5, `${Math.round(left)} of ${Math.round(4 * BEAT_PX * scale)}`);
await allDone(); await sleep(150);
const card = await page.locator(".stats").boundingBox();
check("and the score shows on screen", (await page.locator(".stats .score").isVisible()) && card.y >= 0 && card.y + card.height <= 950, JSON.stringify(card));
await page.screenshot({ path: OUT + "follow-fullscreen.png" });
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await stop(page); await sleep(200);

await page.click('.language button:text-is("PT")'); await sleep(250);
await page.locator("nav button").nth(1).click(); await sleep(200);
check("pt: translated", (await page.locator('button[aria-label="Sem esperar"]').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
