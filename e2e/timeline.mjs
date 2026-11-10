import { wav, note } from "./wav.mjs";
import { laneScore, begin, open, nav, start, stop, sleep, check, followNotes, progress, D_MAJOR, OUT, pickPiece } from "./lib.mjs";

const LANES = ["E", "A", "D", "G"];
const HIT_X = 130, SPACING = 120, LANE_HEIGHT = 84;
const scrollLeft = (page) => page.locator(".highway-scroll").evaluate((e) => e.scrollLeft);

// Clicks a spot on the canvas, given the note slot and string lane, at the current scroll position.
async function clickTile(page, noteIndex, string) {
  const box = await page.locator("canvas").boundingBox();
  const x = HIT_X + noteIndex * SPACING - (await scrollLeft(page));
  await page.mouse.click(box.x + x, box.y + (LANES.indexOf(string) + 0.5) * LANE_HEIGHT);
}
const currentOnStaff = (page) =>
  page.locator(".staff .vf-stavenote").evaluateAll((notes) => notes.findIndex((n) => n.classList.contains("current")));

wav(OUT + "silent.wav", [{ seconds: 3 }]);
wav(OUT + "b4.wav", [note(71, 3)]);

// Stopped: scroll, pick a start point, miss a tile
{
  const s = await open(OUT + "silent.wav");
  const page = s.page;
  await nav(page, "Practice");
  await pickPiece(page, "d-major-1oct");
  check("a new screen starts at note 1", (await progress(page)) === "Note 1 of 15", await progress(page));

  const before = await page.locator("canvas").evaluate((c) => c.toDataURL());
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.move(box.x + 500, box.y + 100);
  await page.mouse.wheel(360, 0);
  await sleep(300);
  check("the wheel scrolls the timeline", (await scrollLeft(page)) > 0, String(await scrollLeft(page)));
  check("the canvas repaints when scrolled", (await page.locator("canvas").evaluate((c) => c.toDataURL())) !== before);
  check("scrolling alone doesn't move the current note", (await progress(page)) === "Note 1 of 15");
  await page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 0));
  await sleep(100);

  await clickTile(page, 3, "A"); // Note 4 is on the D string, so this is an empty spot.
  check("clicking an empty spot does nothing", (await progress(page)) === "Note 1 of 15", await progress(page));

  await clickTile(page, 5, "A");
  check("clicking a tile moves the start point", (await progress(page)) === "Note 6 of 15", await progress(page));
  check("the staff marks the same note", (await currentOnStaff(page)) === 5, String(await currentOnStaff(page)));
  await sleep(1000);
  check("the view moves that note to the hit line", Math.abs((await scrollLeft(page)) - 5 * SPACING) <= 1, String(await scrollLeft(page)));
  await s.close();
}

