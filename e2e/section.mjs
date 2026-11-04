// Selecting a section with click, then Shift+click, on the lanes or the staff: what it shows, and what plays.
import { wav, rest } from "./wav.mjs";
import { open, nav, stop, sleep, check, followNotes, progress, begin, waitForText, freshPractice, savedLog, D_MAJOR as D, OUT } from "./lib.mjs";

const BEAT = 120, HIT_X = 130, LANE = 84;
wav(OUT + "section-silent.wav", [rest(3)]);
const s = await open(OUT + "section-silent.wav");
const { page } = s;
const stats = () => page.locator(".stats").innerText();
const line = () => page.locator(".mode-note").innerText();
const bands = () => page.locator(".staff .section-band").count();
const scrollLeft = () => page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);
// Clicks a D-major tile by its note index (the first eight notes run D D D D A A A A up the lanes).
const laneOf = (index) => ([0, 1, 2, 3, 12, 13, 14].includes(index) ? 2.5 : 1.5);
const clickTile = async (index, shift = false) => {
  const box = await page.locator("canvas").boundingBox();
  const inView = (position) => position > 0 && position < box.width;
  if (!inView(HIT_X + index * BEAT - (await scrollLeft()) + 40)) {
    await page.locator(".highway-scroll").evaluate((e, left) => (e.scrollLeft = left), index * BEAT);
    await sleep(150);
  }
  const x = box.x + HIT_X + index * BEAT - (await scrollLeft()) + 40, y = box.y + laneOf(index) * LANE;
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up("Shift");
  await sleep(500);
};
const clickStaffNote = async (index, shift = false) => {
  await page.locator(".staff .vf-stavenote").nth(index).evaluate((note) => scrollBy({ top: note.getBoundingClientRect().top - innerHeight / 2, behavior: "instant" }));
  const center = await page.locator(".staff .vf-stavenote").nth(index).locator(".vf-notehead").evaluate((head) => { const box = head.getBoundingClientRect(); return { x: box.right - 6, y: box.top + box.height / 2 }; });
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up("Shift");
  await sleep(500);
};
const pixel = (x, y) => page.locator("canvas").evaluate((canvas, [x, y]) => {
  const ratio = canvas.width / canvas.getBoundingClientRect().width;
  return [...canvas.getContext("2d").getImageData(x * ratio, y * ratio, 1, 1).data].slice(0, 3).join();
}, [x, y]);

await nav(page, "Practice"); await sleep(250);
const plain = await pixel(HIT_X + 60, 20);
await clickTile(2);
check("a plain click still just moves the start", (await progress(page)) === "Note 3 of 15" && (await bands()) === 0 && !(await line()).includes("Section"), await progress(page));
await clickTile(4, true);
check("Shift+click selects from there", (await progress(page)) === "Note 3 of 15" && (await line()).startsWith("Section: notes 3 to 5"), await line());
check("the staff highlights those notes", (await bands()) === 3, String(await bands()));
await sleep(500);
const inside = await pixel(HIT_X + 60, 20), outside = await pixel(HIT_X + 4.5 * BEAT, 20);
check("the lanes highlight them too, and not the rest", inside !== plain && outside === plain, `${plain} / ${inside} / ${outside}`);
check("Shift+click doesn't select the page's text", (await page.evaluate(() => getSelection().toString())) === "");
check("and doesn't draw a focus ring round the lanes", await page.locator(".highway-scroll").evaluate((e) => !e.matches(":focus-visible")));
await page.screenshot({ path: OUT + "section-closed.png", fullPage: true });

await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "All 3 notes done"); await sleep(150);
check("Start plays only the section, and stops at its end", (await stats()).includes("Notes 3 to 5 done in") && (await stats()).includes("3 hit"), (await stats()).replaceAll("\n", " / "));
check("the view stays on the section's last note", Math.abs((await scrollLeft()) - 4 * BEAT) <= 1, String(await scrollLeft()));
const onStaff = await page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.findIndex((note) => note.classList.contains("current")));
check("and so does the staff", onStaff === 4, String(onStaff));
await page.click('button:text-is("Play again")'); await sleep(150);
check("Play again repeats the section", (await progress(page)) === "Note 3 of 15" && (await stats()) === "", await progress(page));
await waitForText(page, "All 3 notes done");
await stop(page); await sleep(250);
check("Stop keeps the section", (await progress(page)) === "Note 3 of 15" && (await bands()) === 3, await progress(page));
let entry = (await savedLog(page)).at(-1);
check("a section isn't logged as a pass", entry.passes === 0 && entry.averagePassSeconds === null && entry.notesHit >= 3, JSON.stringify({ passes: entry.passes, hit: entry.notesHit }));

