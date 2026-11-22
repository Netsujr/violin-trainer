// Keep moving: the lanes start on the first note played in tune, then keep moving at the BPM, each note is judged as it passes, and a run ends with a score.
import { wav, rest } from "./wav.mjs";
import { setRecord, open, nav, stop, sleep, check, followNotes, near, progress, laneScore, begin, waitForText, freshPractice, savedLog, savedSettings, canvasHasColor, D_MAJOR as D, OUT, setBpm, setLanguage, clickLanes, laneScale, cardOf } from "./lib.mjs";

const BUNS = [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62];
// A beat's width on screen, once the lanes are drawn at their panel's scale.
let BEAT_PX = 120;
wav(OUT + "follow-silent.wav", [rest(3)]);
const s = await open(OUT + "follow-silent.wav", undefined, { keepCountIn: true });
const { page } = s;
// Pace, in the settings panel: Wait for me or Keep moving.
const dontWait = () => page.locator('.dock [aria-label="Pace"] button:text-is("Keep moving")');
const waitForMe = () => page.locator('.dock [aria-label="Pace"] button:text-is("Wait for me")');
const waiting = async () => (await dontWait().getAttribute("aria-pressed")) === "false";
const glideShown = () => page.locator('.dock button:text-is("Glide")').isVisible();
// Once a frame, from inside the page: the lanes' position and the text above them.
const watch = () => page.evaluate(() => {
  window.frames_ = [];
  const scroller = document.querySelector(".highway-scroll"), text = document.querySelector(".practice-progress");
  const tick = () => { window.frames_.push({ at: performance.now(), left: scroller.scrollLeft, text: text.textContent }); requestAnimationFrame(tick); };
  tick();
});
const frames = () => page.evaluate(() => window.frames_);
await nav(page, "Practice"); await sleep(250);
BEAT_PX = 120 * (await laneScale(page));
check("off by default: Pace starts on Wait for me", (await waiting()) && (await savedSettings(page)).followOn === false && (await waitForMe().getAttribute("aria-pressed")) === "true");
await dontWait().click(); await sleep(300);
const hint = await page.locator('.dock-option:has([aria-label="Pace"]) .dock-caption').innerText();
check("Keep moving is picked, and explains itself", !(await waiting()) && hint.includes("score"), hint);
check("saved, and Glide no longer applies", (await savedSettings(page)).followOn === true && !(await glideShown()));

// Silence: the lanes wait on the first note, with no count-in
await freshPractice(page, 120);
check("it stays on after a reload", !(await waiting()));
await watch();
await begin(page);
await sleep(2000);
const held = await frames();
check("in silence the lanes wait on the first note", held.every((frame) => frame.left === 0 && frame.text === "Note 1 of 15"), held.at(-1).text);
await stop(page); await sleep(200);

