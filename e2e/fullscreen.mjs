// Fullscreen on a computer: what shows, playing in it, and getting back out. Sizes are in screens.mjs.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, followNotes, progress, begin, waitForText, savedSettings, D_MAJOR as D, OUT } from "./lib.mjs";

wav(OUT + "fullscreen-silent.wav", [rest(3)]);
const s = await open(OUT + "fullscreen-silent.wav", undefined, { viewport: { width: 1440, height: 900 } });
const { page } = s;
const enter = async () => { await page.click('button[aria-label="Fullscreen"]'); await sleep(300); };
const exit = async () => { await page.click('button[aria-label="Exit fullscreen"]'); await sleep(300); };
const canvasWidth = () => page.locator("canvas").evaluate((canvas) => Math.round(canvas.getBoundingClientRect().width));
const isFullscreen = () => page.evaluate(() => document.documentElement.classList.contains("fullscreen"));

await nav(page, "Practice"); await sleep(250);
await page.click(".staff-toggle"); await sleep(200);
const before = await canvasWidth();
await enter();
check("uses the browser's own fullscreen", await page.evaluate(() => !!document.fullscreenElement));
for (const hidden of ["header", ".options", ".tuning", ".patterns", ".section-bar", ".staff-toggle"]) check(`hides ${hidden}`, await page.locator(hidden).first().isHidden());
for (const shown of ['button:text-is("Start")', 'button:text-is("Play reference")', ".bpm input", "section > p", "canvas", ".staff"]) check(`keeps ${shown}`, await page.locator(shown).isVisible());
check("the lanes grow past the normal width", before === 960 && (await canvasWidth()) === 1408, `${before} > ${await canvasWidth()}`);
check("the staff is one moving line, and the saved choice stays open", (await page.locator(".staff.collapsed").count()) === 1 && (await savedSettings(page)).staffOpen === true);
const lines = await page.evaluate(() => { const hit = 130 * Number(getComputedStyle(document.querySelector(".staff-panel")).getPropertyValue("--timeline-scale")), canvas = document.querySelector("canvas").getBoundingClientRect(); return { hit: Math.round(hit), scale: canvas.height / 336 }; });
check("the staff's playhead follows the larger scale", Math.abs(lines.hit - 130 * lines.scale) < 2, JSON.stringify(lines));
await page.locator(".bpm input").fill("90");
check("BPM still works", (await savedSettings(page)).bpm === 90 && (await page.locator(".bpm output").innerText()) === "90 BPM");
await page.locator(".bpm input").fill("60");

// Playing, with a switch out and back in the middle
await followNotes(page, { midis: D, delayMs: 300 });
await begin(page);
await page.waitForFunction(() => /^Note [3-9] of/.test(document.querySelector("section > p").textContent), null, { timeout: 15000 });
await exit();
const during = await progress(page);
check("leaving mid-run keeps the run going", (await page.locator('button:text-is("Stop")').count()) === 1, during);
await enter();
check("and so does coming back", (await page.locator('button:text-is("Stop")').count()) === 1, await progress(page));
const aligned = await page.evaluate(() => { const scroller = document.querySelector(".highway-scroll"), scale = document.querySelector("canvas").getBoundingClientRect().height / 336; return Math.round(scroller.scrollLeft / (120 * scale) * 100) / 100; });
const noteNow = Number((await progress(page)).match(/Note (\d+)/)[1]);
check("the lanes are still on the current note", Math.abs(aligned - (noteNow - 1)) <= 1, `beat ${aligned}, note ${noteNow}`);
await waitForText(page, "All");
await sleep(200);
const card = await page.locator(".stats").boundingBox();
check("the results sit on screen, over the lanes", card && card.x >= 0 && card.y >= 0 && card.x + card.width <= 1440 && card.y + card.height <= 900, JSON.stringify(card));
check("nothing scrolls with the results up", await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
await page.click('button:text-is("Play again")'); await sleep(300);
check("Play again clears them and starts over", (await page.locator(".stats").innerText()) === "" && (await progress(page)).startsWith("Note "), await progress(page));
await page.click('button:text-is("Stop")'); await sleep(200);

// Getting out
await page.keyboard.press("Escape"); await sleep(300);
check("Esc leaves fullscreen", !(await isFullscreen()) && !(await page.evaluate(() => document.fullscreenElement)));
check("the header and page width are back", (await page.locator("header").isVisible()) && (await canvasWidth()) === 960);
check("BPM is back in Options", (await page.locator(".options .bpm").count()) === 1 && (await page.locator(".actions .bpm").count()) === 0);
check("the full sheet is back", (await page.locator(".staff.collapsed").count()) === 0);
await enter();
await page.evaluate(() => document.exitFullscreen()); await sleep(300);
check("leaving through the browser ends it too", !(await isFullscreen()) && (await canvasWidth()) === 960);

// Phones that don't offer it: the same layout, in the page
await page.evaluate(() => { Element.prototype.requestFullscreen = undefined; });
await enter();
check("without browser fullscreen, the layout still applies", (await isFullscreen()) && !(await page.evaluate(() => document.fullscreenElement)) && (await page.locator("header").isHidden()));
await page.keyboard.press("Escape"); await sleep(200);
check("and Esc still leaves it", !(await isFullscreen()) && (await page.locator("header").isVisible()));

await page.reload(); await page.waitForSelector("nav button");
await nav(page, "Practice"); await sleep(250);
check("a reload starts in the normal layout", !(await isFullscreen()) && (await canvasWidth()) === 960);
await page.click('.language button:text-is("PT")'); await sleep(250);
check("pt: the button is translated", (await page.locator('button[aria-label="Tela cheia"]').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