// Running from the picked note, then jumping and finishing a partial run
{
  const s = await open(OUT + "b4.wav");
  const page = s.page;
  await nav(page, "Practice");
  await clickTile(page, 5, "A");
  await sleep(1000);
  await start(page);
  await page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  const finishing = await open(OUT + "silent.wav");
  await nav(finishing.page, "Practice");
  await finishing.page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 14 * 120));
  await sleep(200);
  await clickTile(finishing.page, 14, "D");
  await followNotes(finishing.page, { midis: D_MAJOR });
  await start(finishing.page);
  await finishing.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 8000 });
  await finishing.page.waitForSelector('button:text-is("Start"):not([disabled])');
  await finishing.page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 0));
  await sleep(150);
  await clickTile(finishing.page, 3, "D");
  check("clicking a note after a run has ended picks where the next starts", (await progress(finishing.page)) === "Note 4 of 15" && (await laneScore(finishing.page)) === "" && (await finishing.page.locator('button:text-is("Start")').count()) === 1, await progress(finishing.page));
  await finishing.close();
  check("Start plays from the picked note, and it can be hit", (await progress(page)) === "Note 7 of 15", await progress(page));

  await page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 14 * 120));
  await sleep(200);
  await clickTile(page, 14, "D");
  check("clicking while running jumps there", (await progress(page)) === "Note 15 of 15", await progress(page));
  await stop(page);
  await sleep(200);
  await followNotes(page, { midis: D_MAJOR });
  await start(page);
  await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 8000 });
  check("a partial run finishes", (await progress(page)) === "All 15 notes done", await progress(page));
  const stats = await laneScore(page);
  check("the lanes' bar calls it a partial run", stats.includes("Note 15 to the end done in") && stats.includes("1 hit"), stats);
  await page.waitForSelector('button:text-is("Start"):not([disabled])');
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  const partial = log.at(-1);
  check("a partial run isn't logged as a pass", log.length === 2 && partial.passes === 0 && partial.averagePassSeconds === null && partial.notesHit >= 1 && partial.notesSkipped === 0, JSON.stringify(partial));
  await begin(page);
  check("Start goes again from the picked note", (await progress(page)) === "Note 15 of 15", await progress(page));
  await stop(page);
  await sleep(100);
  check("Stop keeps the picked note", (await progress(page)) === "Note 15 of 15", await progress(page));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Keyboard, and the whole piece on the staff
{
  const s = await open(OUT + "silent.wav");
  const page = s.page;
  await nav(page, "Practice");
  await page.locator(".highway-scroll").evaluate((e) => { e.scrollLeft = 2 * 120; e.focus(); });
  await sleep(100);
  await page.keyboard.press("Enter");
  check("Enter picks the note at the hit line", (await progress(page)) === "Note 3 of 15", await progress(page));

  const values = await page.locator(".piece-menu button[value]").evaluateAll((items) => items.map((item) => [item.value, item.textContent]));
  const twoOctaves = values.find(([, title]) => title === "G (Sol) major (2 octaves)")[0];
  await pickPiece(page, twoOctaves);
  check("changing piece goes back to note 1", (await progress(page)).startsWith("Note 1 of"), await progress(page));
  const count = Number((await progress(page)).match(/of (\d+)/)[1]);
  const closed = await page.locator(".staff").evaluate((el) => ({ staves: el.querySelectorAll(".vf-stave").length, notes: el.querySelectorAll(".vf-stavenote").length, scrolls: el.scrollWidth > el.clientWidth }));
  check("the closed staff is one long line of every note", closed.staves === 1 && closed.notes === count && closed.scrolls, JSON.stringify(closed));
  await page.click(".staff-toggle");
  await sleep(200);
  const staff = await page.locator(".staff").evaluate((el) => {
    const box = el.getBoundingClientRect();
    // Glyph boxes include the font's tall line box, so the vertical check uses each notehead's baseline.
    const notes = [...el.querySelectorAll(".vf-stavenote")].map((n) => n.getBoundingClientRect());
    const baselines = [...el.querySelectorAll(".vf-notehead text")].map((t) => Number(t.getAttribute("y")));
    const height = Number(el.querySelector("svg").getAttribute("viewBox").split(" ")[3]);
    return {
      notes: notes.length,
      staves: el.querySelectorAll(".vf-stave").length,
      inside: notes.every((n) => n.left >= box.left && n.right <= box.right) && baselines.every((y) => y > 0 && y < height),
      width: box.width,
      section: el.parentElement.getBoundingClientRect().width,
      svg: el.querySelector("svg").getBoundingClientRect().width,
    };
  });
  check("the staff shows every note in the piece", staff.notes === count, `${staff.notes} of ${count}`);
  check("a long piece breaks onto more lines", staff.staves >= 2, JSON.stringify(staff));
  check("every note is inside the staff box", staff.inside);
  check("the staff fills the page width", staff.width === staff.section && staff.svg >= staff.width - 17, JSON.stringify(staff));
  await page.screenshot({ path: OUT + "practice-gmajor.png", fullPage: true });
  const red = await page.locator(".staff .vf-stavenote.current .vf-notehead text").evaluate((t) => getComputedStyle(t).fill);
  check("the current note is red on the staff", red === "rgb(176, 48, 32)", red);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
