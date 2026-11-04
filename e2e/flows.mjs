// Each user flow on a computer, from start to finish, as a person would do it.
import { chromium } from "playwright-core";
import { wav, note, rest } from "./wav.mjs";
import { nav, start, stop, sleep, check, seed, skipCountIn, trackNotes, noteGaps, progress, OUT } from "./lib.mjs";
const SHOTS = OUT;
const D = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
wav(OUT + "q-scale.wav", [...D.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);
wav(OUT + "q-a4.wav", [note(69, 5)]);
wav(OUT + "q-silent.wav", [rest(3)]);
wav(OUT + "q-open.wav", [55, 62, 69, 76].flatMap((m) => [note(m, 1.5), rest(0.5)]));
async function open(file, { viewport = { width: 1440, height: 900 }, grant = true, profile } = {}) {
  const args = [...(grant ? ["--use-fake-ui-for-media-stream"] : ["--deny-permission-prompts"]), "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${OUT + file}`, "--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch({ channel: "chrome", headless: true, args });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await skipCountIn(context);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  await page.goto("http://localhost:5199/");
  await page.waitForSelector("nav button");
  return { page, context, problems, close: () => browser.close() };
}
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("log") ?? "[]"));
const flow = (name) => console.log(`\n=== ${name}`);

flow("1. First visit");
{
  const s = await open("q-silent.wav");
  check("opens on Listen, in English, nothing started", (await s.page.locator('nav button[aria-current="page"]').innerText()) === "Listen" && (await s.page.locator(".big-note").innerText()) === "Press Start and play");
  check("no recording, no log yet", (await log(s.page)).length === 0);
  await s.page.screenshot({ path: SHOTS + "1-listen.png" });
  for (const name of ["Practice", "Library", "Log"]) { await nav(s.page, name); await sleep(250); await s.page.screenshot({ path: `${SHOTS}1-${name}.png` }); }
  const empty = await s.page.locator("section").innerText();
  check("an empty Log reads sensibly", empty.includes("This week") && !empty.includes("undefined") && !empty.includes("NaN"), empty.replaceAll("\n", " | ").slice(0, 160));
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("2. Listen: playing the open strings");
{
  const s = await open("q-open.wav");
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  const seen = []; const t0 = Date.now();
  while (Date.now() - t0 < 7800) { const big = await s.page.locator(".big-note").innerText(); if (seen.at(-1) !== big) seen.push(big); await sleep(20); }
  check("each string shows, with silence between", ["Sol3 / G3", "Ré4 / D4", "Lá4 / A4", "Mi5 / E5"].every((n) => seen.includes(n)) && seen.includes("Listening…"), seen.join(" > "));
  const trail = await s.page.locator("section > p").last().innerText();
  check("recent notes list what was played", trail.includes("Sol3 (G)") && trail.includes("Mi5 (E)"), trail);
  await stop(s.page); await sleep(200);
  check("Stop returns to the prompt", (await s.page.locator(".big-note").innerText()) === "Press Start and play");
  const entries = await log(s.page);
  check("logged as Free play, no passes", entries.length === 1 && entries[0].pieceId === "free-play" && entries[0].passes === 0);
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  const s = await open("q-a4.wav");
  const box = (t) => s.page.locator(`label:has-text("${t}") input`);
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")'); await sleep(800);
  check("reads the note", (await s.page.locator(".big-note").innerText()) === "Lá4 / A4");
  await box("Note names").uncheck(); await sleep(150);
  check("Note names off leaves the letter", (await s.page.locator(".big-note").innerText()) === "A4", await s.page.locator(".big-note").innerText());
  await box("Letter names").uncheck(); await sleep(150);
  const both = await s.page.locator(".big-note").innerText();
  check("with both off, the note area isn't broken", !both.includes("false") && !both.includes("undefined"), JSON.stringify(both));
  await box("Note names").check(); await box("Letter names").check();
  await box("Fingers").uncheck(); await sleep(100);
  check("Fingers off hides the position guess", await s.page.locator("section > p").first().isHidden());
  await box("Fingers").check();
  await box("Staff").uncheck(); await sleep(100);
  check("Staff off hides the staff", await s.page.locator(".staff").isHidden());
  await box("Staff").check();
  await s.close();
}

flow("3. The microphone is refused");
{
  const s = await open("q-silent.wav", { grant: false });
  await start(s.page);
  await sleep(1500);
  const warning = await s.page.locator(".warning").innerText().catch(() => "");
  check("says so, and can be tried again", warning.startsWith("Microphone unavailable") && (await s.page.locator('button:text-is("Start")').isEnabled()), warning);
  check("nothing was logged", (await log(s.page)).length === 0);
  await s.page.screenshot({ path: SHOTS + "3-denied.png" });
  await nav(s.page, "Practice"); await sleep(200);
  await start(s.page); await sleep(1500);
  const practice = await s.page.locator(".warning").innerText().catch(() => "");
  check("Practice says so too", practice.startsWith("Microphone unavailable"), practice);
  await s.page.screenshot({ path: SHOTS + "3-denied-practice.png" });
  await s.close();
}

flow("4. Practice: a whole scale, again, and stop");
{
  const s = await open("q-scale.wav");
  await nav(s.page, "Practice"); await sleep(200);
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")');
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 25000 });
  await sleep(300);
  const stats = await s.page.locator(".stats").innerText();
  check("finishes with useful stats", stats.includes("Pass 1 done") && stats.includes("15 hit"), stats.replaceAll("\n", " / "));
  await s.page.screenshot({ path: SHOTS + "4-done.png", fullPage: true });
  await s.page.click('button:text-is("Play again")'); await sleep(900);
  check("Play again goes back to the start, stats cleared, view back", (await s.page.locator(".stats").innerText()) === "" && (await s.page.locator(".highway-scroll").evaluate((e) => e.scrollLeft)) < 240);
  await sleep(10500);
  const again = await s.page.locator(".stats").innerText();
  check("a second pass counts", again.includes("Pass 2 done"), again.replaceAll("\n", " / "));
  await stop(s.page); await sleep(200);
  const entry = (await log(s.page)).at(-1);
  check("one log entry with two passes", entry.passes === 2 && entry.notesHit === 30 && entry.averagePassSeconds > 5, JSON.stringify({ passes: entry.passes, hit: entry.notesHit, per: entry.averagePassSeconds }));
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("5. Practice: the reference tone");
{
  const s = await open("q-silent.wav");
  await nav(s.page, "Practice"); await sleep(200);
  await s.page.click('button:text-is("Play reference")'); await sleep(150);
  check("Play reference works before starting, and doesn't start anything", (await progress(s.page)) === "Note 1 of 15" && (await s.page.locator('button:text-is("Start")').count()) === 1 && (await s.page.locator('button:text-is("Stop reference")').count()) === 1);
  await s.page.click('button:text-is("Stop reference")'); await sleep(100);
  check("and it turns off again", (await s.page.locator('button:text-is("Play reference")').count()) === 1);
  await s.close();
}

