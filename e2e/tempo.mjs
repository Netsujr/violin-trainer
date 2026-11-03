// Tempo mode, rhythm patterns and the metronome.
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, seed, followNotes, trackNotes, noteGaps, near, progress, OUT } from "./lib.mjs";

const D = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
const REPEAT = [{ id: "r", title: "Repeat", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }, { pitch: "D4", string: "D", finger: "0" }, { pitch: "E4", string: "D", finger: "1" }] }];
const TWO = [{ id: "two", title: "Two", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }, { pitch: "E4", string: "D", finger: "1" }] }];
const scroll = (page) => page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);

async function practice(file, seeded, player) {
  const s = await open(OUT + file);
  await seed(s.page, seeded);
  await nav(s.page, "Practice");
  await sleep(200);
  if (player) await followNotes(s.page, player);
  return s;
}
const eachNote = (count) => D.flatMap((midi) => Array(count).fill(midi));
const run = async (s) => {
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await trackNotes(s.page);
};
const spyOnClicks = (page) =>
  page.evaluate(() => {
    window.clicks = [];
    const startNode = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) {
      window.clicks.push({ scheduled: performance.now() + (when - this.context.currentTime) * 1000, latency: (this.context.outputLatency || 0) * 1000, hz: this.frequency.value, state: this.context.state });
      return startNode.apply(this, arguments);
    };
  });

wav(OUT + "t-wrong.wav", [note(63, 4)]);
wav(OUT + "t-silent.wav", [rest(3)]);
wav(OUT + "t-bowed.wav", [note(62, 0.85), rest(0.15), note(62, 0.85), rest(0.15), note(64, 2)]);
wav(OUT + "t-long.wav", [note(62, 7)]);
wav(OUT + "t-two.wav", [note(62, 2), note(64, 2.5), rest(1)]);
wav(OUT + "t-clicks.wav", Array.from({ length: 8 }, () => [{ hz: 2500, seconds: 0.02, wave: "sine" }, rest(0.98)]).flat());
wav(OUT + "t-clicked.wav", D.flatMap((m) => [note(m, 0.48), { hz: 2500, seconds: 0.02, wave: "sine" }, note(m, 0.5)]));

// Tempo
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 60 } }, { midis: D });
  await run(s);
  // Frame by frame from inside the page, while notes are still gliding on the beat.
  await s.page.evaluate(() => {
    window.scrolls = [];
    const tick = () => {
      if (document.querySelector("section > p").textContent.startsWith("Note")) window.scrolls.push(document.querySelector(".highway-scroll").scrollLeft);
      requestAnimationFrame(tick);
    };
    tick();
  });
  await sleep(16500);
  const scrolls = await s.page.evaluate(() => window.scrolls);
  const gaps = await noteGaps(s.page);
  check("tempo: 60 BPM moves a note a second", near(gaps.slice(0, -1), [1000]), gaps.join(" "));
  check("tempo: the last note clears straight away", gaps.at(-1) < 500, String(gaps.at(-1)));
  check("tempo: finishes the piece", (await progress(s.page)) === "All 15 notes done", await progress(s.page));
  check("tempo: the glide never jumps back", scrolls.every((value, index) => index === 0 || value >= scrolls[index - 1] - 1));
  check("tempo: the glide passes through in small steps", Math.max(...scrolls.map((value, index) => (index ? value - scrolls[index - 1] : 0))) < 20, `biggest step ${Math.max(...scrolls.map((value, index) => (index ? value - scrolls[index - 1] : 0)))} px over ${scrolls.length} frames`);
  await stop(s.page);
  await sleep(150);
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")).at(-1));
  check("tempo: logged as a pass, with the real hit times", log.passes === 1 && log.notesHit === 15 && log.slowest[0].seconds < 0.6, JSON.stringify(log.slowest));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 120 } }, { midis: D });
  await run(s);
  await sleep(4000);
  const gaps = await noteGaps(s.page);
  check("tempo: 120 BPM moves a note every half second", gaps.length >= 5 && near(gaps, [500]), gaps.join(" "));
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 120 } }, { midis: D, delayMs: 300 });
  await run(s);
  await sleep(5000);
  const gaps = await noteGaps(s.page);
  check("tempo: a player too slow for the tempo stays on whole beats", gaps.length >= 2 && near(gaps, [1000]), gaps.join(" "));
  await s.close();
}
{
  const s = await practice("t-wrong.wav", { settings: { tempoOn: true, bpm: 60 } });
  await run(s);
  await sleep(2500);
  check("tempo: a wrong note waits", (await progress(s.page)) === "Note 1 of 15" && (await scroll(s.page)) === 0);
  await s.close();
}
{
  const s = await practice("t-bowed.wav", { settings: { tempoOn: true, bpm: 60 }, pieces: REPEAT });
  await s.page.locator(".options select").selectOption("r");
  await run(s);
  await sleep(3500);
  check("tempo: a fresh bow just before the beat clears a repeated note", (await progress(s.page)) === "All 3 notes done", await progress(s.page));
  await s.close();
}
{
  const s = await practice("t-long.wav", { settings: { tempoOn: true, bpm: 60 }, pieces: REPEAT });
  await s.page.locator(".options select").selectOption("r");
  await run(s);
  await sleep(3000);
  check("tempo: one long bow doesn't clear a repeated note", (await progress(s.page)) === "Note 2 of 3", await progress(s.page));
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 30 } }, { midis: D });
  await run(s);
  await s.page.waitForFunction(() => document.querySelector(".highway-scroll").scrollLeft > 5);
  await stop(s.page);
  await sleep(400);
  check("tempo: Stop during a glide returns to the start", (await progress(s.page)) === "Note 1 of 15" && (await scroll(s.page)) === 0, String(await scroll(s.page)));
  await start(s.page);
  await s.page.waitForFunction(() => document.querySelector(".highway-scroll").scrollLeft > 5);
  const box = await s.page.locator("canvas").boundingBox();
  await s.page.mouse.click(box.x + 130 + 5 * 120 - (await scroll(s.page)), box.y + 126);
  await sleep(700);
  check("tempo: clicking a note during a glide goes there", (await progress(s.page)) === "Note 6 of 15" && Math.abs((await scroll(s.page)) - 600) <= 1);
  await s.page.click('button:text-is("Skip")');
  await sleep(500);
  check("tempo: Skip moves on", (await progress(s.page)) === "Note 7 of 15" && Math.abs((await scroll(s.page)) - 720) <= 1);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  const s = await practice("t-silent.wav", {});
  const slider = s.page.locator(".bpm input");
  await slider.focus();
  await s.page.keyboard.press("ArrowRight");
  check("BPM moves in single steps", (await s.page.locator(".bpm output").innerText()) === "61 BPM");
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  check("BPM survives a reload", (await s.page.locator(".bpm output").innerText()) === "61 BPM");
  await s.close();
}

