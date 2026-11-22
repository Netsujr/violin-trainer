// Loop, repeating a scale's top note, and the violin reference note, from the settings panel and the title row.
import { wav, rest } from "./wav.mjs";
import { laneScore, open, nav, stop, sleep, check, followNotes, progress, begin, waitForText, freshPractice, savedLog, savedSettings, D_MAJOR as D, OUT, pickPiece, setCountIn, setBpm, spyOnRecordings, recordings, setLanguage, clickLanes, laneScale } from "./lib.mjs";

const D_TOP_TWICE = [62, 64, 66, 67, 69, 71, 73, 74, 74, 73, 71, 69, 67, 66, 64, 62];
wav(OUT + "modes-silent.wav", [rest(3)]);
const s = await open(OUT + "modes-silent.wav");
const { page } = s;
// Each choice in the settings panel, by its group and its words.
const choice = (group, name) => page.locator(`.dock [aria-label="${group}"] button:text-is("${name}")`);
const loop = () => choice("Repeat", "Loop");
const once = () => choice("Repeat", "Once");
const top = () => choice("Top note", "Twice");
const topOnce = () => choice("Top note", "Once");
const dontWait = () => choice("Pace", "Keep moving");
const waitForMe = () => choice("Pace", "Wait for me");
const paceHint = () => page.locator('.dock-option:has([aria-label="Pace"]) .dock-caption').innerText();
const pressed = async (button) => (await button.getAttribute("aria-pressed")) === "true";

await nav(page, "Practice"); await sleep(250);
check("there's no Skip", (await page.locator('button:text-is("Skip")').count()) === 0);
const order = await page.locator(".title-tools button:visible").evaluateAll((buttons) => buttons.map((button) => button.ariaLabel ?? button.textContent));
check("the title row has Change piece, Hear the note, Full screen, then Start", order.join() === "Change piece,Hear the note,Fullscreen,Start", order.join());
check("each choice starts on its first, in words", (await pressed(once())) && (await pressed(topOnce())) && (await pressed(waitForMe())));
check("with a line saying what waiting does", (await paceHint()) === "Each note waits until you play it", await paceHint());

// The top note
await top().click(); await sleep(250);
check("Twice is picked", (await pressed(top())) && !(await pressed(topOnce())));
check("the scale gains one note", (await progress(page)) === "Note 1 of 16" && (await page.locator(".staff .vf-stavenote").count()) === 16, await progress(page));
const middle = await page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.slice(7, 9).map((note) => Math.round(note.getBoundingClientRect().top)));
check("the top note is written twice", middle[0] === middle[1], middle.join());
check("saved", (await savedSettings(page)).repeatTopOn === true);
await freshPractice(page);
check("it stays on after a reload", (await pressed(top())) && (await progress(page)) === "Note 1 of 16");
await followNotes(page, { midis: D_TOP_TWICE, delayMs: 150 });
await begin(page); await waitForText(page, "All 16 notes done"); await sleep(150);
check("it plays through, with the top note twice", (await laneScore(page)).includes("16 hit"), await laneScore(page));
await stop(page); await sleep(200);
await pickPiece(page, "g-major-2oct"); await sleep(250);
check("a longer scale repeats its own top note", (await progress(page)) === "Note 1 of 30", await progress(page));
await pickPiece(page, "hot-cross-buns"); await sleep(250);
check("it doesn't apply to a song, which hides it", (await progress(page)) === "Note 1 of 17" && (await top().isHidden()));
const patterns = page.locator('.dock [aria-label="Pattern"]');
check("rhythm patterns are for scales, so a song hides them", await patterns.isHidden());
await pickPiece(page, "d-major-1oct"); await sleep(250);
check("and a scale shows them again", await patterns.isVisible());
await patterns.locator('button:text-is("2")').click(); await sleep(250);
check("it works with a pattern", (await progress(page)) === "Note 1 of 16", await progress(page));
await patterns.locator('button:text-is("1")').click(); await sleep(200);
await topOnce().click(); await sleep(250);
check("Once again, the scale is back to 15", (await progress(page)) === "Note 1 of 15");

// Loop, waiting for each note
await freshPractice(page);
await loop().click(); await sleep(300);
check("Loop is picked", (await pressed(loop())) && !(await pressed(once())));
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "Loop 2");
check("reaching the end goes back to the start, with no results card", (await progress(page)) === "Note 1 of 15 · Loop 2" && (await page.locator(".stats").innerText()) === "" && (await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) === 0, await progress(page));
await waitForText(page, "Loop 3");
check("and again", (await progress(page)).startsWith("Note 1 of 15"), await progress(page));
await stop(page); await sleep(200);
const looped = (await savedLog(page)).at(-1);
check("one log entry, with each time round as a pass", looped.passes === 2 && looped.notesHit >= 30, JSON.stringify({ passes: looped.passes, hit: looped.notesHit }));
check("Stop clears the loop count", (await progress(page)) === "Note 1 of 15", await progress(page));