await clickTile(5, true);
check("Shift+click again moves its end, from the same first note", (await line()).startsWith("Section: notes 3 to 6"), await line());
await clickTile(1, true);
check("and selecting backwards works", (await line()).startsWith("Section: notes 2 to 3") && (await progress(page)) === "Note 2 of 15", await line());
await clickTile(1);
check("a plain click clears it", !(await line()).includes("Section") && (await bands()) === 0 && (await progress(page)) === "Note 2 of 15", await line());
const cleared = await pixel(HIT_X + 60, 20);
check("from the lanes too", cleared === plain, cleared);

// A section starting on note 1 still isn't a whole pass
await freshPractice(page);
await clickTile(0); await clickTile(1, true);
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "All 2 notes done"); await sleep(150);
check("a section from note 1 isn't called a pass", (await stats()).includes("Notes 1 to 2 done") && !(await stats()).includes("Pass"), (await stats()).replaceAll("\n", " / "));
await stop(page); await sleep(200);
entry = (await savedLog(page)).at(-1);
check("nor logged as one", entry.passes === 0);

// A whole run after clearing goes to the end
await clickTile(13);
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "All 15 notes done");
check("with it cleared, a run goes to the end", (await stats()).includes("Note 14 to the end"), (await stats()).replaceAll("\n", " / "));
await stop(page); await sleep(200);

// Loop
await freshPractice(page);
await page.locator('button[aria-label="Loop"]').click();
await clickTile(2); await clickTile(3, true);
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "Loop 2");
check("Loop repeats only the section", (await progress(page)).startsWith("Note 3 of 15"), await progress(page));
await waitForText(page, "Loop 3");
check("again and again", (await progress(page)).startsWith("Note 3 of 15"), await progress(page));
await stop(page); await sleep(200);
await page.locator('button[aria-label="Loop"]').click(); await sleep(100);

// Selecting mid-run
await freshPractice(page);
await followNotes(page, { midis: D, delays: { 1: 60000, 3: 60000, 4: 60000 } });
await begin(page);
await clickTile(2);
check("during a run, a click jumps there", (await progress(page)) === "Note 3 of 15", await progress(page));
await clickTile(3, true);
check("and Shift+click sets the section right away", (await line()).startsWith("Section: notes 3 to 4") && (await page.locator('button:text-is("Stop")').count()) === 1, await line());
await stop(page); await sleep(200);

// Don't wait
await freshPractice(page, 120);
await page.locator('button[aria-label="Don\'t wait"]').click(); await sleep(100);
await clickTile(4); await clickTile(6, true);
await followNotes(page, { midis: D });
await begin(page);
await waitForText(page, "All 3 notes done"); await sleep(200);
check("Don't wait scores only the section", (await stats()).includes("Score: 100%") && (await stats()).includes("3 hit, 0 missed"), (await stats()).replaceAll("\n", " / "));
check("the lanes stop at its end", Math.abs((await scrollLeft()) - 7 * BEAT) <= 2, String(await scrollLeft()));
await stop(page); await sleep(200);
await page.locator('button[aria-label="Don\'t wait"]').click(); await sleep(100);

// Tempo
await freshPractice(page);
await page.locator('.options label:has-text("Tempo") input').check();
await clickTile(0); await clickTile(2, true);
await followNotes(page, { midis: D, delayMs: 150 });
await begin(page);
await waitForText(page, "All 3 notes done"); await sleep(150);
check("Tempo stops at the section's end too, with no glide past it", (await stats()).includes("3 hit") && Math.abs((await scrollLeft()) - 2 * BEAT) <= 2, String(await scrollLeft()));
await stop(page); await sleep(200);
await page.locator('.options label:has-text("Tempo") input').uncheck();

