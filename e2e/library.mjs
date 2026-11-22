import { rmSync } from "node:fs";
import { wav, note, rest } from "./wav.mjs";
import { setRecord, laneScore, open, nav, start, stop, sleep, check, followNotes, progress, D_MAJOR, OUT, answer, saveStaff, staffNotes, showGroup, setBpm, setLanguage, openSettings, setGlide, cardOf } from "./lib.mjs";

const profile = OUT + "profile";
rmSync(profile, { recursive: true, force: true });
wav(OUT + "dmajor.wav", [...D_MAJOR.flatMap((m) => [note(m, 0.5), rest(0.12)]), rest(0.5)]);

const s = await open(OUT + "dmajor.wav", profile);
const page = s.page;

// Library: the groups in the sidebar with their counts, one shown whole, and saving one from the staff
await nav(page, "Library");
const groups = await page.locator(".nav-sub .sub-item").evaluateAll((items) => items.map((item) => `${item.querySelector(".sub-name").textContent}: ${item.querySelector(".sub-hint").textContent}`));
check("three groups in the sidebar, with their counts", groups.join() === "Scales: 17 pieces,Classic tunes: 8 pieces,My songs: 2 pieces", groups.join());
check("the first shown whole, its name and count in the title row", (await page.locator(".library h1").innerText()) === "Scales" && (await page.locator(".library .piece").count()) === 17 && (await page.locator(".library .title-caption").innerText()) === "17 pieces");
await staffNotes(page, "Pasted D major", "D4 E4 F#4 G4 | A4 B4 C#5 D5");
await saveStaff(page).click(); await sleep(150);
check("a saved piece joins My songs, which Save goes back to", (await page.locator(".library h1").innerText()) === "My songs" && (await page.locator(".library .piece").count()) === 3 && (await page.locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await (await cardOf(page, "D (Ré) major")).locator(".piece-name").click();
await page.screenshot({ path: OUT + "library.png" });

// Settings and toggles survive reload
await openSettings(page);
await page.locator('input[aria-label="Close enough"]').fill("25");
await nav(page, "Practice");
const fingers = () => page.locator('.dock button:text-is("Fingers")');
await fingers().click();
await page.reload();
await page.waitForSelector("nav button");
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("settings")));
check("settings survive a reload", saved.toleranceCents === 25 && saved.toggles.fingers === false && saved.highlighted.includes("d-major-1oct"), JSON.stringify(saved));
await nav(page, "Practice");
await sleep(100);
await page.screenshot({ path: OUT + "practice-toggled.png" });
check("a saved bar switch comes back off", (await fingers().getAttribute("aria-pressed")) === "false");
await fingers().click();
await openSettings(page);
await page.locator('input[aria-label="Close enough"]').fill("40");

// Record a full practice pass
await nav(page, "Library");
check("saved piece survives a reload", (await page.locator(".piece", { hasText: "Pasted D major" }).count()) === 1);
await (await cardOf(page, "D (Ré) major")).locator('button:text-is("Practise")').click();
await setRecord(page, true);
await start(page);
const deadline = Date.now() + 30000;
while (Date.now() < deadline && !(await page.locator(".practice-progress").first().innerText()).startsWith("All")) await sleep(50);
check("recorded pass clears", (await page.locator(".practice-progress").first().innerText()).startsWith("All 15"));
await sleep(500);
await nav(page, "Calendar");
await page.waitForSelector(".recording-note");
await sleep(300);
check("recording ready straight after leaving Practice", (await page.locator(".recording-note").count()) === 1);
await page.reload();
await page.waitForSelector("nav button");
await nav(page, "Calendar");
await page.waitForSelector(".recording-note");
check("recording survives a reload", (await page.locator(".recording-note").count()) === 1);
await page.click(".recording-note");
await sleep(800);
await page.screenshot({ path: OUT + "log.png", fullPage: true });