// The last note and the first are the same, so a held note can't carry over the join
await freshPractice(page);
await followNotes(page, { midis: D });
await begin(page);
await waitForText(page, "Loop 2");
await sleep(1200);
check("a note held across the join needs a fresh bow", (await progress(page)) === "Note 1 of 15 · Loop 2", await progress(page));
await stop(page); await sleep(200);

// Looping from a picked note
await freshPractice(page);
const box = await page.locator("canvas").boundingBox();
await page.locator(".highway-scroll").evaluate((e, left) => (e.scrollLeft = left), 13 * 120 * (await laneScale(page))); await sleep(200);
await clickLanes(page, 130 + 40, 2.5 * 84); await sleep(500);
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "Loop 2");
check("it loops back to the picked note", (await progress(page)).startsWith("Note 14 of 15"), await progress(page));
await once().click(); await sleep(100);
check("switching to Once mid-run doesn't stop the run", (await page.locator('button:text-is("Stop")').count()) === 1);
await waitForText(page, "All 15 notes done"); await sleep(150);
check("it finishes that time round, with results", (await laneScore(page)).includes("done"), await laneScore(page));
await stop(page); await sleep(200);

// Loop with Keep moving
await freshPractice(page, 120);
// A count-in set doesn't apply with Keep moving, which hides it, so it's set first.
await setCountIn(page, 4);
await loop().click(); await dontWait().click(); await sleep(200);
check("Keep moving says what it does, and hides the count-in and Glide, which don't apply", (await page.locator(".count-in").isHidden()) && (await page.locator('.dock button:text-is("Glide")').isHidden()) && (await paceHint()) === "Follow along and get a score at the end", await paceHint());
await followNotes(page, { midis: D });
await begin(page);
await waitForText(page, "last 100%");
check("each time round waits for the first note again and shows the last score", (await progress(page)).startsWith("Note 1 of 15"), await progress(page));
await waitForText(page, "Note 3 of 15");
check("and the next run goes on", (await progress(page)).includes("Loop 2 · last 100%"), await progress(page));

// Fullscreen, while that keeps going
await page.click('button[aria-label="Fullscreen"]'); await sleep(300);
check("in fullscreen the settings panel goes, and Start stays", (await page.locator(".dock").isHidden()) && (await page.locator('button:text-is("Stop")').isVisible()));
await waitForText(page, "Loop 3");
check("no results card covers the lanes when looping", (await page.locator(".stats .score").count()) === 0);
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(200);
await stop(page); await sleep(200);
await waitForMe().click(); await once().click(); await sleep(100);
await setCountIn(page, 0);

// The reference: a real violin note, which keeps sounding
await freshPractice(page);
await spyOnRecordings(page);
const tone = async () => (await recordings(page)).at(-1) ?? null;
const reference = () => page.locator(".reference");
const play = () => reference().click();
const off = () => reference().click();
await play(); await sleep(300);
check("pressing it bows the first note's pitch on a violin", (await tone())?.midi === 62 && (await tone()).state === "running", JSON.stringify(await tone()));
check("Hear the note is pressed while it sounds", await pressed(reference()));
await sleep(2500);
check("it's still sounding well past its recording's length, looping", !(await tone()).stopped && (await tone()).loop, JSON.stringify(await tone()));
await off(); await sleep(100);
check("pressing again stops it", (await tone()).stopped && !(await pressed(reference())));
await play(); await sleep(300);
await clickLanes(page, 130 + 120 + 40, 2.5 * 84); await sleep(300);
const moved = await recordings(page);
check("it moves with the current note, bowing the new one", moved.at(-1).midi === 64 && !moved.at(-1).stopped && moved.at(-2).stopped, JSON.stringify(moved));
await pickPiece(page, "a-major-1oct"); await sleep(300);
check("and with the piece", (await tone()).midi === 69, JSON.stringify(await tone()));
await nav(page, "Calendar"); await sleep(150);
check("leaving Practice stops it", (await tone()).stopped);
await nav(page, "Practice"); await sleep(200);
check("and it reads as off on return", !(await pressed(reference())));

await page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "one", title: "One", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }] }])));
await freshPractice(page);
await pickPiece(page, "one"); await sleep(200);
await followNotes(page, { midis: [62] });
await begin(page);
await play(); await sleep(400);
check("while it sounds, what the mic hears doesn't count", (await progress(page)) === "Note 1 of 1", await progress(page));
await off();
await waitForText(page, "All 1 notes done");
check("once it stops, it does", true);
await stop(page); await sleep(200);

await setLanguage(page, "PT");
await page.locator("header > nav > button").nth(1).click(); await sleep(200);
const dock = await page.locator(".dock").innerText();
check("pt: the settings panel and the buttons are translated", dock.includes("Esperar por mim") && dock.includes("Uma vez") && dock.includes("Repetir") && (await page.locator('.reference:text-is("Ouvir a nota")').count()) === 1, dock.replaceAll("\n", " ").slice(0, 160));
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();

