// Loop, repeating a scale's top note, the steady reference tone, and the line that says which of them is on.
import { wav, note, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, progress, OUT } from "./lib.mjs";

const D = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
const D_TOP_TWICE = [62, 64, 66, 67, 69, 71, 73, 74, 74, 73, 71, 69, 67, 66, 64, 62];
wav(OUT + "modes-silent.wav", [rest(3)]);
wav(OUT + "modes-e4.wav", [note(64, 6)]);
const s = await open(OUT + "modes-silent.wav");
const { page } = s;
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
const loop = () => page.locator('button[aria-label="Loop"]');
const top = () => page.locator('button[aria-label="Repeat the top note"]');
const dontWait = () => page.locator('button[aria-label="Don\'t wait"]');
const note_ = () => page.locator(".mode-note").innerText();
const pressed = async (button) => (await button.getAttribute("aria-pressed")) === "true";
const textIs = (text) => page.waitForFunction((text) => document.querySelector("section > p").textContent.includes(text), text, { timeout: 40000 });
const begin = async () => { await page.click('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")'); };
const fresh = async (bpm) => {
  await page.reload(); await page.waitForSelector("nav button"); // Also ends the last run's synthetic player.
  await nav(page, "Practice"); await sleep(250);
  if (bpm) await page.locator(".bpm input").fill(String(bpm));
};
const color = (button) => button.evaluate((element) => getComputedStyle(element).color);
const GREEN = "rgb(76, 208, 125)";

await nav(page, "Practice"); await sleep(250);
check("there's no Skip", (await page.locator('button:text-is("Skip")').count()) === 0);
const order = await page.locator(".actions button").evaluateAll((buttons) => buttons.map((button) => button.ariaLabel ?? button.textContent));
check("the buttons sit together, ending with Fullscreen", order.join() === "Start,Play reference,Loop,Repeat the top note,Don't wait,Fullscreen", order.join());
check("all off to begin with", !(await pressed(loop())) && !(await pressed(top())) && !(await pressed(dontWait())));
check("the line beneath describes that", (await note_()) === "Waits for each note · Plays once · Top note once", await note_());
const below = await page.evaluate(() => document.querySelector(".mode-note").getBoundingClientRect().top >= document.querySelector(".actions").getBoundingClientRect().bottom - 1);
check("and sits beneath the buttons", below);

// The top note
await top().click(); await sleep(250);
check("×2 turns green, and the line says what it does", (await pressed(top())) && (await color(top())) === GREEN && (await note_()).includes("Top note twice, then back down"), await note_());
check("the scale gains one note", (await progress(page)) === "Note 1 of 16" && (await page.locator(".staff .vf-stavenote").count()) === 16, await progress(page));
const middle = await page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.slice(7, 9).map((note) => Math.round(note.getBoundingClientRect().top)));
check("the top note is written twice", middle[0] === middle[1], middle.join());
check("saved", (await saved()).repeatTopOn === true);
await fresh();
check("it stays on after a reload", (await pressed(top())) && (await progress(page)) === "Note 1 of 16");
await followNotes(page, { midis: D_TOP_TWICE, delayMs: 150 });
await begin(); await textIs("All 16 notes done"); await sleep(150);
check("it plays through, with the top note twice", (await page.locator(".stats").innerText()).includes("16 hit"), (await page.locator(".stats").innerText()).replaceAll("\n", " / "));
await stop(page); await sleep(200);
await page.locator(".options select").selectOption("g-major-2oct"); await sleep(250);
check("a longer scale repeats its own top note", (await progress(page)) === "Note 1 of 30", await progress(page));
await page.locator(".options select").selectOption("hot-cross-buns"); await sleep(250);
check("it doesn't apply to a song", (await progress(page)) === "Note 1 of 17" && (await top().isDisabled()) && !(await note_()).includes("Top note"), await note_());
await page.locator(".options select").selectOption("d-major-1oct"); await sleep(250);
await page.locator('.patterns button:text-is("2")').click(); await sleep(250);
check("it works with a pattern", (await progress(page)) === "Note 1 of 16", await progress(page));
await page.locator('.patterns button:text-is("1")').click(); await sleep(200);
await top().click(); await sleep(250);
check("off again, the scale is back to 15", (await progress(page)) === "Note 1 of 15" && (await note_()).includes("Top note once"));

// Loop, waiting for each note
await fresh();
await loop().click(); await sleep(300);
check("Loop turns green, and the line says what it does", (await color(loop())) === GREEN && (await note_()).includes("Loops until you press Stop"), await note_());
await followNotes(page, { midis: D, delayMs: 150 });
await begin();
await textIs("Loop 2");
check("reaching the end goes back to the start, with no results card", (await progress(page)) === "Note 1 of 15 · Loop 2" && (await page.locator(".stats").innerText()) === "" && (await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) === 0, await progress(page));
await textIs("Loop 3");
check("and again", (await progress(page)).startsWith("Note 1 of 15"), await progress(page));
await stop(page); await sleep(200);
const looped = (await page.evaluate(() => JSON.parse(localStorage.getItem("log")))).at(-1);
check("one log entry, with each time round as a pass", looped.passes === 2 && looped.notesHit >= 30, JSON.stringify({ passes: looped.passes, hit: looped.notesHit }));
check("Stop clears the loop count", (await progress(page)) === "Note 1 of 15", await progress(page));

