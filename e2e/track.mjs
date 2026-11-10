// Backing tracks: added from a Library card with their beat found, lined up in Align by dragging the waveform under the
// lanes and by hand, then switched on in Practice to play along, with the mic optional.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, progress, laneScore, followNotes, savedLog, answer, OUT } from "./lib.mjs";

const BEAT_PX = 120;
const SILENT = OUT + "track-silent.wav";
const CLICKS = OUT + "track-clicks-100.wav";
wav(SILENT, [rest(3)]);
// A click on every beat at 100 BPM, the first at 2 s.
wav(CLICKS, [rest(2), ...Array.from({ length: 40 }, () => [{ hz: 1500, seconds: 0.03, wave: "sine" }, rest(0.57)]).flat()]);

const s = await open(SILENT);
const { page } = s;
// The page makes its own audio element, so this keeps hold of it to read where it's got to, and counts asks for the mic.
await page.addInitScript(() => {
  window.micAsks = 0;
  const ask = MediaDevices.prototype.getUserMedia;
  MediaDevices.prototype.getUserMedia = function (...args) {
    window.micAsks++;
    return ask.apply(this, args);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.trackAudio = this;
    return play.call(this);
  };
});
await page.reload(); await page.waitForSelector("nav button");
const field = (label) => page.locator(`.track-align-panel input[aria-label="${label}"]`);
const lanes = () => page.evaluate(() => ({ media: window.trackAudio.currentTime, left: document.querySelector(".highway-scroll").scrollLeft }));
// Where the lanes should be for where the recording has got to.
const expected = async ({ media }) => Math.max(0, ((media - Number(await field("First note at (s)").inputValue())) * Number(await field("BPM").inputValue())) / 60) * BEAT_PX;
const card = () => page.locator(".piece", { hasText: "Hot Cross Buns" });
const cardButtons = () => card().evaluate((row) => [...row.querySelectorAll("button.icon-button")].map((button) => button.ariaLabel).join());
const alignPanel = (text) => page.locator(".track-align-panel button", { hasText: text });

// Adding one from its card
await nav(page, "Library"); await sleep(250);
check("each card has a small upload button, and nothing else for tracks", (await cardButtons()) === "Practice,Download PDF,Add a backing track", await cardButtons());
const chooser = page.waitForEvent("filechooser");
await card().locator('button[aria-label="Add a backing track"]').click();
await (await chooser).setFiles(CLICKS);
await page.waitForSelector(".track-align-panel .track-align-title", { timeout: 15000 });
check("choosing a file finds its beat and opens it to line up", (await page.locator(".track-align-title").innerText()).startsWith("Aligning track-clicks-100.wav") && (await field("BPM").inputValue()) === "100" && (await field("First note at (s)").inputValue()) === "2");
check("with the track's controls in place of Options, and the waveform under the lanes", (await page.locator(".options").count()) === 0 && (await page.locator(".waveform").isVisible()) && (await progress(page)) === "Note 1 of 17");
check("full speed, and the mic off, to start", (await page.locator(".track-align-panel select").inputValue()) === "1" && !(await page.locator(".track-align-panel label", { hasText: "Listen to my notes" }).locator("input").isChecked()));