// The first note, then silence: the lanes go on at the BPM
await freshPractice(page, 120);
await followNotes(page, { midis: [62], delays: { 2: 60000 } });
await watch();
await begin(page);
await waitForText(page, "All", 60000);
await sleep(150);
const run = await frames();
check("never counts in", !run.some((frame) => frame.text.startsWith("Starts in")));
const moving = run.filter((frame, index) => index > 0 && frame.left > run[index - 1].left);
const seconds = (moving.at(-1).at - moving[0].at) / 1000;
const speed = (moving.at(-1).left - moving[0].left) / seconds;
check("once it's heard, the lanes move at the BPM, with nothing more played", Math.abs(speed - 2 * BEAT_PX) < 8, `${Math.round(speed)} px/s`);
const steps = moving.slice(1).map((frame, index) => frame.left - moving[index].left);
check("smoothly", Math.max(...steps) < 12, `largest step ${Math.max(...steps)}`);
// The first note's hold time has passed by the time they move, and the last note clears once the mic has had time to hear it.
const total = (run.find((frame) => frame.text.startsWith("All")).at - moving[0].at) / 1000;
check("a run lasts every beat from the first note on", Math.abs(total - (7.5 - 0.2 + 0.07)) < 0.3, `${total.toFixed(2)} s`);
const changes = run.filter((frame, index) => index > 0 && frame.text !== run[index - 1].text && frame.text.startsWith("Note"));
const gaps = changes.slice(1).map((frame, index) => Math.round(frame.at - changes[index].at));
check("one note per beat", near(gaps, [500], 40), gaps.join(" "));
check("the lanes stop at the end", Math.abs(run.at(-1).left - 15 * BEAT_PX) < 2, String(run.at(-1).left));
const silent = await laneScore(page);
check("the first note alone scores 7%, the rest missed", (await laneScore(page)) === "Score: 7% · 1 hit, 14 missed" && silent.includes("1 hit, 14 missed") && !silent.includes("Slowest"), silent.replaceAll("\n", " / "));
await page.screenshot({ path: OUT + "follow-silent.png" });
await stop(page); await sleep(200);
const entry = (await savedLog(page)).at(-1);
check("logged with its score, and not as a timed pass", entry.score === 7 && entry.passes === 0 && entry.averagePassSeconds === null && entry.notesSkipped === 14, JSON.stringify({ score: entry.score, passes: entry.passes }));

// Playing along
await freshPractice(page, 120);
await followNotes(page, { midis: D });
await begin(page); await waitForText(page, "All", 60000); await sleep(150);
const perfect = await laneScore(page);
check("playing every note scores 100%", (await laneScore(page)) === "Score: 100% · 15 hit, 0 missed" && perfect.includes("15 hit, 0 missed"), perfect.replaceAll("\n", " / "));
check("the finished notes fill pale blue", await canvasHasColor(page, 158, 216, 255));
check("with no hold outline left on them", !(await canvasHasColor(page, 108, 196, 255)));
await page.waitForSelector('button:text-is("Start"):not([disabled])');
check("the run ends by itself, keeping its score and fills", (await laneScore(page)).startsWith("Score: 100%") && (await canvasHasColor(page, 158, 216, 255)));
await begin(page); await sleep(150);
check("Start clears the score and waits for the first note again", (await laneScore(page)) === "" && (await progress(page)) === "Note 1 of 15", await progress(page));
await waitForText(page, "All", 60000); await sleep(150);
check("and scores the new run", (await laneScore(page)).includes("15 hit, 0 missed"), await laneScore(page));
await stop(page); await sleep(1200);
const runs = (await savedLog(page)).slice(-2);
check("each run is logged on its own", runs.length === 2 && runs.every((run) => run.score === 100 && run.notesHit === 15), JSON.stringify(runs.map((run) => run.notesHit)));

await freshPractice(page, 120);
await followNotes(page, { midis: D.map((midi, index) => (index === 2 ? midi + 2 : midi)), delays: { 6: 60000 } });
await begin(page);
await page.waitForFunction(() => document.querySelector(".practice-progress").textContent === "Note 7 of 15", null, { timeout: 15000 });
await sleep(100);
check("a miss fills a muted red as it passes", await canvasHasColor(page, 232, 163, 163));
check("the score sits on the lanes' bar, kept up as notes pass", /^Score: \d+% · \d+ hit, [1-9]\d* missed$/.test(await laneScore(page)), await laneScore(page));
await waitForText(page, "All", 60000); await sleep(150);
const someMissed = await laneScore(page);
check("a wrong note and a silent one are missed: 13 of 15 is 87%", (await laneScore(page)) === "Score: 87% · 13 hit, 2 missed" && someMissed.includes("13 hit, 2 missed"), someMissed.replaceAll("\n", " / "));
await stop(page); await sleep(200);

