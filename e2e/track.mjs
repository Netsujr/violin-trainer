// Backing tracks: added from a Library card with their beat found, lined up in Align by dragging the waveform under the
// lanes and by hand, then switched on in Practice to play along, with the mic optional.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, progress, laneScore, followNotes, savedLog, answer, OUT, setLanguage, laneScale, showGroup } from "./lib.mjs";

// A beat's width on screen, once the lanes are drawn at their panel's scale.
let BEAT_PX = 120;
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
const cardButtons = () => card().evaluate((row) => [...row.querySelectorAll(".card-button")].map((button) => button.textContent).join());
const alignPanel = (text) => page.locator(".track-align-panel button", { hasText: text });

// Adding one from its card
await nav(page, "Library"); await showGroup(page, "Classic tunes"); await sleep(250);
check("each card has Add track, and nothing else for tracks", (await cardButtons()) === "Practise,PDF,Add track", await cardButtons());
const chooser = page.waitForEvent("filechooser");
await card().locator('button:text-is("Add track")').click();
await (await chooser).setFiles(CLICKS);
await page.waitForSelector(".track-align-panel .track-align-title", { timeout: 15000 });
check("choosing a file finds its beat and opens it to line up", (await page.locator(".track-align-title").innerText()).startsWith("Aligning track-clicks-100.wav") && (await field("BPM").inputValue()) === "100" && (await field("First note at (s)").inputValue()) === "2");
BEAT_PX = 120 * (await laneScale(page));
check("with the track's controls above the panels, the waveform under the lanes, and no settings panel", (await page.locator(".track-align-panel").isVisible()) && (await page.locator(".lanes-panel .highway ~ .waveform").isVisible()) && (await page.locator(".dock").count()) === 0 && (await progress(page)) === "Note 1 of 17");
check("at full speed to start", (await page.locator(".track-align-panel .speed input").inputValue()) === "100" && (await page.locator(".track-align-panel .speed output").innerText()) === "Speed 100%");

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
await page.locator(".track-align-panel .speed input").fill("50"); await sleep(1200);
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
await page.locator(".track-align-panel .speed input").fill("100");
await alignPanel("Done").click(); await sleep(300);
check("Done goes back to Library", (await page.locator(".library h1").count()) === 1);
check("where the card names its track, with buttons to line it up and remove it", (await card().innerText()).includes("♪ track-clicks-100.wav") && (await cardButtons()) === "Practise,PDF,Line up,Remove track", await cardButtons());

// Playing along in Practice
await card().locator('button:text-is("Practise")').click(); await sleep(500);
const playAlong = () => page.locator('.dock button:text-is("Play along")');
const ear = () => page.locator('.dock button:text-is("Listen to my notes")');
const paceShown = () => page.locator('.dock button[aria-label^="Pace: "]').isVisible();
check("Practice puts its switches in the settings panel: playing along on, the mic off", (await playAlong().isVisible()) && (await playAlong().getAttribute("aria-pressed")) === "true" && (await ear().getAttribute("aria-pressed")) === "false" && (await page.locator(".waveform").count()) === 0);
check("and its speed, in the title row, stands in for the sidebar's BPM", (await page.locator(".title-tools .speed").isVisible()) && !(await page.locator("header .metronome-button").isVisible()) && (await page.locator(".title-tools .speed output").innerText()) === "Speed 100%");
check("the track sets the pace, so Pace is hidden", !(await paceShown()));
await page.click('button:text-is("Start")'); await sleep(3500);
check("Start plays along, with the lanes moving", (await lanes()).left > 0 && !(await page.evaluate(() => window.trackAudio.paused)));
await page.click('button:text-is("Stop")'); await sleep(300);
const along = await savedLog(page);
check("a play-along with the mic off logs its minutes, as played along", along.length === 1 && along[0].playedAlong === true && along[0].minutes > 0 && along[0].score === undefined, JSON.stringify(along));
await playAlong().click(); await sleep(150);
check("switched off, Pace and the BPM are back", (await paceShown()) && (await page.locator("header .metronome-button").isVisible()));
await playAlong().click(); await sleep(150);
await page.locator(".piece-menu button[value='a-major-1oct']").evaluate((item) => item.click()); await sleep(400);
check("a piece with no track has no switches for one", !(await playAlong().isVisible()) && !(await ear().isVisible()));

// Listening too: scored like Keep moving, in step with the recording
await nav(page, "Library"); await sleep(250);
await card().locator('button:text-is("Practise")').click(); await sleep(500);
await ear().click(); await sleep(100);
await followNotes(page, { midis: [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62] });
await page.click('button:text-is("Start")');
await page.waitForFunction(() => document.querySelector(".practice-progress").textContent.startsWith("All"), null, { timeout: 30000 });
await sleep(200);
check("with the mic on, playing along is scored", (await laneScore(page)) === "Score: 100% · 17 hit, 0 missed", await laneScore(page));
await page.click('button:text-is("Stop")'); await sleep(300);
check("and logged", (await savedLog(page)).length === 2);

// Removing it
await nav(page, "Library"); await sleep(250);
await card().locator('button:text-is("Remove track")').click();
check("Remove asks first", (await page.locator("dialog[open]").innerText()).includes('Remove "track-clicks-100.wav" from Hot Cross Buns?'));
await answer(page, "Cancel");
check("and Cancel keeps it", (await cardButtons()).includes("Remove track"));
await card().locator('button:text-is("Remove track")').click();
await answer(page, "Remove track"); await sleep(200);
check("Remove takes it away, leaving Add track", (await cardButtons()) === "Practise,PDF,Add track" && !(await card().innerText()).includes("♪"));
await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await showGroup(page, "Classic tunes"); await sleep(300);
check("for good", (await cardButtons()) === "Practise,PDF,Add track");

await setLanguage(page, "PT");
check("pt: translated", (await card().locator(".card-button").last().innerText()) === "Adicionar faixa");
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
