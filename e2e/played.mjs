// The ghost note on the staff: where it sits against the current note, which way its arrow points, and when it shows.
import { wav, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, progress, begin, waitForText, freshPractice, D_MAJOR as D, OUT } from "./lib.mjs";

wav(OUT + "played-silent.wav", [rest(3)]);
const s = await open(OUT + "played-silent.wav");
const { page } = s;
const ghost = () => page.evaluate(() => {
  const group = document.querySelector(".played-note");
  if (!group) return null;
  const head = group.querySelector("ellipse").getBoundingClientRect();
  const current = document.querySelector(".staff .vf-stavenote.current");
  const glyphs = [...current.querySelectorAll(".vf-notehead text")].map((glyph) => glyph.getBoundingClientRect());
  const target = glyphs.reduce((right, glyph) => (glyph.left > right.left ? glyph : right)); // A sharp sits in the same group, to the left.
  return {
    arrow: group.querySelector("text").textContent,
    color: group.querySelector("ellipse").getAttribute("fill"),
    above: Math.round(((target.top + target.height / 2) - (head.top + head.height / 2)) * 10) / 10,
    across: Math.round(head.left + head.width / 2 - (target.left + target.width / 2)),
  };
});
const GREEN = "#14914a", BLUE = "#1f6fd1";
// Plays one fixed pitch whatever the note is, and starts.
const playing = async (midi, bpm) => {
  await freshPractice(page, bpm);
  await followNotes(page, { midis: Array(16).fill(midi) });
  await begin(page);
  await sleep(400);
};

await nav(page, "Practice"); await sleep(250);
check("nothing shows before a run", (await ghost()) === null);

// Target is D4, in the wait mode
await playing(64);
let seen = await ghost();
check("a note too high shows above the target, in blue", seen.above > 3 && seen.color === BLUE, JSON.stringify(seen));
check("with an arrow saying to go down", seen.arrow === "↓", seen.arrow);
check("at the target's position across the staff", Math.abs(seen.across) <= 3, JSON.stringify(seen));
check("and the note doesn't clear", (await progress(page)) === "Note 1 of 15", await progress(page));
const twoUp = seen.above;
await stop(page); await sleep(200);
check("Stop removes it", (await ghost()) === null);

await playing(60);
seen = await ghost();
check("a note too low shows below, with an arrow saying to go up", seen.above < -3 && seen.arrow === "↑" && seen.color === BLUE, JSON.stringify(seen));
check("as far below as a tone up was above, one position each way", Math.abs(seen.above + twoUp) <= 1.5, `${twoUp} / ${seen.above}`);
await stop(page); await sleep(200);

await playing(67);
seen = await ghost();
check("further away shows further away", seen.above > twoUp * 2, `${twoUp} / ${seen.above}`);
await stop(page); await sleep(200);

await playing(62.8);
seen = await ghost();
check("a bit out, past the tolerance, still points the way", seen.arrow === "↓" && seen.color === BLUE, JSON.stringify(seen));
await stop(page); await sleep(200);

// Right on it, caught in the moment before the note clears
await freshPractice(page);
await page.click("header summary"); await sleep(150);
await page.locator('label.setting:has-text("Hold time") input').fill("500");
await page.keyboard.press("Escape"); await sleep(150);
await followNotes(page, { midis: Array(16).fill(62.2) });
await begin(page);
for (let tries = 0; tries < 40; tries++) {
  seen = await ghost();
  if (seen?.color === GREEN) break;
  await sleep(20);
}
check("in tune it lands right on the note", seen && Math.abs(seen.above) < 2, JSON.stringify(seen));
check("green, with no arrow", seen?.color === GREEN && seen.arrow === "", JSON.stringify(seen));
await stop(page); await sleep(200);
await page.click("header summary"); await sleep(150);
await page.locator('label.setting:has-text("Hold time") input').fill("200");
await page.keyboard.press("Escape"); await sleep(150);

// An octave off is accepted, so it reads as right
await playing(74);
const octave = await progress(page);
check("an octave up counts, as it does for clearing", octave !== "Note 1 of 15", octave);
await stop(page); await sleep(200);

// Following the scale
await freshPractice(page);
await page.locator(".bpm input").fill("120");
await followNotes(page, { midis: D, delays: { 5: 60000 } });
await page.click('button:text-is("Start")');
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 5 of 15", null, { timeout: 15000 });
await sleep(200);
check("silence shows nothing", (await ghost()) === null);
await stop(page); await sleep(200);

await freshPractice(page);
await page.locator(".staff-toggle").click(); await sleep(300);
await followNotes(page, { midis: D.map((midi, index) => (index === 6 ? midi - 2 : midi)) });
await page.click('button:text-is("Start")');
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 7 of 15", null, { timeout: 15000 });
await sleep(300);
seen = await ghost();
check("on the full sheet it sits at the current note, even on a sharp", seen && Math.abs(seen.across) <= 3 && seen.arrow === "↑", JSON.stringify(seen));
await page.screenshot({ path: OUT + "played-sheet.png", fullPage: true });
await page.locator(".staff-toggle").click(); await sleep(300);
const afterToggle = await ghost();
check("it survives the staff being redrawn", afterToggle && afterToggle.arrow === "↑", JSON.stringify(afterToggle));
await page.screenshot({ path: OUT + "played-line.png", fullPage: true });
await page.click('button[aria-label="Fullscreen"]'); await sleep(400);
const full = await ghost();
check("and shows in fullscreen, where the needle is hidden", full && Math.abs(full.across) <= 6 && full.arrow === "↑", JSON.stringify(full));
await page.screenshot({ path: OUT + "played-fullscreen.png" });
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(300);

// While the reference sounds the mic doesn't count
await page.click('button:text-is("Play reference")'); await sleep(200);
check("the reference hides it", (await ghost()) === null);
await page.click('button:text-is("Stop reference")'); await sleep(300);
await stop(page); await sleep(200);

// At the end
await freshPractice(page);
await page.locator(".bpm input").fill("120");
await followNotes(page, { midis: D, delayMs: 150 });
await page.click('button:text-is("Start")');
await waitForText(page, "All", 20000);
await sleep(150);
check("finishing removes it, even with the note still sounding", await page.evaluate(() => !document.querySelector(".played-note")));
await stop(page); await sleep(200);

// The count-in, and Don't wait
await freshPractice(page);
await page.locator('.options label:has-text("count-in") input').check();
await followNotes(page, { midis: Array(16).fill(62) });
await begin(page);
await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("Starts in"), null, { timeout: 3000 });
await sleep(200);
check("the count-in shows none", (await ghost()) === null);
await stop(page); await sleep(200);
await page.locator('.options label:has-text("count-in") input').uncheck();

await freshPractice(page);
await page.locator('button[aria-label="Don\'t wait"]').click(); await sleep(100);
await page.locator(".bpm input").fill("120");
await followNotes(page, { midis: D.map((midi) => midi + 2) });
await page.click('button:text-is("Start")');
await page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 3 of 15", null, { timeout: 15000 });
await sleep(150);
seen = await ghost();
check("Don't wait shows it too, moving with the notes", seen && seen.arrow === "↓" && seen.color === BLUE && Math.abs(seen.across) <= 6, JSON.stringify(seen));
await stop(page); await sleep(200);
await page.locator('button[aria-label="Don\'t wait"]').click(); await sleep(100);

check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