await freshPractice(page, 90);
await nav(page, "Library"); await sleep(150);
await (await cardOf(page, "Hot Cross Buns")).locator('button:text-is("Practise")').click(); await sleep(300);
await followNotes(page, { midis: BUNS });
await begin(page); await waitForText(page, "All", 60000); await sleep(150);
const buns = await laneScore(page);
check("a song counts its repeated eighths with no break in the sound", (await laneScore(page)) === "Score: 100% · 17 hit, 0 missed" && buns.includes("17 hit, 0 missed"), buns.replaceAll("\n", " / "));
await stop(page); await sleep(200);

// Changing things mid-run
await freshPractice(page, 120);
await followNotes(page, { midis: [62], delays: { 2: 60000 } });
await begin(page);
await page.waitForFunction(() => /^Note [2-9] of/.test(document.querySelector(".practice-progress").textContent), null, { timeout: 8000 });
const box = await page.locator("canvas").boundingBox();
await clickLanes(page, 130 + 40, 126); // Whatever's on the A string at the hit line, or nothing.
await setBpm(page, 60);
await watch();
await sleep(1500);
const slower = await frames();
const slowSpeed = (slower.at(-1).left - slower[0].left) / ((slower.at(-1).at - slower[0].at) / 1000);
check("a BPM change applies straight away", Math.abs(slowSpeed - BEAT_PX) < 8, `${Math.round(slowSpeed)} px/s`);
await setBpm(page, 120);
const before = (await savedLog(page)).length;
await waitForMe().click(); await sleep(300);
check("switching back to Wait for me ends the run and logs it", (await page.locator('button:text-is("Start")').count()) === 1 && (await savedLog(page)).length === before + 1 && (await glideShown()));
check("back to waiting, on the first note", (await progress(page)) === "Note 1 of 15", await progress(page));
await freshPractice(page, 120); // Ends the synthetic player, which would play the first note again.
await begin(page); await sleep(3200); // Past the count-in.
check("waiting again: nothing moves on its own", (await progress(page)) === "Note 1 of 15", await progress(page));
await stop(page); await sleep(200);

// Starting partway, and restarting by clicking a note
await dontWait().click(); await sleep(100);
const tile = (index) => clickLanes(page, 130 + index * 120 + 40, 2.5 * 84);
await tile(2); await sleep(600);
check("a clicked note is still where a run starts", (await progress(page)) === "Note 3 of 15", await progress(page));
await followNotes(page, { midis: D });
await begin(page);
await sleep(100);
check("the lanes start from that note", Math.abs((await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) - 2 * BEAT_PX) < BEAT_PX / 2 && (await progress(page)) === "Note 3 of 15", await progress(page));
await waitForText(page, "All", 60000); await sleep(150);
const partial = await laneScore(page);
check("only the notes from there are scored", partial.includes("13 hit, 0 missed") && (await laneScore(page)) === "Score: 100% · 13 hit, 0 missed", partial.replaceAll("\n", " / "));
await stop(page); await sleep(200);

// The metronome waits for the first note, then joins on the beat
await freshPractice(page, 120);
await followNotes(page, { midis: D });
await page.locator('header .metronome-button').click();
await page.evaluate(() => {
  window.clicks = [];
  const startNode = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (when) {
    window.clicks.push({ at: performance.now() + (when - this.context.currentTime) * 1000 + (this.context.outputLatency || 0) * 1000, hz: this.frequency.value });
    return startNode.call(this, when);
  };
});
await watch();
await begin(page);
await page.waitForFunction(() => document.querySelector(".practice-progress").textContent === "Note 6 of 15", null, { timeout: 15000 });
await stop(page); await sleep(200);
const clicks = (await page.evaluate(() => window.clicks)).filter((click) => click.hz >= 2500);
const clickRun = await frames();
const firstMove = clickRun.find((frame, index) => index > 0 && frame.left > clickRun[index - 1].left);
// The lanes start a hold time into beat 0, so the first click is beat 1, and beat 4 starts the next bar.
const leftAt = (time) => clickRun.reduce((best, frame) => (Math.abs(frame.at - time) < Math.abs(best.at - time) ? frame : best)).left;
check("no clicks before the lanes start", clicks.length >= 5 && clicks[0].at > firstMove.at, `${Math.round(clicks[0].at - firstMove.at)} ms`);
check("then each lands on a beat", clicks.slice(0, 5).every((click, index) => Math.abs(leftAt(click.at) - (index + 1) * BEAT_PX) < 15), clicks.slice(0, 5).map((click) => Math.round(leftAt(click.at))).join(" "));
check("a bar's first beat is accented", clicks[3].hz === 3200 && clicks[0].hz === 2500);
await page.locator('header .metronome-button').click();