flow("6. Moving between screens during a session");
{
  const s = await open("q-a4.wav");
  await nav(s.page, "Practice"); await sleep(200);
  await s.page.locator('.options label:has-text("Record") input').check();
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")'); await sleep(1500);
  await nav(s.page, "Log"); await sleep(600);
  const entries = await log(s.page);
  check("leaving logs the session and keeps the recording", entries.length === 1 && (await s.page.locator("audio").count()) === 1);
  await nav(s.page, "Practice"); await sleep(250);
  check("returning finds it stopped", (await s.page.locator('button:text-is("Start")').count()) === 1);
  // Rapid clicks while starting
  await start(s.page);
  await nav(s.page, "Library"); await nav(s.page, "Listen"); await nav(s.page, "Practice");
  await sleep(800);
  const tracks = await s.page.evaluate(async () => document.querySelectorAll("button").length);
  check("clicking away while starting doesn't break the screen", tracks > 3 && (await s.page.locator('button:text-is("Start"), button:text-is("Stop")').count()) === 1);
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("7. Library: adding a piece, through to practising it");
{
  const s = await open("q-a4.wav");
  await nav(s.page, "Library"); await sleep(200);
  const save = s.page.locator('button:text-is("Save piece")');
  check("Save starts off", await save.isDisabled());
  await s.page.fill("textarea", "A4 A4");
  check("a title is required", await save.isDisabled());
  await s.page.fill('input[placeholder="Title"]', "   ");
  check("a blank title doesn't count", await save.isDisabled());
  await s.page.fill('input[placeholder="Title"]', "My tune");
  check("title plus notes enables Save", await save.isEnabled());
  await s.page.fill("textarea", "A4 nonsense");
  check("a bad note blocks it and says which", (await save.isDisabled()) && (await s.page.locator(".warning").first().innerText()).includes("nonsense"));
  await s.page.fill("textarea", "F3");
  check("a note below the violin is refused", (await save.isDisabled()) && (await s.page.locator(".warning").first().innerText()).includes("below"));
  await s.page.fill("textarea", "La4 Si4 Do5");
  const preview = await s.page.locator("ol li").allInnerTexts();
  check("solfège input works", preview.length === 3 && preview[0].includes("Lá"), preview.join(" ; "));
  await s.page.fill("textarea", "A4 A4 | B4");
  await save.click(); await sleep(150);
  check("the form clears after saving", (await s.page.inputValue("textarea")) === "" && (await s.page.inputValue('input[placeholder="Title"]')) === "");
  const row = s.page.locator(".piece", { hasText: "My tune" });
  check("listed with a note count and Delete", (await row.innerText()).includes("3 notes") && (await row.locator('button:text-is("Delete")').count()) === 1);
  check("built-ins can't be deleted", (await s.page.locator(".piece", { hasText: "D major" }).first().locator('button:text-is("Delete")').count()) === 0);
  await row.locator("select").selectOption("2");
  await s.page.screenshot({ path: SHOTS + "7-library.png", fullPage: true });
  await s.page.reload(); await s.page.waitForSelector("nav button"); await nav(s.page, "Library"); await sleep(200);
  check("it survives a reload, with its target day", (await s.page.locator(".piece", { hasText: "My tune" }).locator("select").inputValue()) === "2");
  await s.page.locator(".piece", { hasText: "My tune" }).locator('button[aria-label="Practice"]').click(); await sleep(300);
  check("Practice opens that piece", (await s.page.locator(".options select").evaluate((select) => select.selectedOptions[0].textContent)) === "My tune" && (await progress(s.page)) === "Note 1 of 3");
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")'); await sleep(1200);
  check("playing it works: the first A clears, the repeat waits for a fresh bow", (await progress(s.page)) === "Note 2 of 3", await progress(s.page));
  await stop(s.page); await sleep(150);
  await nav(s.page, "Log"); await sleep(250);
  const text = await s.page.locator("section").innerText();
  check("Log lists it under Planned and Sessions", text.includes("My tune (Wed)") && text.includes("My tune"), text.replaceAll("\n", " | ").slice(0, 130));
  await nav(s.page, "Library"); await sleep(200);
  await s.page.locator(".piece", { hasText: "My tune" }).locator('button:text-is("Delete")').click(); await sleep(150);
  check("Delete removes it", (await s.page.locator(".piece", { hasText: "My tune" }).count()) === 0);
  await nav(s.page, "Log"); await sleep(250);
  const after = await s.page.locator("section").innerText();
  check("its history stays in the Log, and it leaves Planned", after.includes("My tune") && !after.includes("My tune (Wed)"));
  await nav(s.page, "Practice"); await sleep(250);
  check("Practice no longer offers it", !(await s.page.locator(".options select").innerText()).includes("My tune"));
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("8. Log: recordings");
{
  const s = await open("q-scale.wav");
  await nav(s.page, "Practice"); await sleep(200);
  await s.page.locator('.options label:has-text("Record") input').check();
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")');
  check("Record locks during a session", await s.page.locator('.options label:has-text("Record") input').isDisabled());
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 25000 });
  await stop(s.page);
  await s.page.waitForSelector('button:text-is("Start"):not([disabled])');
  await nav(s.page, "Log"); await s.page.waitForSelector("audio"); await sleep(800);
  await s.page.screenshot({ path: SHOTS + "8-log.png", fullPage: true });
  const audio = s.page.locator("audio");
  check("the player knows its length", await audio.evaluate((a) => Number.isFinite(a.duration) && a.duration > 5));
  const markers = s.page.locator("button.marker");
  check("15 note markers", (await markers.count()) === 15);
  await markers.nth(7).click(); await sleep(400);
  const at = await audio.evaluate((a) => { const t = a.currentTime; a.pause(); return t; });
  check("a marker jumps there and plays", at > 3.5 && at < 6, String(at));
  const [download] = await Promise.all([s.page.waitForEvent("download"), s.page.click("a[download]")]);
  check("Download gives a named file", download.suggestedFilename().startsWith("D major") && download.suggestedFilename().endsWith(".webm"), download.suggestedFilename());
  const storage = await s.page.locator("section > p").filter({ hasText: "Storage" }).innerText();
  check("storage is shown", /Storage used: \d+\.\d MB/.test(storage), storage);
  await s.page.click('button:text-is("Delete recording")'); await sleep(250);
  check("Delete recording removes only the audio", (await s.page.locator("audio").count()) === 0 && (await s.page.locator("section > ul > li").count()) === 1);
  await s.page.reload(); await s.page.waitForSelector("nav button"); await nav(s.page, "Log"); await sleep(400);
  check("still gone after a reload", (await s.page.locator("audio").count()) === 0);
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("9. Settings change how notes are judged");
{
  const s = await open("q-a4.wav");
  await nav(s.page, "Practice"); await sleep(200);
  await s.page.click("header summary"); await sleep(200);
  await s.page.screenshot({ path: SHOTS + "9-settings.png" });
  const fill = (name, value) => s.page.locator(`label.setting:has-text("${name}") input`).fill(String(value));
  await fill("Hold time", 500);
  const box = await s.page.locator("canvas").boundingBox();
  await s.page.keyboard.press("Escape");
  await s.page.mouse.click(box.x + 130 + 4 * 120 + 40, box.y + 126); await sleep(800);
  check("note 5 is an A", (await progress(s.page)) === "Note 5 of 15", await progress(s.page));
  await start(s.page); await s.page.waitForSelector('button:text-is("Stop")'); await trackNotes(s.page);
  const t0 = Date.now();
  await s.page.waitForFunction(() => document.querySelector("section > p").textContent === "Note 6 of 15", null, { timeout: 4000 });
  const took = Date.now() - t0;
  check("a longer hold takes longer", took >= 350, `${took} ms`);
  await stop(s.page); await sleep(200);
  check("no console problems", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

flow("10. Layout on common computer screens");
for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
  const s = await open("q-silent.wav", { viewport });
  const out = [];
  for (const name of ["Listen", "Practice", "Library", "Log"]) {
    await nav(s.page, name); await sleep(200);
    out.push(await s.page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  }
  await nav(s.page, "Practice"); await sleep(200);
  const r = await s.page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(), row = [...document.querySelectorAll(".section-bar")][0].getBoundingClientRect(); return { canvas: `${Math.round(c.width)}x${Math.round(c.height)}`, left: Math.round(c.left), right: Math.round(innerWidth - c.right), bottom: Math.round(c.bottom), fold: innerHeight, bar: Math.round(row.height), headerRows: new Set([...document.querySelector("header").children].map((e) => Math.round(e.getBoundingClientRect().top / 30))).size }; });
  check(`${viewport.width}x${viewport.height}: no sideways scroll, centred`, out.every((value) => value <= 0) && Math.abs(r.left - r.right) <= 1, JSON.stringify(r));
  if (viewport.width === 1920) await s.page.screenshot({ path: SHOTS + "10-1920.png" });
  await s.close();
}