// The count-in, one bar of 4 beats as a new visitor gets it
{
  const c = await open(OUT + "modes-silent.wav", undefined, { keepCountIn: true });
  const { page } = c;
  const countIn = () => page.locator(".count-in .stepper-value");
  const showing = () => page.evaluate(() => document.querySelector(".practice-progress").textContent);
  // Logs the text the moment the app sets it. Anything later, even a MutationObserver, also counts the time to draw that frame.
  const watch = () => page.evaluate(() => {
    window.seen = [];
    const text = document.querySelector(".practice-progress");
    const { get, set } = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    let last = get.call(text);
    window.seen.push({ at: performance.now(), text: last });
    Object.defineProperty(text, "textContent", {
      configurable: true,
      get() { return get.call(this); },
      set(value) {
        if (value !== last) { last = value; window.seen.push({ at: performance.now(), text: value }); }
        set.call(this, value);
      },
    });
  });
  await nav(page, "Practice"); await sleep(250);
  check("count-in: on by default, 4 beats, in the settings panel", (await countIn().innerText()) === "4 beats");
  await setBpm(page, 120);
  await page.evaluate(() => {
    window.clicks = [];
    const startNode = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) {
      window.clicks.push({ at: performance.now() + (when - this.context.currentTime) * 1000 + (this.context.outputLatency || 0) * 1000, hz: this.frequency.value });
      return startNode.call(this, when);
    };
  });
  await page.locator('header .metronome-button').click();
  await followNotes(page, { midis: D });
  await watch();
  await begin(page);
  await page.waitForFunction(() => document.querySelector(".practice-progress").textContent === "Note 2 of 15", null, { timeout: 15000 });
  await sleep(60);
  const seen = await page.evaluate(() => window.seen);
  const counted = seen.filter((entry) => entry.text.startsWith("Starts in"));
  check("count-in: counts 4, 3, 2, 1, even waiting for each note", counted.map((entry) => entry.text).join() === "Starts in 4…,Starts in 3…,Starts in 2…,Starts in 1…", seen.map((entry) => entry.text).join());
  const first = seen.findLast((entry) => entry.text === "Note 1 of 15");
  const clicks = (await page.evaluate(() => window.clicks)).filter((click) => click.hz >= 2500); // Not the test's own player.
  check("count-in: four clicks, a bar, and the fifth lands on the first note", clicks.length >= 5 && Math.abs(first.at - clicks[4].at) < 60 && clicks[0].hz === 3200 && clicks[1].hz === 2500 && clicks[4].hz === 3200, `${Math.round(first.at - clicks[4].at)} ms apart`);
  check("count-in: lasts 4 beats after the first click's delay", Math.abs(first.at - counted[0].at - 2500) < 150, `${Math.round(first.at - counted[0].at)} ms`);
  const second = seen.find((entry) => entry.text === "Note 2 of 15");
  check("count-in: what's played during it doesn't count", second.at - first.at > 150, `${Math.round(second.at - first.at)} ms`);
  const box2 = await page.locator("canvas").boundingBox();
  const scroll = await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
  await clickLanes(page, 130 + 5 * 120 + 40, 1.5 * 84, scroll); await sleep(100);
  check("count-in: clicking a note mid-run doesn't pause again", (await showing()).startsWith("Note "), await showing());
  await stop(page); await sleep(200);
  await page.locator('header .metronome-button').click();

  await page.reload(); await page.waitForSelector("nav button");
  await nav(page, "Practice"); await sleep(250);
  await begin(page); await sleep(100);
  check("count-in: Stop during it leaves things as they were", (await showing()).startsWith("Starts in"), await showing());
  await stop(page); await sleep(200);
  check("count-in: and it clears", (await showing()) === "Note 1 of 15", await showing());

  await setCountIn(page, 2);
  await watch();
  await begin(page);
  await page.waitForFunction(() => document.querySelector(".practice-progress").textContent === "Note 1 of 15", null, { timeout: 5000 });
  const short = (await page.evaluate(() => window.seen)).map((entry) => entry.text).filter((text) => text.startsWith("Starts in"));
  check("count-in: 2 picked counts 2, 1, and is saved", short.join() === "Starts in 2…,Starts in 1…" && (await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).countInBeats)) === 2, short.join());
  await stop(page); await sleep(200);

  await setCountIn(page, 0);
  check("count-in: saved when switched off, and reads Off", (await page.evaluate(() => JSON.parse(localStorage.getItem("settings")).countInOn)) === false && (await countIn().innerText()) === "Off");
  await begin(page); await sleep(100);
  check("count-in: off starts on the sheet straight away", (await showing()) === "Note 1 of 15", await showing());
  await stop(page); await sleep(200);
  await setCountIn(page, 2);
  await dontWait().click(); await sleep(100);
  await setBpm(page, 120);
  await watch();
  await begin(page); await sleep(1000);
  const lanes = await page.evaluate(() => window.seen.map((entry) => entry.text));
  check("count-in: Keep moving never counts in, it waits for the first note", !lanes.some((text) => text.startsWith("Starts in")) && (await page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) === 0 && (await showing()) === "Note 1 of 15", lanes.join());
  await stop(page); await sleep(200);
  check("count-in: no page errors", c.problems.length === 0, c.problems.join(" | "));
  await c.close();
}