// The last note and the first are the same, so a held note can't carry over the join
await fresh();
await followNotes(page, { midis: D });
await begin();
await textIs("Loop 2");
await sleep(1200);
check("a note held across the join needs a fresh bow", (await progress(page)) === "Note 1 of 15 · Loop 2", await progress(page));
await stop(page); await sleep(200);

// Looping from a picked note
await fresh();
const box = await page.locator("canvas").boundingBox();
await page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 13 * 120)); await sleep(200);
await page.mouse.click(box.x + 130 + 40, box.y + 2.5 * 84); await sleep(500);
await followNotes(page, { midis: D, delayMs: 150 });
await begin();
await textIs("Loop 2");
check("it loops back to the picked note", (await progress(page)).startsWith("Note 14 of 15"), await progress(page));
await loop().click(); await sleep(100);
check("switching off mid-run doesn't stop the run", (await page.locator('button:text-is("Stop")').count()) === 1);
await textIs("All 15 notes done"); await sleep(150);
check("it finishes that time round, with results", (await page.locator(".stats").innerText()).includes("done"));
await stop(page); await sleep(200);

// Loop with Don't wait
await fresh(120);
await loop().click(); await dontWait().click(); await sleep(200);
await page.locator('.options label:has-text("count-in") input').check();
check("the line follows both", (await note_()).startsWith("Keeps moving · Loops until you press Stop"), await note_());
await followNotes(page, { midis: D });
await begin();
await textIs("last 100%");
check("each time round counts in again and shows the last score", (await progress(page)).startsWith("Starts in"), await progress(page));
await textIs("Note 3 of 15");
check("and the next run goes on", (await progress(page)).includes("Loop 2 · last 100%"), await progress(page));

// Fullscreen, while that keeps going
await page.click('button[aria-label="Fullscreen"]'); await sleep(300);
check("in fullscreen the toggles stay, and the line goes", (await loop().isVisible()) && (await top().isVisible()) && (await page.locator(".mode-note").isHidden()));
await textIs("Loop 3");
check("no results card covers the lanes when looping", (await page.locator(".stats .score").count()) === 0);
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await stop(page); await sleep(200);
await dontWait().click(); await loop().click(); await sleep(100);
await page.locator('.options label:has-text("count-in") input').uncheck();

// The reference tone keeps sounding
await fresh();
await page.evaluate(() => {
  window.tones = [];
  const start = OscillatorNode.prototype.start, stop = OscillatorNode.prototype.stop;
  OscillatorNode.prototype.start = function (when) { window.tones.push(this); this.stopped = false; return start.call(this, when); };
  OscillatorNode.prototype.stop = function (when) { this.stopped = true; return stop.call(this, when); };
});
const tone = () => page.evaluate(() => { const tone = window.tones.at(-1); return tone ? { hz: Math.round(tone.frequency.value), stopped: tone.stopped, count: window.tones.length, state: tone.context.state } : null; });
const play = () => page.click('button:text-is("Play reference")');
const off = () => page.click('button:text-is("Stop reference")');
await play(); await sleep(300);
check("pressing it starts the first note's pitch", (await tone()).hz === 294 && (await tone()).state === "running", JSON.stringify(await tone()));
check("the button turns green and offers to stop", (await page.locator('button:text-is("Stop reference")').count()) === 1 && (await color(page.locator('button:text-is("Stop reference")'))) === GREEN);
await sleep(2500);
check("it's still sounding well past the old one second", !(await tone()).stopped, JSON.stringify(await tone()));
await off(); await sleep(100);
check("pressing again stops it", (await tone()).stopped && (await page.locator('button:text-is("Play reference")').count()) === 1);
await play(); await sleep(100);
await page.mouse.click(box.x + 130 + 120 + 40, box.y + 2.5 * 84); await sleep(150);
check("it moves with the current note, without restarting", (await tone()).hz === 330 && !(await tone()).stopped && (await tone()).count === 2, JSON.stringify(await tone()));
await page.locator(".options select").selectOption("a-major-1oct"); await sleep(150);
check("and with the piece", (await tone()).hz === 440, JSON.stringify(await tone()));
await nav(page, "Log"); await sleep(150);
check("leaving Practice stops it", (await tone()).stopped);
await nav(page, "Practice"); await sleep(200);
check("and it reads as off on return", (await page.locator('button:text-is("Play reference")').count()) === 1);

await page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "one", title: "One", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }] }])));
await fresh();
await page.locator(".options select").selectOption("one"); await sleep(200);
await followNotes(page, { midis: [62] });
await begin();
await play(); await sleep(400);
check("while it sounds, what the mic hears doesn't count", (await progress(page)) === "Note 1 of 1", await progress(page));
await off();
await textIs("All 1 notes done");
check("once it stops, it does", true);
await stop(page); await sleep(200);

