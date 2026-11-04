import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, progress, OUT } from "./lib.mjs";

const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
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
  const stats = await s.page.locator(".stats").innerText();
  console.log("  stats:", stats.replaceAll("\n", " / "));
  check("stats show 15 hits", stats.includes("15 hit"));
  await s.page.screenshot({ path: OUT + "practice-done.png" });
  await s.page.click('button:text-is("Play again")');
  check("Play again restarts", (await progress(s.page)).startsWith("Note 1 of"), await progress(s.page));
  await stop(s.page);
  await sleep(100);
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  console.log("  log:", JSON.stringify(log[0]));
  check("log entry written", log.length === 1 && log[0].passes === 1 && log[0].notesHit === 15 && log[0].slowest.length === 3);
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
  await s.page.locator("select").selectOption("one");
  await start(s.page);
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 8000 });
  await stop(s.page);
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  await s.page.click('button:text-is("Play again")');
  await s.page.waitForSelector('button:text-is("Stop")');
  check("Play again after Stop starts a new run", (await s.page.locator(".stats").innerText()) === "");
  await stop(s.page);
  await sleep(150);
  check("that made a second log entry", (await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")).length)) === 2);
  await s.close();
}
{
  const s = await open(OUT + "ended.wav");
  await s.page.evaluate(() => localStorage.setItem("pieces", JSON.stringify([{ id: "one", title: "One", source: "imported", notes: [{ pitch: "D4", string: "D", finger: "0" }] }])));
  await s.page.reload();
  await s.page.waitForSelector("nav button");
  await nav(s.page, "Practice");
  await s.page.locator("select").selectOption("one");
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
  await s.page.locator("select").selectOption("g-major-2oct");
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  check("changing piece ends the session and logs it under the old piece", log.length === 1 && log[0].pieceTitle === "D major" && (await progress(s.page)).endsWith("of 29"), JSON.stringify(log.map((entry) => entry.pieceTitle)));
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