// Patterns
const buttons = (page) => page.locator(".patterns button");
{
  const s = await practice("t-silent.wav", {});
  check("five patterns, the first chosen", (await buttons(s.page).count()) === 5 && (await s.page.locator('.patterns button[aria-pressed="true"]').innerText()) === "1");
  check("pattern 1 is as written", (await progress(s.page)) === "Note 1 of 15");
  const staffFacts = () => s.page.evaluate(() => { const staff = document.querySelector(".staff"); return { notes: staff.querySelectorAll(".vf-stavenote").length, beams: staff.querySelectorAll(".vf-beam").length }; });
  await buttons(s.page).nth(1).click();
  await sleep(150);
  check("pattern 2 holds each note", (await progress(s.page)) === "Note 1 of 15" && (await staffFacts()).beams === 0);
  await buttons(s.page).nth(3).click();
  await sleep(150);
  let facts = await staffFacts();
  check("pattern 4 plays each note six times, with one beam a bar", (await progress(s.page)) === "Note 1 of 90" && facts.notes === 90 && facts.beams === 15, JSON.stringify(facts));
  await buttons(s.page).nth(4).click();
  await sleep(150);
  facts = await staffFacts();
  check("pattern 5 has two beams a bar", facts.notes === 90 && facts.beams === 30, JSON.stringify(facts));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  check("the pattern survives a reload", (await s.page.locator('.patterns button[aria-pressed="true"]').innerText()) === "5");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await buttons(s.page).nth(0).click();
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  check("changing pattern ends a running session", (await progress(s.page)) === "Note 1 of 15");
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
for (const [label, count, pattern, ms, expected] of [
  ["pattern 2", 1, 1, 7500, [2000]],
  ["pattern 3", 1, 2, 14000, [4000]],
  ["pattern 4", 6, 3, 9000, [500, 500, 500, 1000, 1000, 500]],
  ["pattern 5", 6, 4, 9000, [500, 500, 1000, 500, 500, 1000]],
]) {
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 60, pattern } }, { midis: eachNote(count) });
  await run(s);
  await sleep(ms);
  const gaps = await noteGaps(s.page);
  check(`${label} keeps its rhythm`, gaps.length >= 2 && near(gaps, expected), gaps.join(" "));
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: false, bpm: 60, pattern: 1 } }, { midis: D });
  await run(s);
  await sleep(6500);
  const gaps = await noteGaps(s.page);
  check("with tempo off, a pattern note is held for nearly its full length", gaps.length >= 2 && near(gaps, [1850], 120), gaps.join(" "));
  await s.close();
}
{
  const s = await practice("t-long.wav", { settings: { tempoOn: true, bpm: 60, pattern: 3 } });
  await run(s);
  await sleep(6000);
  check("patterns don't ask for a detectable bow change, only the next pitch stops it", (await progress(s.page)) === "Note 7 of 90", await progress(s.page));
  await s.close();
}
{
  const s = await practice("t-two.wav", { settings: { tempoOn: true, bpm: 60, pattern: 1 }, pieces: TWO });
  await s.page.locator(".options select").selectOption("two");
  await run(s);
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 12000 });
  const stats = await s.page.locator(".stats").innerText();
  check("a finished pattern says so", stats.includes("Pattern 2 done in") && stats.includes("2 hit"), stats.replaceAll("\n", " / "));
  await stop(s.page);
  await sleep(150);
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")).at(-1));
  check("a pattern isn't timed as a pass", log.passes === 0 && log.averagePassSeconds === null && log.notesHit === 2, JSON.stringify(log));
  await s.close();
}