// The staff
await freshPractice(page);
await clickStaffNote(5);
check("clicking a note on the staff starts from it", (await progress(page)) === "Note 6 of 15", await progress(page));
await sleep(600);
await clickStaffNote(7, true);
check("Shift+click on the staff selects, as on the lanes", (await line()).startsWith("Section: notes 6 to 8") && (await bands()) === 3, await line());
check("still with no text selected", (await page.evaluate(() => getSelection().toString())) === "");
await page.locator(".staff").evaluate((staff) => getComputedStyle(staff).cursor).then((cursor) => check("the staff shows it can be clicked", cursor === "pointer", cursor));
await page.locator(".staff-toggle").click(); await sleep(300);
check("the arrow still just opens the sheet, keeping the section", (await page.locator(".staff.collapsed").count()) === 0 && (await bands()) === 3 && (await progress(page)) === "Note 6 of 15", await progress(page));
await page.screenshot({ path: OUT + "section-open.png", fullPage: true });
await clickStaffNote(10);
check("clicking on the full sheet works", (await progress(page)) === "Note 11 of 15" && (await bands()) === 0, await progress(page));
const clef = await page.locator(".staff .vf-clef").first().boundingBox();
await page.mouse.click(clef.x + 5, clef.y + clef.height / 2); await sleep(300);
check("clicking the clef does nothing", (await progress(page)) === "Note 11 of 15", await progress(page));

await page.locator(".options select").selectOption("g-major-2oct"); await sleep(300);
const rows = await page.locator(".staff .vf-stave").count();
await clickStaffNote(3);
await clickStaffNote(26, true);
check("a section can wrap across the sheet's lines", rows >= 2 && (await bands()) === 24 && (await line()).startsWith("Section: notes 4 to 27"), `${rows} lines, ${await bands()} bands, ${await line()}`);
const wrapped = await page.locator(".staff .section-band").evaluateAll((bands) => new Set(bands.map((band) => band.getAttribute("y"))).size);
check("with its highlight on each line", wrapped === rows, `${wrapped} of ${rows}`);
await page.screenshot({ path: OUT + "section-wrapped.png", fullPage: true });

// Changing the piece
await page.locator(".options select").selectOption("d-major-1oct"); await sleep(300);
check("changing the piece clears it", (await bands()) === 0 && !(await line()).includes("Section"), await line());
await page.locator(".staff-toggle").click(); await sleep(300);
await clickTile(0); await clickTile(1, true);
await page.locator('.patterns button:text-is("2")').click(); await sleep(300);
check("so does changing the pattern", (await bands()) === 0, String(await bands()));
await page.locator('.patterns button:text-is("1")').click(); await sleep(300);
await clickTile(0); await clickTile(1, true);
await page.locator('button[aria-label="Repeat the top note"]').click(); await sleep(300);
check("and repeating the top note", (await bands()) === 0 && (await progress(page)) === "Note 1 of 16", await progress(page));
await page.locator('button[aria-label="Repeat the top note"]').click(); await sleep(300);

// Fullscreen, and the other screens
await page.click('button[aria-label="Fullscreen"]'); await sleep(400);
await clickStaffNote(2);
await clickStaffNote(4, true);
check("the staff can be clicked in fullscreen", (await bands()) === 3 && (await progress(page)) === "Note 3 of 15", await progress(page));
await page.click('button[aria-label="Exit fullscreen"]'); await sleep(300);
check("and the section survives leaving it", (await bands()) === 3);
await page.click('.language button:text-is("PT")'); await sleep(250);
await page.locator("nav button").nth(1).click(); await sleep(250);
await clickTile(0); await clickTile(1, true);
check("pt: translated", (await line()).startsWith("Trecho: notas 1 a 2"), await line());
await page.click('.language button:text-is("EN")'); await sleep(200);
await nav(page, "Listen"); await sleep(200);
const listenStaff = await page.locator(".staff").evaluate((staff) => getComputedStyle(staff).cursor);
check("the staff on Listen isn't clickable", listenStaff !== "pointer", listenStaff);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();
