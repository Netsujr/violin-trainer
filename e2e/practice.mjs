import { wav, note, rest } from "./wav.mjs";
import { begin, laneScore, open, nav, start, stop, sleep, check, progress, freshPractice, canvasHasColor, D_MAJOR, OUT, pickPiece } from "./lib.mjs";

const indexOf = (text) => Number(text.match(/Note (\d+) of/)?.[1] ?? 99);

// Full D major, looped
wav(OUT + "dmajor.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);
{
  const s = await open(OUT + "dmajor.wav");
  await nav(s.page, "Practice");
  await s.page.waitForSelector("canvas");
  await sleep(200);
  await s.page.screenshot({ path: OUT + "practice-idle.png" });
  await start(s.page);
  const t0 = Date.now();
  const steps = [];
  let screenshotted = false;
  while (Date.now() - t0 < 25000) {
    const text = await progress(s.page);
    if (steps.at(-1) !== text) steps.push(text);
    if (!screenshotted && text.startsWith("Note 6")) { await s.page.screenshot({ path: OUT + "practice-mid.png" }); screenshotted = true; }
    if (text.startsWith("All")) break;
    await sleep(20);
  }
  const nums = steps.filter((x) => x.startsWith("Note")).map(indexOf);
  check("D major clears all 15, one step at a time", steps.at(-1) === "All 15 notes done" && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1), steps.at(-1) + " | " + nums.join(","));
  const stats = await laneScore(s.page);
  console.log("  result:", stats);
  check("the lanes' bar shows 15 hits", stats.includes("15 hit"), stats);
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])', { timeout: 3000 }).catch(() => {});
  check("the run ends by itself, offering Start again", (await s.page.locator('button:text-is("Start")').count()) === 1 && (await progress(s.page)) === "All 15 notes done");
  await s.page.screenshot({ path: OUT + "practice-done.png" });
  await sleep(100);
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  console.log("  log:", JSON.stringify(log[0]));
  check("log entry written as it finished", log.length === 1 && log[0].passes === 1 && log[0].notesHit === 15 && log[0].slowest.length === 3);
  await begin(s.page);
  check("Start goes again", (await progress(s.page)).startsWith("Note 1 of") && (await laneScore(s.page)) === "", await progress(s.page));
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Finishing, then stopping
wav(OUT + "ended.wav", [note(62, 3)]);
{
  const s = await open(OUT + "ended.wav");
  await s.page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "one", title: "One", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }] }])));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  await pickPiece(s.page, "one");
  await start(s.page);
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 8000 });
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  check("Start after a finished run starts a new one", (await laneScore(s.page)) === "");
  await stop(s.page);
  await sleep(150);
  check("a run stopped before anything was played isn't logged", (await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")).length)) === 1);
  await s.close();
}
{
  const s = await open(OUT + "ended.wav");
  await s.page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "one", title: "One", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }] }])));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  await pickPiece(s.page, "one");
  await start(s.page);
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 5000 });
  await sleep(300);
  const needle = await s.page.evaluate(() => ({ hidden: document.querySelector(".needle i").hidden, value: document.querySelector(".needle ~ span").textContent, hz: document.querySelector(".tuning > span").textContent }));
  check("finishing clears the needle, even with the note still sounding", needle.hidden && needle.value === "—" && needle.hz === "", JSON.stringify(needle));
  await s.close();
}
{
  const s = await open(OUT + "ended.wav");
  await nav(s.page, "Practice");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(600);
  await pickPiece(s.page, "g-major-2oct");
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  check("changing piece ends the session and logs it under the old piece", log.length === 1 && log[0].pieceTitle === "D (Ré) major" && (await progress(s.page)).endsWith("of 29"), JSON.stringify(log.map((entry) => entry.pieceTitle)));
  await s.close();
}