const info = await page.evaluate(async () => {
  const audio = document.querySelector("audio");
  await new Promise((r) => setTimeout(r, 500));
  return { duration: audio.duration, currentTime: audio.currentTime, readyState: audio.readyState };
});
console.log("  audio:", JSON.stringify(info));
check("duration is known, so seeking works", Number.isFinite(info.duration) && info.duration > 5);

// Each saved note marker: decode the recording and confirm that pitch sounds there
const jump = await page.evaluate(async () => {
  const { createDetector } = await import("/src/audio/detector.ts");
  const { nearestMidi, midiOf } = await import("/src/music/notes.ts");
  const { getRecording, loadLog } = await import("/src/storage.ts");
  const { markers } = await getRecording(loadLog().at(-1).recordingId);
  const audio = document.querySelector("audio");
  const ctx = new OfflineAudioContext(1, 48000, 48000);
  const decoded = await ctx.decodeAudioData(await (await fetch(audio.src)).arrayBuffer());
  const samples = decoded.getChannelData(0);
  const rate = decoded.sampleRate;
  const rows = [];
  for (const marker of markers) {
    // Where a jump there would have played to after 120 ms, as the old marker buttons did.
    const seekTo = marker.seconds + 0.12;
    const detect = createDetector(2048, rate);
    let hz = null;
    const windowStart = Math.floor((seekTo + 0.12) * rate);
    for (let f = 0; f < 5; f++) hz = detect(samples.slice(windowStart + f * 512, windowStart + f * 512 + 2048), 0.01) ?? hz;
    rows.push({ want: marker.pitch, seekTo: +seekTo.toFixed(2), heard: hz ? nearestMidi(hz) === midiOf(marker.pitch) : false });
  }
  return { rows, decodedSeconds: decoded.duration, size: (await (await fetch(audio.src)).blob()).size };
});
console.log("  decoded seconds", jump.decodedSeconds, "size bytes", jump.size);
console.log("  ", jump.rows.map((r) => `${r.want}@${r.seekTo}:${r.heard ? "ok" : "MISS"}`).join("  "));
check("15 markers, each landing on its note", jump.rows.length === 15 && jump.rows.every((r) => r.heard));

// The Calendar: today's minutes on its tile, and what was practised
const dayText = await page.locator(".day-details").innerText();
check("today's tile shows the minutes, and the day lists the piece", (await page.locator(".calendar-day.today .calendar-minutes").innerText()).endsWith("′") && dayText.includes("D (Ré) major") && dayText.includes("min practised"), dayText.replaceAll("\n", " | ").slice(0, 160));