await page.click('.language button:text-is("PT")'); await sleep(250);
await page.locator("nav button").nth(1).click(); await sleep(200);
const line = await note_();
check("pt: the line and the buttons are translated", line.includes("Espera cada nota") && line.includes("Toca uma vez") && (await page.locator('button:text-is("Ouvir referência")').count()) === 1 && (await page.locator('button[aria-label="Repetir"]').count()) === 1, line);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();

// The 3-beat count-in, as a new visitor gets it
{
  const c = await open(OUT + "modes-silent.wav", undefined, { keepCountIn: true });
  const { page } = c;
  const box_ = () => page.locator('.options label:has-text("count-in") input');
  const showing = () => page.evaluate(() => document.querySelector("section > p").textContent);
  const start_ = async () => { await page.click('button:text-is("Start")'); await page.waitForSelector('button:text-is("Stop")'); };
  const watch = () => page.evaluate(() => {
    window.seen = [];
    const text = document.querySelector("section > p");
    let last = "";
    const tick = () => { if (text.textContent !== last) { last = text.textContent; window.seen.push({ at: performance.now(), text: last }); } requestAnimationFrame(tick); };
    tick();
  });
  await nav(page, "Practice"); await sleep(250);
  check("count-in: on by default, in Options", (await box_().isChecked()) && (await page.locator('.options label:has-text("count-in")').getAttribute("title")).includes("3 beats"));
  await page.locator(".bpm input").fill("120");
  await page.evaluate(() => {
    window.clicks = [];
    const startNode = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) {
      window.clicks.push({ at: performance.now() + (when - this.context.currentTime) * 1000 + (this.context.outputLatency || 0) * 1000, hz: this.frequency.value });
      return startNode.call(this, when);
    };
  });
  await page.locator('.options label:has-text("Metronome") input').check();
  await followNotes(page, { midis: D });
  await watch();
  await start_();
  await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 2 of 15", null, { timeout: 15000 });
  await sleep(60);
  const seen = await page.evaluate(() => window.seen);
  const counted = seen.filter((entry) => entry.text.startsWith("Starts in"));
  check("count-in: counts 3, 2, 1, even waiting for each note", counted.map((entry) => entry.text).join() === "Starts in 3…,Starts in 2…,Starts in 1…", seen.map((entry) => entry.text).join());
  const first = seen.findLast((entry) => entry.text === "Note 1 of 15");
  const clicks = (await page.evaluate(() => window.clicks)).filter((click) => click.hz >= 2500); // Not the test's own player.
  check("count-in: three clicks, and the fourth lands on the first note", clicks.length >= 4 && Math.abs(first.at - clicks[3].at) < 60 && clicks[3].hz === 3200 && clicks[0].hz === 2500, `${Math.round(first.at - clicks[3].at)} ms apart`);
  check("count-in: lasts 3 beats", Math.abs(first.at - counted[0].at - 2000) < 150, `${Math.round(first.at - counted[0].at)} ms`);
  const second = seen.find((entry) => entry.text === "Note 2 of 15");
  check("count-in: what's played during it doesn't count", second.at - first.at > 150, `${Math.round(second.at - first.at)} ms`);
  const box2 = await page.locator("canvas").boundingBox();
  const scroll = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
  await page.mouse.click(box2.x + 130 + 5 * 120 - scroll + 40, box2.y + 1.5 * 84); await sleep(100);
  check("count-in: clicking a note mid-run doesn't pause again", (await showing()).startsWith("Note "), await showing());
  await stop(page); await sleep(200);
  await page.locator('.options label:has-text("Metronome") input').uncheck();

  await page.reload(); await page.waitForSelector("nav button");
  await nav(page, "Practice"); await sleep(250);
  await start_(); await sleep(100);
  check("count-in: Stop during it leaves things as they were", (await showing()).startsWith("Starts in"), await showing());
  await stop(page); await sleep(200);
  check("count-in: and it clears", (await showing()) === "Note 1 of 15", await showing());

  await box_().uncheck();
  check("count-in: saved when switched off", (await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).countInOn)) === false);
  await start_(); await sleep(100);
  check("count-in: off starts on the sheet straight away", (await showing()) === "Note 1 of 15", await showing());
  await stop(page); await sleep(200);
  await page.click('button[aria-label="Don\'t wait"]'); await sleep(100);
  await page.locator(".bpm input").fill("120");
  await watch();
  await start_(); await sleep(1000);
  const lanes = await page.evaluate(() => window.seen.map((entry) => entry.text));
  check("count-in: Don't wait with it off has no countdown", !lanes.some((text) => text.startsWith("Starts in")) && (await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) > 0, lanes.join());
  await stop(page); await sleep(200);
  check("count-in: no page errors", c.problems.length === 0, c.problems.join(" | "));
  await c.close();
}
