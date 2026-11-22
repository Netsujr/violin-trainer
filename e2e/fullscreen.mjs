// Fullscreen on a computer: what shows, playing in it, and getting back out. Sizes are in screens.mjs.
import { wav, rest } from "./wav.mjs";
import { open, nav, sleep, check, followNotes, progress, begin, waitForText, savedSettings, D_MAJOR as D, OUT, setLanguage } from "./lib.mjs";

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
// The panels as set, with Start or Stop, Hear the note and Exit.
for (const hidden of ["header", ".dock", ".piece-select", ".practice-title h1"]) check(`hides ${hidden}`, await page.locator(hidden).first().isHidden());
for (const shown of ['button:text-is("Start")', ".reference", 'button[aria-label="Exit fullscreen"]', ".practice-progress", "canvas", ".staff"]) check(`keeps ${shown}`, await page.locator(shown).isVisible());
check("Record and the metronome stay, in the title row", (await page.locator('.title-tools button[aria-label="Record"]').isVisible()) && (await page.locator(".title-tools .metronome-button").isVisible()));
check("the lanes grow into the sidebar's room", (await canvasWidth()) > before, `${before} > ${await canvasWidth()}`);
check("the staff keeps the whole sheet, as chosen", (await page.locator(".staff.collapsed").count()) === 0 && (await savedSettings(page)).staffOpen === true);
// The whole sheet is drawn as large as fits, across the panel: with one to four bars to a line, whichever draws it
// largest, or always four. The scale's four bars fit one line, so 4 bars a line is never the smaller.
const sheet = () => page.locator(".staff-panel .staff svg").evaluate((svg) => ({ width: Math.round(svg.getBoundingClientRect().width), room: svg.parentElement.clientWidth, height: Math.round(svg.getBoundingClientRect().height), lines: new Set([...svg.querySelectorAll(".vf-stave")].map((stave) => Math.round(stave.getBoundingClientRect().top))).size }));
const filled = await sheet();
await page.click('.sheet-fill:text-is("Fill the screen")'); await sleep(300);
const four = await sheet();
check("4 bars a line keeps the scale's four bars on one line, across the panel, never smaller than Fill the screen", four.lines === 1 && four.room - four.width <= 2 && filled.height >= four.height && (await savedSettings(page)).sheetFill === false, `${JSON.stringify(filled)} vs ${JSON.stringify(four)}`);
await page.click('.sheet-fill:text-is("4 bars a line")'); await sleep(300);
check("and fits inside the panel", await page.locator(".staff-panel .staff").evaluate((box) => box.scrollHeight <= box.clientHeight));

// Playing, with a switch out and back in the middle
await followNotes(page, { midis: D, delayMs: 300 });
await begin(page);
await page.waitForFunction(() => /^Note [3-9] of/.test(document.querySelector(".practice-progress").textContent), null, { timeout: 15000 });
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
check("the sidebar and the lanes' width are back", (await page.locator("header").isVisible()) && (await canvasWidth()) === before);
check("the settings panel is back", await page.locator(".dock").isVisible());
check("the full sheet is back", (await page.locator(".staff.collapsed").count()) === 0);
await enter();
await page.evaluate(() => document.exitFullscreen()); await sleep(300);
check("leaving through the browser ends it too", !(await isFullscreen()) && (await canvasWidth()) === before);

// Phones that don't offer it: the same layout, in the page
await page.evaluate(() => { Element.prototype.requestFullscreen = undefined; });
await enter();
check("without browser fullscreen, the layout still applies", (await isFullscreen()) && !(await page.evaluate(() => document.fullscreenElement)) && (await page.locator("header").isHidden()));
await page.keyboard.press("Escape"); await sleep(200);
check("and Esc still leaves it", !(await isFullscreen()) && (await page.locator("header").isVisible()));

await page.reload(); await page.waitForSelector("nav button");
await nav(page, "Practice"); await sleep(250);
check("leaving full screen puts Record and the metronome back in the sidebar", (await page.locator('header button[aria-label="Record"]').isVisible()) && (await page.locator("header .metronome-button").isVisible()));
check("a reload starts in the normal layout", !(await isFullscreen()) && (await canvasWidth()) === before);
check("the sheet's fill choice shows only in full screen", await page.locator(".sheet-fill").isHidden());
await setLanguage(page, "PT");
check("pt: the button is translated", (await page.locator('button[aria-label="Tela cheia"]').count()) === 1);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