// Download link and delete
check("download link has a filename", (await page.locator("a[download]").getAttribute("download")).endsWith(".m4a"), await page.locator("a[download]").getAttribute("download"));
await page.click('.recording-actions button:text-is("Delete")');
await answer(page, "Delete"); await sleep(200);
check("Delete, once confirmed, removes the player and note", (await page.locator("audio").count()) === 0 && (await page.locator(".recording-note").count()) === 0);

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
  await showGroup(page, "Classic tunes"); await sleep(150);
  const [left, right] = await page.locator(".library .piece").evaluateAll((cards) => cards.slice(0, 2).map((card) => card.getBoundingClientRect().toJSON()));
  check("the cards sit side by side", left.right <= right.left && Math.abs(left.top - right.top) < 2);
  const row = page.locator(".piece", { hasText: "Twinkle" });
  check("Practise has its word and its icon", (await row.locator('button:text-is("Practise") svg').count()) === 1);
  const marked = () => page.locator(".piece", { hasText: "Twinkle" }).evaluate((card) => card.classList.contains("highlighted"));
  const songsHeading = () => page.locator(".library .title-caption").innerText();
  const before = await page.locator(".library .piece strong").allInnerTexts();
  check("nothing is highlighted at first", !(await marked()) && (await songsHeading()) === "8 pieces");
  await row.locator(".piece-name").click();
  check("clicking a title highlights it, and the count says so", (await marked()) && (await songsHeading()) === "8 pieces · 1 selected" && (await row.locator(".piece-name").getAttribute("aria-pressed")) === "true", await songsHeading());
  check("highlighting leaves the order as it was", (await page.locator(".library .piece strong").allInnerTexts()).join() === before.join());
  await page.locator(".piece", { hasText: "Hot Cross Buns" }).locator(".piece-name").click();
  check("there's no limit, and each counts", (await songsHeading()) === "8 pieces · 2 selected", await songsHeading());
  await page.reload(); await page.waitForSelector("nav button"); await nav(page, "Library"); await showGroup(page, "Classic tunes"); await sleep(200);
  check("highlights survive a reload", (await marked()) && (await songsHeading()) === "8 pieces · 2 selected");
  await nav(page, "Practice"); await sleep(200);
  const starred = await page.locator(".piece-menu button.highlighted").evaluateAll((items) => items.map((item) => item.value));
  check("Practice's menu marks the same pieces", starred.join() === "hot-cross-buns,twinkle-twinkle", starred.join());
  await nav(page, "Library"); await sleep(200);
  await page.locator(".piece", { hasText: "Twinkle" }).locator(".piece-name").click();
  await page.locator(".piece", { hasText: "Hot Cross Buns" }).locator(".piece-name").click();
  check("and can be cleared, Library coming back to the group shown last", !(await marked()) && (await songsHeading()) === "8 pieces");
  check("a group shows all its pieces", await page.locator(".piece", { hasText: "Ode to Joy" }).isVisible());

  for (const [title, count] of [["Hot Cross Buns", 17], ["Mary Had a Little Lamb", 26], ["Twinkle Twinkle Little Star", 42], ["Lightly Row", 57], ["Frère Jacques", 32], ["Hills and Dales", 47], ["Upstairs, Downstairs", 59], ["Ode to Joy", 62]]) {
    await nav(page, "Library"); await sleep(150);
    await (await cardOf(page, title)).locator('button:text-is("Practise")').click(); await sleep(300);
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
    await (await cardOf(page, title)).locator('button:text-is("Practise")').click(); await sleep(300);
    await setBpm(page, tempo ? 90 : 120);
    if (tempo) await setGlide(page, true);
    await followNotes(page, { midis, delayMs: 150 });
    await start(page); await page.waitForSelector('button:text-is("Stop")');
    await page.waitForFunction(() => document.querySelector(".practice-progress").textContent.startsWith("All"), null, { timeout: 60000 }).catch(() => {});
    const result = await laneScore(page);
    await stop(page); await sleep(200);
    return result;
  };
  const buns = await play("Hot Cross Buns", [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62]);
  check("Hot Cross Buns plays through, with its repeated notes", buns.includes("17 hit"), buns.replaceAll("\n", " / "));
  const mary = await play("Mary Had a Little Lamb", [66, 64, 62, 64, 66, 66, 66, 64, 64, 64, 66, 69, 69, 66, 64, 62, 64, 66, 66, 66, 66, 64, 64, 66, 64, 62], true);
  check("Mary plays through with Tempo on", mary.includes("26 hit"), mary.replaceAll("\n", " / "));
  await setGlide(page, false);

  await setLanguage(page, "PT");
  await page.locator("header > nav > button").nth(2).click(); await sleep(200);
  let text = await page.locator(".nav-sub").innerText();
  for (const name of ["Escalas", "Melodias clássicas", "Minhas músicas"]) {
    await showGroup(page, name); await sleep(100);
    text += await page.locator(".library").innerText();
  }
  check("pt: groups and song titles are translated", text.includes("Escalas") && text.includes("Melodias clássicas") && text.includes("Minhas músicas") && text.includes("Colinas e Vales") && text.includes("Brilha, Brilha, Estrelinha") && text.includes("Ode à Alegria") && text.includes("Lá maior · cordas Lá e Mi"));
  check("songs: no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
