import { wav, note } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, OUT } from "./lib.mjs";

const LANES = ["E", "A", "D", "G"];
const HIT_X = 130, SPACING = 120, LANE_HEIGHT = 84;
const progress = (page) => page.locator("section > p").first().innerText();
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
  await page.locator("select").selectOption("d-major-1oct");
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
  check("Start plays from the picked note, and it can be hit", (await progress(page)) === "Note 7 of 15", await progress(page));

  await page.locator(".highway-scroll").evaluate((e) => (e.scrollLeft = 14 * 120));
  await sleep(200);
  await clickTile(page, 14, "D");
  check("clicking while running jumps there", (await progress(page)) === "Note 15 of 15", await progress(page));
  await page.click('button:text-is("Skip")');
  check("a partial run finishes", (await progress(page)) === "All 15 notes done", await progress(page));
  const stats = await page.locator(".stats").innerText();
  check("stats call it a partial run", stats.includes("Note 15 to the end done in") && stats.includes("1 hit, 1 skipped"), stats.replaceAll("\n", " / "));
  await page.click('button:text-is("Play again")');
  check("Play again returns to the picked note", (await progress(page)) === "Note 15 of 15", await progress(page));
  await stop(page);
  await sleep(100);
  check("Stop keeps the picked note", (await progress(page)) === "Note 15 of 15", await progress(page));
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  check("a partial run isn't logged as a pass", log.length === 1 && log[0].passes === 0 && log[0].averagePassSeconds === null && log[0].notesHit === 1 && log[0].notesSkipped === 1, JSON.stringify(log[0]));
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

  const values = await page.locator("select option").evaluateAll((options) => options.map((o) => [o.value, o.textContent]));
  const twoOctaves = values.find(([, title]) => title === "G major")[0];
  await page.locator("select").selectOption(twoOctaves);
  check("changing piece goes back to note 1", (await progress(page)).startsWith("Note 1 of"), await progress(page));
  const count = Number((await progress(page)).match(/of (\d+)/)[1]);
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
  await page.locator('label:has-text("Staff") input').uncheck();
  check("the Staff switch hides it", await page.locator(".staff").isHidden());
  await page.locator('label:has-text("Staff") input').check();
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