// Lining it up
const strip = await page.locator(".waveform").boundingBox();
await page.mouse.move(strip.x + 400, strip.y + 30); await page.mouse.down(); await page.mouse.move(strip.x + 400 - BEAT_PX, strip.y + 30, { steps: 5 }); await page.mouse.up();
check("dragging the waveform a beat to the left moves the first note a beat later", (await field("First note at (s)").inputValue()) === "2.6", await field("First note at (s)").inputValue());
await page.mouse.move(strip.x + 300, strip.y + 30); await page.mouse.down(); await page.mouse.move(strip.x + 300 + BEAT_PX, strip.y + 30, { steps: 5 }); await page.mouse.up();
check("and to the right, back", (await field("First note at (s)").inputValue()) === "2", await field("First note at (s)").inputValue());
await page.click('button:text-is("Start")');
await sleep(4500);
const first = await lanes();
check("playing it, the lanes follow the recording", Math.abs(first.left - (await expected(first))) < 12, `${Math.round(first.left)} for ${Math.round(await expected(first))}`);
check("with the mic left alone", (await page.evaluate(() => window.micAsks)) === 0);
await field("First note at (s)").fill("2.5"); await field("First note at (s)").dispatchEvent("change"); await sleep(200);
const moved = await lanes();
check("typing a first note moves the lanes straight away", Math.abs(moved.left - (await expected(moved))) < 12, `${Math.round(moved.left)} for ${Math.round(await expected(moved))}`);
await page.locator('.track-align-panel button[aria-label="Earlier"]').click();
check("the nudges move it a little", (await field("First note at (s)").inputValue()) === "2.48", await field("First note at (s)").inputValue());
await page.locator(".track-align-panel select").selectOption("0.5"); await sleep(1200);
const slowFrom = await lanes(); await sleep(1000); const slowTo = await lanes();
check("half speed keeps its pitch, and the lanes slow with it", (await page.evaluate(() => window.trackAudio.playbackRate === 0.5 && window.trackAudio.preservesPitch)) && Math.abs(slowTo.left - slowFrom.left - (100 / 60) * BEAT_PX * 0.5) < 15, `${Math.round(slowTo.left - slowFrom.left)} px/s`);
await alignPanel("First note is now").click();
check("First note is now sets it to where the recording is", Math.abs(Number(await field("First note at (s)").inputValue()) - (await page.evaluate(() => window.trackAudio.currentTime))) < 0.3);
await page.screenshot({ path: OUT + "track-align.png" });
await page.click('button:text-is("Stop")'); await sleep(300);
check("Stop pauses it, and nothing is logged", (await page.evaluate(() => window.trackAudio.paused)) && (await savedLog(page)).length === 0);
await alignPanel("Detect again").click();
await page.waitForFunction(() => document.querySelector(".track-align-panel .track-status")?.textContent.startsWith("Found"), null, { timeout: 15000 });
check("Detect again puts back what it found", (await field("First note at (s)").inputValue()) === "2" && (await field("BPM").inputValue()) === "100");
await page.locator(".track-align-panel select").selectOption("1");
await alignPanel("Done").click(); await sleep(300);
check("Done goes back to Library", (await page.locator("main h2").first().innerText()) === "Library");
check("where the card names its track, with buttons to line it up and remove it", (await card().innerText()).includes("♪ track-clicks-100.wav") && (await cardButtons()) === "Practice,Download PDF,Align backing track,Remove backing track", await cardButtons());

// Playing along in Practice
await card().locator('button[aria-label="Practice"]').click(); await sleep(500);
check("Practice offers only a switch for it, on", (await page.locator(".options .track").innerText()).trim() === "Play along with track-clicks-100.wav" && (await page.locator(".options .track input").isChecked()) && (await page.locator(".waveform").count()) === 0);
check("the line says so", (await page.locator(".mode-note").innerText()).startsWith("Plays along with the track"), await page.locator(".mode-note").innerText());
await page.click('button:text-is("Start")'); await sleep(3500);
check("Start plays along, with the lanes moving", (await lanes()).left > 0 && !(await page.evaluate(() => window.trackAudio.paused)));
await page.click('button:text-is("Stop")'); await sleep(300);
await page.locator(".options .track input").uncheck(); await sleep(150);
check("switched off, the piece waits for each note again", (await page.locator(".mode-note").innerText()).startsWith("Waits for each note"));
await page.locator(".options .track input").check(); await sleep(150);
await page.locator(".piece-menu button[value='a-major-1oct']").evaluate((item) => item.click()); await sleep(400);
check("a piece with no track has no switch", (await page.locator(".options .track").innerText()) === "");

// Listening too: scored like "Don't wait", in step with the recording
await nav(page, "Library"); await sleep(250);
await card().locator('button[aria-label="Align backing track"]').click(); await sleep(500);
await page.locator(".track-align-panel label", { hasText: "Listen to my notes" }).locator("input").check(); await sleep(100);
await alignPanel("Done").click(); await sleep(300);
await card().locator('button[aria-label="Practice"]').click(); await sleep(500);
await followNotes(page, { midis: [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62] });
await page.click('button:text-is("Start")');
await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 30000 });
await sleep(200);
const stats = await page.locator(".stats").innerText();
check("with the mic on, playing along is scored", (await laneScore(page)) === "Score: 100% · 17 hit, 0 missed" && stats.includes("17 hit, 0 missed"), stats.replaceAll("\n", " / "));
await page.click('button:text-is("Stop")'); await sleep(300);
check("and logged", (await savedLog(page)).length === 1);

// Removing it
await nav(page, "Library"); await sleep(250);
await card().locator('button[aria-label="Remove backing track"]').click();
check("Remove asks first", (await page.locator("dialog[open]").innerText()).includes('Remove "track-clicks-100.wav" from Hot Cross Buns?'));
await answer(page, "Cancel");
check("and Cancel keeps it", (await cardButtons()).includes("Remove backing track"));
await card().locator('button[aria-label="Remove backing track"]').click();
await answer(page, "Remove backing track"); await sleep(200);
check("Remove takes it away, leaving the upload button", (await cardButtons()) === "Practice,Download PDF,Add a backing track" && !(await card().innerText()).includes("♪"));
await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(300);
check("for good", (await cardButtons()) === "Practice,Download PDF,Add a backing track");

await page.click('.language button:text-is("PT")'); await sleep(250);
check("pt: translated", (await card().locator("button.icon-button").last().getAttribute("aria-label")) === "Adicionar faixa de acompanhamento");
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
