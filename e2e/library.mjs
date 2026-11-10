import { rmSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { setRecord, laneScore, open, nav, start, stop, sleep, check, followNotes, progress, D_MAJOR, OUT, answer, saveTyped, typeNotes, openDrawers } from "./lib.mjs";

const profile = OUT + "profile";
rmSync(profile, { recursive: true, force: true });
wav(OUT + "dmajor.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);

const s = await open(OUT + "dmajor.wav", profile);
const page = s.page;

// Library: built-ins, parse, preview, save
await nav(page, "Library");
const column = (index) => page.locator(".library > div").nth(index);
const group = async (index) => ({
  title: await column(index).locator("h3").innerText(),
  shown: await column(index).locator(":scope > .piece").count(),
  drawer: (await column(index).locator(".more-pieces > summary").allInnerTexts()).join(),
});
const groups = [await group(0), await group(1), await group(2)];
check("three groups, three cards each, the rest in a drawer", JSON.stringify(groups) === JSON.stringify([{ title: "Scales", shown: 3, drawer: "Show 14 more" }, { title: "Classic tunes", shown: 3, drawer: "Show 3 more" }, { title: "My songs", shown: 2, drawer: "" }]), JSON.stringify(groups));
await page.fill('input[placeholder="Title"]', "Pasted D major");
await typeNotes(page, "D4 E4 F#4 G4 | A4 B4 C#5 D5");
const items = await page.locator("ol li").allInnerTexts();
console.log("  preview:", items.join(" ; "));
check("preview shows 8 fingered notes", items.length === 8 && items[2].includes("D string · finger 2") && items[7].includes("A string · finger 3"));
await page.fill("textarea", "D4 banana");
check("a bad token blocks saving", await saveTyped(page).isDisabled() && (await page.locator(".type-notes .warning").first().innerText()).includes("banana"));
await page.fill("textarea", "C6 D4");
check("a note above first position is flagged", (await page.locator(".type-notes .warning").first().innerText()).includes("outside first position"));
await page.fill("textarea", "D4 E4 F#4 G4 | A4 B4 C#5 D5");
await saveTyped(page).click();
check("a saved piece joins My songs", (await column(2).locator(".piece").count()) === 3 && (await column(2).locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await page.locator(".piece", { hasText: "D (Ré) major" }).first().click();
await page.screenshot({ path: OUT + "library.png" });

// Settings and toggles survive reload
await page.click("summary");
await page.locator('label.setting:has-text("Tolerance") input').fill("25");
await page.click("summary");
await nav(page, "Listen");
await page.locator('label:has-text("Staff") input').uncheck();
await nav(page, "Practice");
const fingers = () => page.locator('.section-bar .box-toggle[aria-label="Fingers"]');
await fingers().click();
await page.reload();
await page.waitForSelector("nav button");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
check("settings survive a reload", saved.toleranceCents === 25 && saved.toggles.staff === false && saved.toggles.fingers === false && saved.highlighted.includes("d-major-1oct"), JSON.stringify(saved));
check("the Staff switch hides the staff in Listen", await page.locator(".staff").isHidden());
await page.locator('label:has-text("Staff") input').check();
await nav(page, "Practice");
await sleep(100);
await page.screenshot({ path: OUT + "practice-toggled.png" });
check("a saved bar switch comes back off", (await fingers().getAttribute("aria-pressed")) === "false");
await fingers().click();
await page.click("summary");
await page.locator('label.setting:has-text("Tolerance") input').fill("40");
await page.click("summary");

// Record a full practice pass
await nav(page, "Library");
check("saved piece survives a reload", (await page.locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await page.locator(".piece", { hasText: "D (Ré) major" }).first().locator('button[aria-label="Practice"]').click();
await setRecord(page, true);
await start(page);
const deadline = Date.now() + 30000;
while (Date.now() < deadline && !(await page.locator("section > p").first().innerText()).startsWith("All")) await sleep(50);
check("recorded pass clears", (await page.locator("section > p").first().innerText()).startsWith("All 15"));
await sleep(500);
await nav(page, "Calendar");
await page.waitForSelector("audio");
await sleep(300);
check("recording ready straight after leaving Practice", (await page.locator("audio").count()) === 1);
await page.reload();
await page.waitForSelector("nav button");
await nav(page, "Calendar");
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

// The Calendar: today's minutes on its tile, and what was practised
const dayText = await page.locator(".day-details").innerText();
check("today's tile shows the minutes, and the day lists the piece", (await page.locator(".calendar-day.today .calendar-minutes").innerText()).endsWith("′") && dayText.includes("D (Ré) major") && dayText.includes("min practised"), dayText.replaceAll("\n", " | ").slice(0, 160));

// Download link and delete
check("download link has a filename", (await page.locator("a[download]").getAttribute("download")).endsWith(".webm"), await page.locator("a[download]").getAttribute("download"));
await page.click('button:text-is("Delete recording")');
await sleep(100);
check("it asks first", (await page.locator("dialog[open]").innerText()).includes("Delete this recording"));
await answer(page, "Delete");
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
  const marked = () => page.locator(".piece", { hasText: "Twinkle" }).evaluate((card) => card.classList.contains("highlighted"));
  const songsHeading = () => page.locator(".library h3").nth(1).innerText();
  const before = await page.locator(".library .piece strong").allInnerTexts();
  check("nothing is highlighted at first", !(await marked()) && (await songsHeading()) === "Classic tunes");
  await row.click();
  check("clicking a card highlights it, and the heading counts it", (await marked()) && (await songsHeading()) === "Classic tunes (1 selected)" && (await row.locator(".piece-name").getAttribute("aria-pressed")) === "true", await songsHeading());
  check("highlighting leaves the order as it was", (await page.locator(".library .piece strong").allInnerTexts()).join() === before.join());
  await page.locator(".piece", { hasText: "Hot Cross Buns" }).click();
  check("there's no limit, and each counts", (await songsHeading()) === "Classic tunes (2 selected)", await songsHeading());
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await sleep(200);
  check("highlights survive a reload", (await marked()) && (await songsHeading()) === "Classic tunes (2 selected)");
  await nav(page, "Practice"); await sleep(200);
  const starred = await page.locator(".piece-menu button.highlighted").evaluateAll((items) => items.map((item) => item.value));
  check("Practice's menu marks the same pieces", starred.join() === "hot-cross-buns,twinkle-twinkle", starred.join());
  await nav(page, "Library"); await sleep(200);
  await page.locator(".piece", { hasText: "Twinkle" }).click();
  await page.locator(".piece", { hasText: "Hot Cross Buns" }).click();
  check("and can be cleared", !(await marked()) && (await songsHeading()) === "Classic tunes");
  await openDrawers(page); await sleep(100);
  check("a drawer opens on the rest", (await page.locator(".piece", { hasText: "Ode to Joy" }).isVisible()) && (await page.locator(".piece", { hasText: "D (Ré) harmonic minor" }).isVisible()));

  for (const [title, count] of [["Hot Cross Buns", 17], ["Mary Had a Little Lamb", 26], ["Twinkle Twinkle Little Star", 42], ["Lightly Row", 57], ["Frère Jacques", 32], ["Hills and Dales", 47], ["Upstairs, Downstairs", 59], ["Ode to Joy", 62]]) {
    await nav(page, "Library"); await sleep(150);
    await openDrawers(page);
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
    await openDrawers(page);
    await page.locator(".piece", { hasText: title }).locator('button[aria-label="Practice"]').click(); await sleep(300);
    await page.locator(".bpm input").fill(tempo ? "90" : "120");
    if (tempo) await page.locator('.options label:has-text("Tempo") input').check();
    await followNotes(page, { midis, delayMs: 150 });
    await start(page); await page.waitForSelector('button:text-is("Stop")');
    await page.waitForFunction(() => document.querySelector("section > p").textContent.startsWith("All"), null, { timeout: 60000 }).catch(() => {});
    const result = await laneScore(page);
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
  await openDrawers(page); await sleep(100);
  const text = await page.locator(".library").innerText();
  check("pt: groups and song titles are translated", text.includes("Escalas") && text.includes("Melodias clássicas") && text.includes("Minhas músicas") && text.includes("Colinas e Vales") && text.includes("Brilha, Brilha, Estrelinha") && text.includes("Ode à Alegria") && text.includes("Lá maior · cordas Lá e Mi"));
  check("songs: no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