// Wrong note only, target D4, should never leave note 1
wav(OUT + "wrong.wav", [note(63, 3), note(61, 3)]);
{
  const s = await open(OUT + "wrong.wav");
  await nav(s.page, "Practice");
  await start(s.page);
  await sleep(6000);
  check("wrong notes never advance", (await progress(s.page)).startsWith("Note 1 of"), await progress(s.page));
  await s.close();
}

// The mic hears the target the whole time, which mustn't count while the reference sounds.
wav(OUT + "e4.wav", [note(64, 5)]);
{
  const s = await open(OUT + "e4.wav");
  await nav(s.page, "Practice");
  const box = await s.page.locator("canvas").boundingBox();
  await s.page.mouse.click(box.x + 130 + 120 + 40, box.y + 2.5 * 84);
  await sleep(600);
  await s.page.click('button:text-is("Play reference")');
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  const during = await progress(s.page);
  check("the target doesn't count while the reference sounds", during.startsWith("Note 2 of"), during);
  await s.page.click('button:text-is("Stop reference")');
  await sleep(800);
  const after = await progress(s.page);
  check("it counts once the reference stops", after.startsWith("Note 3 of"), after);
  await s.close();
}

// The ring that shows a note filling up
wav(OUT + "c4.wav", [note(60, 6)]);
{
  const s = await open(OUT + "c4.wav");
  await s.page.evaluate(() => localStorage.setItem("settings", JSON.stringify({ holdMs: 500 })));
  await freshPractice(s.page);
  await pickPiece(s.page, "c-major-1oct");
  const green = () => canvasHasColor(s.page, 76, 208, 125);
  check("no hold ring before playing", !(await green()));
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(320);
  check("the hold ring appears while the note is held", (await green()) && (await progress(s.page)).startsWith("Note 1 of"), await progress(s.page));
  await s.close();
}

// No Skip, and the reference doesn't advance
wav(OUT + "silent.wav", [rest(3)]);
{
  const s = await open(OUT + "silent.wav");
  await nav(s.page, "Practice");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  check("there's no Skip button", (await s.page.locator('button:text-is("Skip")').count()) === 0);
  await s.page.click('button:text-is("Play reference")');
  await sleep(200);
  check("Play reference does not advance", (await progress(s.page)).startsWith("Note 1 of"));
  await s.page.click('button:text-is("Stop reference")');
  await stop(s.page);
  await s.close();
}

// A repeated note on one long bow, via an imported piece D4 D4 E4
wav(OUT + "longbow.wav", [note(62, 4)]);
{
  const s = await open(OUT + "longbow.wav");
  await s.page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "r", title: "Repeat", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }, { pitch: "D4", string: "D", finger: "0" }, { pitch: "E4", string: "D", finger: "1" }] }])));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Library");
  await s.page.locator(".piece", { hasText: "Repeat" }).locator('button[aria-label="Practice"]').click();
  await start(s.page);
  await sleep(1000);
  const during = await progress(s.page);
  check("one long bow clears only the first repeated note", during.startsWith("Note 2 of 3"), during);
  await sleep(4500);
  const after = await progress(s.page);
  check("the loop's restart click counts as fresh bow only after a real gap", after.startsWith("Note 2 of 3") || after.startsWith("Note 3 of 3"), after);
  await s.close();
}
wav(OUT + "bowed.wav", [note(62, 1), rest(0.15), note(62, 1), rest(0.15), note(64, 1), rest(1)]);
{
  const s = await open(OUT + "bowed.wav");
  await s.page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "r", title: "Repeat", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }, { pitch: "D4", string: "D", finger: "0" }, { pitch: "E4", string: "D", finger: "1" }] }])));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Library");
  await s.page.locator(".piece", { hasText: "Repeat" }).locator('button[aria-label="Practice"]').click();
  await start(s.page);
  await sleep(8000);
  check("a fresh bow stroke clears the repeated note", (await progress(s.page)) === "All 3 notes done", await progress(s.page));
  await s.close();
}