// A recording's markers land on the notes
await freshPractice(page, 120);
await setRecord(page, true);
await followNotes(page, { midis: D });
await begin(page); await waitForText(page, "All", 60000);
await stop(page);
await page.waitForSelector('button:text-is("Start"):not([disabled])');
await nav(page, "Calendar"); await page.waitForSelector(".recording-note"); await sleep(400);
const row = (await page.locator(".day-piece li").first().locator(".info-chip").allInnerTexts()).join(" · ");
check("the Calendar sums the day's scored runs into one line, with no passes or slowest notes", /^\d+ runs, [\d.]+ min · Score: \d+% · \d+ hit, \d+ missed/.test(row) && !row.includes("slowest") && !row.includes("pass"), row);
const times = await page.evaluate(async () => {
  const { getRecording, loadLog } = await import("/src/storage.ts");
  const entry = loadLog().at(-1);
  return (await getRecording(entry.recordingId)).markers.map((marker) => marker.seconds);
});
const markerGaps = times.slice(1).map((time, index) => Math.round((time - times[index]) * 1000));
check("markers sit a beat apart", near(markerGaps, [500], 60), markerGaps.join(" "));
check("the first marker comes with the first note, with no count-in before it", times[0] > -0.1 && times[0] < 0.6, String(times[0]));

// Fullscreen
await freshPractice(page, 120);
await page.click('button[aria-label="Fullscreen"]'); await sleep(300);
check("full screen hides the settings panel", await page.locator(".dock").isHidden());
await followNotes(page, { midis: D });
await begin(page);
await page.waitForFunction(() => document.querySelector(".practice-progress").textContent === "Note 5 of 15", null, { timeout: 15000 });
const left = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
const scale = (await page.locator("canvas").boundingBox()).height / (84 * 4);
check("in fullscreen the lanes keep their pace at the larger scale", Math.abs(left - 4 * 120 * scale) < 120 * scale * 0.5, `${Math.round(left)} of ${Math.round(4 * 120 * scale)}`);
await waitForText(page, "All", 60000); await sleep(150);
const card = await page.locator(".stats").boundingBox();
check("and the score shows on screen", (await page.locator(".stats .score").isVisible()) && card.y >= 0 && card.y + card.height <= 950, JSON.stringify(card));
const screen = page.viewportSize();
check("three quarters wide, under the controls, clear of the bottom", Math.abs(card.width / screen.width - 0.75) < 0.02 && card.height <= screen.height * 0.6 + 1 && card.y + card.height < screen.height - 40 && card.y > (await page.locator(".title-row").boundingBox()).y + 30, JSON.stringify(card));
await page.click(".stats-close"); await sleep(150);
check("and its ✕ closes it, leaving the run as it was", (await page.locator(".stats").innerText()) === "" && (await page.locator('button:text-is("Stop")').count()) === 1);
await page.screenshot({ path: OUT + "follow-fullscreen.png" });
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await stop(page); await sleep(200);

await setLanguage(page, "PT");
await page.locator("header > nav > button").nth(1).click(); await sleep(200);
check("pt: translated", (await page.locator('.dock button:text-is("Seguir em frente")').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
