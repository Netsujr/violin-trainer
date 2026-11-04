import { rmSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { open, nav, start, stop, sleep, check, followNotes, progress, OUT } from "./lib.mjs";

const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74, 73, 71, 69, 67, 66, 64, 62];
const profile = OUT + "profile";
rmSync(profile, { recursive: true, force: true });
wav(OUT + "dmajor.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);

const s = await open(OUT + "dmajor.wav", profile);
const page = s.page;

// Library: built-ins, parse, preview, save
await nav(page, "Library");
const column = (index) => page.locator(".library > div").nth(index);
check("scales in the first column, songs in the second", (await column(0).locator("h3").innerText()) === "Scales" && (await column(0).locator(".piece").count()) === 6 && (await column(1).locator("h3").innerText()) === "Songs" && (await column(1).locator(".piece").count()) === 6);
await page.fill('input[placeholder="Title"]', "Pasted D major");
await page.fill("textarea", "D4 E4 F#4 G4 | A4 B4 C#5 D5");
const items = await page.locator("ol li").allInnerTexts();
console.log("  preview:", items.join(" ; "));
check("preview shows 8 fingered notes", items.length === 8 && items[2].includes("D string · finger 2") && items[7].includes("A string · finger 3"));
await page.fill("textarea", "D4 banana");
check("a bad token blocks saving", await page.locator('button:text-is("Save piece")').isDisabled() && (await page.locator(".warning").first().innerText()).includes("banana"));
await page.fill("textarea", "C6 D4");
check("a note above first position is flagged", (await page.locator(".warning").first().innerText()).includes("outside first position"));
await page.fill("textarea", "D4 E4 F#4 G4 | A4 B4 C#5 D5");
await page.click('button:text-is("Save piece")');
check("a saved piece joins the songs", (await column(1).locator(".piece").count()) === 7 && (await column(1).locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await page.locator(".piece", { hasText: "D major" }).first().locator("select").selectOption("0");
await page.screenshot({ path: OUT + "library.png" });

// Settings and toggles survive reload
await page.click("summary");
await page.locator('label.setting:has-text("Tolerance") input').fill("25");
await page.click("summary");
await nav(page, "Listen");
await page.locator('label:has-text("Staff") input').uncheck();
await nav(page, "Practice");
await page.locator('label[title="Fingers"] input').uncheck();
await page.reload();
await page.waitForSelector("nav button");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
check("settings survive a reload", saved.toleranceCents === 25 && saved.toggles.staff === false && saved.toggles.fingers === false && saved.targetDays["d-major-1oct"] === 0, JSON.stringify(saved));
check("the Staff switch hides the staff in Listen", await page.locator(".staff").isHidden());
await page.locator('label:has-text("Staff") input').check();
await nav(page, "Practice");
await sleep(100);
await page.screenshot({ path: OUT + "practice-toggled.png" });
check("a saved bar switch comes back off", !(await page.locator('label[title="Fingers"] input').isChecked()));
await page.locator('label[title="Fingers"] input').check();
await page.click("summary");
await page.locator('label.setting:has-text("Tolerance") input').fill("40");
await page.click("summary");

// Record a full practice pass
await nav(page, "Library");
check("saved piece survives a reload", (await page.locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await page.locator(".piece", { hasText: "D major" }).first().locator('button[aria-label="Practice"]').click();
await page.locator('label:has-text("Record") input').check();
await start(page);
const deadline = Date.now() + 30000;
while (Date.now() < deadline && !(await page.locator("section > p").first().innerText()).startsWith("All")) await sleep(50);
check("recorded pass clears", (await page.locator("section > p").first().innerText()).startsWith("All 15"));
await sleep(500);
await nav(page, "Log");
await page.waitForSelector("audio");
await sleep(300);
check("recording ready straight after leaving Practice", (await page.locator("audio").count()) === 1);
await page.reload();
await page.waitForSelector("nav button");
await nav(page, "Log");
await page.waitForSelector("audio");
await sleep(800);
check("recording survives a reload", (await page.locator("audio").count()) === 1);
await page.screenshot({ path: OUT + "log.png", fullPage: true });

const info = await page.evaluate(async () => {
  const audio = document.querySelector("audio");
  await new Promise((r) => setTimeout(r, 500));
  return { duration: audio.duration, currentTime: audio.currentTime, readyState: audio.readyState };
});
console.log("  audio:", JSON.stringify(info));
check("duration is known, so seeking works", Number.isFinite(info.duration) && info.duration > 5);

const markerCount = await page.locator("button.marker").count();
check("15 note markers", markerCount === 15, String(markerCount));

// Each marker: jump, then decode the recording and confirm that pitch sounds there
const jump = await page.evaluate(async () => {
  const { createDetector } = await import("/src/audio/detector.ts");
  const { nearestMidi, midiOf } = await import("/src/music/notes.ts");
  const audio = document.querySelector("audio");
  const ctx = new OfflineAudioContext(1, 48000, 48000);
  const decoded = await ctx.decodeAudioData(await (await fetch(audio.src)).arrayBuffer());
  const samples = decoded.getChannelData(0);
  const rate = decoded.sampleRate;
  const rows = [];
  for (const button of document.querySelectorAll("button.marker")) {
    button.click();
    await new Promise((r) => setTimeout(r, 120));
    const seekTo = audio.currentTime;
    audio.pause();
    const detect = createDetector(2048, rate);
    let hz = null;
    const windowStart = Math.floor((seekTo + 0.12) * rate);
    for (let f = 0; f < 5; f++) hz = detect(samples.slice(windowStart + f * 512, windowStart + f * 512 + 2048), 0.01) ?? hz;
    rows.push({ want: button.textContent, seekTo: +seekTo.toFixed(2), heard: hz ? nearestMidi(hz) === midiOf(button.textContent) : false });
  }
  return { rows, decodedSeconds: decoded.duration, size: (await (await fetch(audio.src)).blob()).size };
});
console.log("  decoded seconds", jump.decodedSeconds, "size bytes", jump.size);
console.log("  ", jump.rows.map((r) => `${r.want}@${r.seekTo}:${r.heard ? "ok" : "MISS"}`).join("  "));
check("every marker lands on its note", jump.rows.every((r) => r.heard));

// Log screen contents
const logText = await page.locator("section").innerText();
check("week view, planned and trend rows show", logText.includes("This week") && logText.includes("✓ D major (Mon)") && logText.includes("D major: "), "");
console.log("  " + logText.split("\n").slice(0, 16).join(" | "));

// Download link and delete
check("download link has a filename", (await page.locator("a[download]").getAttribute("download")).endsWith(".webm"), await page.locator("a[download]").getAttribute("download"));
await page.click('button:text-is("Delete recording")');
await sleep(200);
check("delete removes the player", (await page.locator("audio").count()) === 0);

// Closing mid-session still logs
await nav(page, "Practice");
await start(page);
await sleep(500);
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("log")).length);
await page.reload();
await page.waitForSelector("nav button");
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("log")).length);
check("a reload mid-session still logs it", after === before + 1, `${before} -> ${after}`);
check("no page errors", s.problems.length === 0, s.problems.join(" | "));
await s.close();

// Songs: the columns, the icons, and each song on the staff and played through
{
  const s = await open(OUT + "dmajor.wav");
  const { page } = s;
  await nav(page, "Library"); await sleep(200);
  const [left, right] = await page.locator(".library > div").evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().toJSON()));
  check("the columns sit side by side", left.right <= right.left && Math.abs(left.top - right.top) < 2);
  const row = page.locator(".piece", { hasText: "Twinkle" });
  check("Practice is an icon, named for screen readers", (await row.locator('button[aria-label="Practice"]').innerText()) === "" && (await row.locator('button[aria-label="Practice"] svg').count()) === 1);
  const picker = row.locator(".day-picker");
  const shownDay = () => page.locator(".piece", { hasText: "Twinkle" }).locator(".day-picker > span:not(.icon)").innerText();
  check("no target day shows only the icon", (await shownDay()) === "" && (await picker.locator("svg").count()) === 1);
  await picker.locator("select").selectOption("2");
  check("a target day shows beside the icon", (await shownDay()) === "Wed" && (await picker.getAttribute("class")).includes("set"));
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(200);
  check("it survives a reload", (await shownDay()) === "Wed");
  await page.locator(".piece", { hasText: "Twinkle" }).locator("select").selectOption("");
  check("and can be cleared", (await shownDay()) === "");

  for (const [title, count] of [["Hot Cross Buns", 17], ["Mary Had a Little Lamb", 26], ["Twinkle Twinkle Little Star", 42], ["Lightly Row", 57], ["Frère Jacques", 32], ["Ode to Joy", 62]]) {
    await nav(page, "Library"); await sleep(150);
    await page.locator(".piece", { hasText: title }).locator('button[aria-label="Practice"]').click(); await sleep(300);
    const closed = await page.locator(".staff .vf-stavenote").count();
    await page.click(".staff-toggle"); await sleep(250);
    const sheet = await page.evaluate(() => { const panel = document.querySelector(".staff-panel").getBoundingClientRect(), notes = [...document.querySelectorAll(".staff .vf-stavenote")]; return { notes: notes.length, outside: notes.filter((note) => { const box = note.getBoundingClientRect(); return box.right > panel.right + 1 || box.left < panel.left - 1; }).length }; });
    await page.click(".staff-toggle"); await sleep(150);
    check(`${title}: opens with all its notes on the staff`, (await progress(page)) === `Note 1 of ${count}` && closed === count && sheet.notes === count && sheet.outside === 0, `${await progress(page)} ${closed} ${JSON.stringify(sheet)}`);
  }
  // Note 28 is a dotted E and note 25 a plain D, neither with a sharp, so the dot is the only extra glyph.
  const glyphs = await page.locator(".staff .vf-stavenote").evaluateAll((notes) => [notes[27], notes[24]].map((note) => note.querySelectorAll("text").length));
  check("Ode to Joy draws its dotted notes", glyphs.join() === "2,1", glyphs.join());

  const play = async (title, midis, tempo) => {
    await page.reload(); await page.waitForSelector("nav button"); // Ends the last song's synthetic player.
    await nav(page, "Library"); await sleep(150);
    await page.locator(".piece", { hasText: title }).locator('button[aria-label="Practice"]').click(); await sleep(300);
    await page.locator(".bpm input").fill(tempo ? "90" : "120");
    if (tempo) await page.locator('.options label:has-text("Tempo") input').check();
    await followNotes(page, { midis, delayMs: 150 });
    await start(page); await page.waitForSelector('button:text-is("Stop")');
    await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 60000 }).catch(() => {});
    const result = await page.locator(".stats").innerText();
    await stop(page); await sleep(200);
    return result;
  };
  const buns = await play("Hot Cross Buns", [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62]);
  check("Hot Cross Buns plays through, with its repeated notes", buns.includes("17 hit"), buns.replaceAll("\n", " / "));
  const mary = await play("Mary Had a Little Lamb", [66, 64, 62, 64, 66, 66, 66, 64, 64, 64, 66, 69, 69, 66, 64, 62, 64, 66, 66, 66, 66, 64, 64, 66, 64, 62], true);
  check("Mary plays through with Tempo on", mary.includes("26 hit"), mary.replaceAll("\n", " / "));
  await page.locator('.options label:has-text("Tempo") input').uncheck();

  await page.click('.language button:text-is("PT")'); await sleep(200);
  await page.locator("nav button").nth(2).click(); await sleep(200);
  const text = await page.locator(".library").innerText();
  check("pt: columns and song titles are translated", text.includes("Escalas") && text.includes("Músicas") && text.includes("Brilha, Brilha, Estrelinha") && text.includes("Ode à Alegria") && text.includes("Lá maior · cordas Lá e Mi"));
  check("songs: no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