{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, bpm: 60, pattern: 3 } }, { midis: eachNote(6), delays: { 3: 150 } });
  await run(s);
  await sleep(4300);
  const gaps = await noteGaps(s.page);
  check("one eighth note 150 ms late stays on the beat", gaps.length >= 4 && near(gaps, [500, 500, 500, 1000, 1000]), gaps.join(" "));
  await s.close();
}

// Metronome
{
  const s = await practice("t-silent.wav", { settings: { bpm: 60 } });
  await spyOnClicks(s.page);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  check("metronome: silent when off", (await s.page.evaluate(() => window.clicks.length)) === 0);
  await s.page.locator('.options label:has-text("Metronome") input').check();
  await sleep(5500);
  await stop(s.page);
  await sleep(300);
  const clicks = await s.page.evaluate(() => window.clicks);
  const audible = clicks.map((click) => click.scheduled + click.latency);
  const gaps = audible.slice(1).map((time, index) => Math.round(time - audible[index]));
  check("metronome: steady clicks on the beat", clicks.length >= 4 && near(gaps, [1000], 15), gaps.join(" "));
  check("metronome: accents every fourth click", clicks.every((click, index) => click.hz === (index % 4 ? 2500 : 3200)), clicks.map((click) => click.hz).join(" "));
  check("metronome: the audio is running", clicks.every((click) => click.state === "running"));
  const count = clicks.length;
  await sleep(1500);
  check("metronome: stops with the session", (await s.page.evaluate(() => window.clicks.length)) === count);
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { tempoOn: true, metronomeOn: true, bpm: 60 } }, { midis: D });
  await spyOnClicks(s.page);
  await run(s);
  await sleep(7000);
  const { times, clicks } = await s.page.evaluate(() => ({ times: window.noteTimes, clicks: window.clicks }));
  const audible = clicks.map((click) => click.scheduled + click.latency);
  const offsets = times.map((time) => Math.round(time - audible.reduce((best, click) => (Math.abs(click - time) < Math.abs(best - time) ? click : best))));
  check("metronome: notes land on the clicks", offsets.length >= 3 && offsets.every((offset) => Math.abs(offset) <= 40), offsets.join(" "));
  await s.close();
}
{
  const s = await practice("t-silent.wav", { settings: { metronomeOn: true, bpm: 60 } });
  await spyOnClicks(s.page);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(2600);
  await s.page.locator(".bpm input").fill("120");
  await sleep(2600);
  const clicks = await s.page.evaluate(() => window.clicks.map((click) => click.scheduled));
  const gaps = clicks.slice(1).map((time, index) => Math.round(time - clicks[index]));
  check("metronome: follows the BPM slider mid-run", gaps.includes(1000) && near(gaps.slice(-3), [500], 15), gaps.join(" "));
  await s.close();
}
{
  const s = await practice("t-clicks.wav", { settings: { tempoOn: true, bpm: 60 } });
  await run(s);
  await sleep(5000);
  check("mic: clicks alone never clear a note", (await progress(s.page)) === "Note 1 of 15", await progress(s.page));
  await s.close();
}
{
  const s = await practice("t-clicked.wav", { settings: { tempoOn: true, bpm: 60 } });
  await run(s);
  await sleep(7000);
  const gaps = await noteGaps(s.page);
  check("mic: a click cutting through a note doesn't break the hold", gaps.length >= 4 && near(gaps, [1000]), gaps.join(" "));
  await s.close();
}
