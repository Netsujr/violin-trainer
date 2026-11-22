// One person's whole trip through the app, screen by screen, with their data building up along the way.
// node e2e/qa.mjs desktop | ipad | phone
// The iPad and phone runs use WebKit, Safari's engine, with touch at those devices' sizes. That's the closest thing
// to them on a computer, but it isn't one: no real mic or speakers, and no iOS fullscreen or audio routing.
import { readFileSync, rmSync } from "node:fs";
import { chromium, devices, webkit } from "playwright-core";
import { setRecord, nav, auditCheck, canvasHasColor, check, D_MAJOR as D, followNotes, freshPractice, laneScore, OUT, progress, savedLog, savedSettings, saveStaff, sleep, staffNotes, waitForText, setCountIn, heard, setBpm, spyOnRecordings, recordings, cardOf, setChoice, flip } from "./lib.mjs";

const PROFILES = {
  desktop: { engine: chromium, launch: { channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] }, device: { viewport: { width: 1440, height: 900 } }, touch: false },
  ipad: { engine: webkit, launch: {}, device: devices["iPad Pro 11"], touch: true },
  phone: { engine: webkit, launch: {}, device: devices["iPhone 15"], touch: true },
};
const name = process.argv[2] ?? "desktop";
const profile = PROFILES[name];
const { touch } = profile;
const isPhone = name === "phone";

// A saved profile rather than a throwaway one, which WebKit treats as private browsing, where recordings can't be stored.
const profileDir = `${OUT}qa-profile-${name}`;
rmSync(profileDir, { recursive: true, force: true });
const context = await profile.engine.launchPersistentContext(profileDir, { ...profile.launch, ...profile.device, acceptDownloads: true, locale: "en-US" });
const page = context.pages()[0] ?? (await context.newPage());
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
// "Button failed to load" is WebKit's own audio controls missing their icons in this test build, not the app.
page.on("console", (message) => { if (message.type() === "error" && !message.text().startsWith("Button failed to load")) problems.push(message.text()); });

const flow = (title) => console.log(`\n=== ${title}`);
const shot = (label) => page.screenshot({ path: `${OUT}qa-${name}-${label}.png` });
const button = (text) => page.getByRole("button", { name: text, exact: true });
const press = (locator, options) => (touch ? locator.tap(options) : locator.click(options));
const tab = async (text) => { await press(button(text)); await sleep(300); };
const showing = () => page.locator(".practice-progress").first().textContent();
const startRun = async () => { await press(button("Start")); await button("Stop").waitFor(); };
// A finished run ends by itself, so Stop may be gone already, or go as it's pressed.
const stopRun = async () => { if (await button("Stop").count()) await press(button("Stop"), { timeout: 1500 }).catch(() => {}); await page.locator('button:text-is("Start"):not([disabled])').first().waitFor(); await sleep(150); };
// Options are always shown now, above the lanes.
const options = async () => {};
// A choice in the settings panel, by its group and its words.
const setGlide = async (on) => { const glide = page.locator('.dock button:text-is("Glide")'); if ((await glide.getAttribute("aria-pressed")) !== String(on)) await press(glide); await sleep(100); };
// Practice at a speed, through Options, which starts closed on a phone.
const practiceAt = async (bpm) => {
  await freshPractice(page);
  await options();
  await setBpm(page, bpm);
};
const tileAt = async (index, lane) => {
  const box = await page.locator("canvas").boundingBox();
  const scale = box.height / (84 * 4);
  const scroller = page.locator(".highway-scroll");
  await scroller.evaluate((element, left) => (element.scrollLeft = left), Math.max(0, index - 1) * 120 * scale);
  await sleep(150);
  const left = await scroller.evaluate((element) => element.scrollLeft);
  await scroller.scrollIntoViewIfNeeded();
  await press(scroller, { position: { x: (130 + index * 120 + 40) * scale - left, y: lane * 84 * scale } });
  await sleep(500);
};
const staffNoteAt = async (index) => {
  const note = page.locator(".staff .vf-stavenote").nth(index);
  await note.evaluate((element) => scrollBy({ top: element.getBoundingClientRect().top - innerHeight / 2, behavior: "instant" }));
  const point = await note.locator(".vf-notehead").evaluate((head) => { const box = head.getBoundingClientRect(); return { x: box.right - 6, y: box.top + box.height / 2 }; });
  return point;
};
const tapPoint = (point) => (touch ? page.touchscreen.tap(point.x, point.y) : page.mouse.click(point.x, point.y));
const spyOnSounds = () => page.evaluate(() => {
  window.sounds = [];
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (when) { window.sounds.push({ hz: this.frequency.value, context: this.context }); return start.call(this, when); };
});
const sounds = () => page.evaluate(() => window.sounds.map(({ hz, context }) => ({ hz, state: context.state })));
// A steady pitch the app hears as its mic, for screens with no current note to follow.
const toneMic = () => page.evaluate(() => {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sawtooth";
  gain.gain.value = 0;
  oscillator.connect(gain);
  oscillator.start();
  window.playTone = (midi) => { oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12); gain.gain.value = midi ? 0.3 : 0; };
  MediaDevices.prototype.getUserMedia = async () => { await context.resume(); const output = context.createMediaStreamDestination(); gain.connect(output); return output.stream; };
});

await page.goto("http://localhost:5199/");
await page.waitForSelector("nav button");

flow("1. First visit");
check("opens on Listen, ready to start", (await page.locator('nav button[aria-current="page"]').innerText()) === "Listen" && (await heard(page)) === "");
check(`reports a ${touch ? "finger" : "mouse"}`, (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) === touch);
await auditCheck(page, "Listen");
await shot("1-listen");

flow("2. Listen");
// Free play listens on its own, from the mic it had as it opened, so it's opened again to hear this one.
await toneMic();
await press(page.locator('.nav-sub .sub-item:has-text("Note guesser")'));
await press(page.locator('.nav-sub .sub-item:has-text("Free play")'));
await sleep(400);
check("shows no note before one is played", (await heard(page)) === "", await heard(page));
await page.evaluate(() => window.playTone(69));
await sleep(700);
check("names an A on the staff, with its finger", (await heard(page)) === "0 Lá A", await heard(page));
const section = await page.locator("main > section").innerText();
check("gives its pitch", /440\.\d Hz/.test(section), section.replaceAll("\n", " | ").slice(0, 120));
check("shows it on the staff", (await page.locator(".staff .vf-stavenote").count()) === 1);
await shot("2-listen-note");
await page.evaluate(() => window.playTone(62));
await sleep(700);
check("follows to a D", (await heard(page)) === "0 Ré D", await heard(page));
await press(page.locator('.dock button:text-is("A B C")')); await sleep(100);
check("a switch changes what shows", (await heard(page)) === "0 Ré", await heard(page));
await press(page.locator('.dock button:text-is("A B C")')); await sleep(100);
// Held long enough to count as playing, not a stray sound.
await page.evaluate(() => window.playTone(69));
await sleep(5000);
await page.evaluate(() => window.playTone(0));
await sleep(600);
check("goes quiet in silence", (await heard(page)) === "", await heard(page));
await tab("Practice");
check("leaving logs it as free play", (await savedLog(page)).at(-1)?.pieceId === "free-play");

flow("3. The mic is refused");
await page.reload(); await page.waitForSelector("nav button");
await page.evaluate(() => { MediaDevices.prototype.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); }; });
await tab("Listen");
await press(page.locator('.nav-sub .sub-item:has-text("Note guesser")'));
await press(page.locator('.nav-sub .sub-item:has-text("Free play")')); await sleep(400);
check("free play says so", (await page.locator(".warning").first().innerText()).startsWith("Microphone unavailable"));
await tab("Practice");
await press(button("Start")); await sleep(400);
check("Practice says so too", (await page.locator(".warning").first().innerText()).startsWith("Microphone unavailable"));

flow("4. Practice: a whole scale, waiting for each note");
await freshPractice(page);
check("Glide and the count-in are in the settings panel", (await page.locator('.dock button:text-is("Glide")').isVisible()) && (await page.locator(".dock .count-in").isVisible()));
await auditCheck(page, "Practice");
await shot("4-practice");
await options();
await setBpm(page, 120);
await followNotes(page, { midis: D, delayMs: 120 });
await press(button("Start")); await sleep(300);
check("counts in first", (await showing()).startsWith("Starts in"), await showing());
await shot("4-count-in");
await waitForText(page, "All 15 notes done");
await sleep(200);
const stats = await laneScore(page);
check("finishes every note, with results on the lanes' bar", stats.includes("Pass 1 done") && stats.includes("15 hit"), stats);
await shot("4-done");
await stopRun();
await press(button("Start")); await sleep(300);
check("Start counts in again", (await showing()).startsWith("Starts in"), await showing());
await stopRun();
check("Stop goes back to the start, logged", (await progress(page)) === "Note 1 of 15" && (await savedLog(page)).at(-1).passes === 1, await progress(page));

flow("5. Finding the note: the ghost note and the reference");
await freshPractice(page);
await setCountIn(page, 0);
await followNotes(page, { midis: Array(16).fill(64) });
await startRun(); await sleep(500);
const ghost = () => page.evaluate(() => { const group = document.querySelector(".played-note"); return group ? { arrow: group.querySelector("text").textContent, color: group.querySelector("ellipse").getAttribute("fill") } : null; });
check("too high shows a red ghost pointing down", (await ghost())?.arrow === "↓" && (await ghost())?.color === "#f08a8d", JSON.stringify(await ghost()));
check("and the note waits", (await progress(page)) === "Note 1 of 15");
await page.locator(".staff").scrollIntoViewIfNeeded();
await shot("5-ghost");
await stopRun();
check("Stop clears it", (await ghost()) === null);
await spyOnRecordings(page);
await press(page.locator(".reference")); await sleep(1500);
const tone = await recordings(page);
check("the reference, a violin note, keeps sounding, audio running", tone.length === 1 && tone[0].midi === 62 && !tone[0].stopped && tone[0].state === "running" && (await page.locator(".reference").getAttribute("aria-pressed")) === "true", JSON.stringify(tone));
await press(page.locator(".reference")); await sleep(150);
check("and turns off", (await page.locator(".reference").getAttribute("aria-pressed")) === "false");

flow("6. Tempo and the metronome");
await practiceAt(90);
await setGlide(true);
await press(page.locator('header .metronome-button')); await sleep(100);
await followNotes(page, { midis: D, delayMs: 120 });
await spyOnSounds();
await startRun();
await waitForText(page, "All 15 notes done", 60000);
await sleep(200);
const clicks = (await sounds()).filter((sound) => sound.hz >= 2500);
check("the run finishes on the beat", (await laneScore(page)).includes("15 hit"), await laneScore(page));
check("the metronome clicks, audio running", clicks.length >= 10 && clicks.every((click) => click.state === "running") && clicks.some((click) => click.hz === 3200), `${clicks.length} clicks, ${clicks.at(-1)?.state}`);
await stopRun();
await setGlide(false);
await press(page.locator('header .metronome-button')); await sleep(100);

flow("7. Keep moving");
await practiceAt(120);
await setChoice(page, "Pace", "Keep moving"); await sleep(300);
check("Keep moving is picked", (await flip(page, "Pace").innerText()) === "Keep moving");
check("Glide no longer applies, so it's hidden", await page.locator('.dock button:text-is("Glide")').isHidden());
await followNotes(page, { midis: D, delays: { 3: 60000 } });
await startRun();
await waitForText(page, "Note 3 of 15");
await sleep(120);
check("hit notes fill pale blue", await canvasHasColor(page, 158, 216, 255));
await waitForText(page, "Note 4 of 15");
await sleep(120);
check("missed notes fill a muted red as they pass", await canvasHasColor(page, 232, 163, 163));
await page.locator(".highway").scrollIntoViewIfNeeded();
await shot("7-dont-wait");
await waitForText(page, "All 15 notes done");
await sleep(200);
const score = await laneScore(page);
check("ends with a score: 14 of 15 is 93%", (await laneScore(page)) === "Score: 93% · 14 hit, 1 missed" && score.includes("14 hit, 1 missed"), score.replaceAll("\n", " / "));
await stopRun();
check("the score goes in the log", (await savedLog(page)).at(-1).score === 93);
await setChoice(page, "Pace", "Wait for me"); await sleep(100);

flow("8. Loop and the top note twice");
await freshPractice(page);
await setChoice(page, "Top note", "Twice"); await sleep(300);
check("Twice adds the note", (await progress(page)) === "Note 1 of 16", await progress(page));
await setChoice(page, "Top note", "Once"); await sleep(300);
await setChoice(page, "Repeat", "Loop"); await sleep(100);
await followNotes(page, { midis: D, delayMs: 120 });
await startRun();
await waitForText(page, "Loop 2", 60000);
check("Loop goes round again", (await progress(page)).startsWith("Note 1 of 15"), await progress(page));
await stopRun();
await setChoice(page, "Repeat", "Once"); await sleep(100);

flow("9. Picking notes");
await freshPractice(page);
await tileAt(1, 2.5);
check("tapping a tile starts from it", (await progress(page)) === "Note 2 of 15", await progress(page));
await staffNoteAt(5).then(tapPoint); await sleep(500);
check("tapping a note on the staff does too", (await progress(page)) === "Note 6 of 15", await progress(page));
const before = await page.locator(".staff").evaluate((staff) => staff.scrollLeft);
await page.locator(".highway-scroll").evaluate((element) => (element.scrollLeft += 200)); await sleep(200);
check("the staff stays in step with the lanes", (await page.locator(".staff").evaluate((staff) => staff.scrollLeft)) > before);
await press(page.locator(".staff-toggle")); await sleep(300);
check("the arrow opens the full sheet", (await page.locator(".staff.collapsed").count()) === 0);
await auditCheck(page, "the full sheet");
await staffNoteAt(10).then(tapPoint); await sleep(400);
check("tapping on the full sheet works", (await progress(page)) === "Note 11 of 15", await progress(page));
await page.locator(".staff").scrollIntoViewIfNeeded();
await shot("9-sheet");
await press(page.locator(".staff-toggle")); await sleep(300);
if (!isPhone) {
  // An iPad has this with a keyboard attached. A phone has no Shift key.
  await tileAt(2, 2.5);
  const { x, y } = await staffNoteAt(4);
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
  await sleep(500);
  check("Shift+click selects a section, highlighted", (await page.locator(".staff .section-band").count()) === 3 && (await page.locator(".practice-section").innerText()) === "Notes 3 to 5", await page.locator(".practice-section").innerText());
  await shot("9-section");
  await followNotes(page, { midis: D, delayMs: 120 });
  await startRun();
  await waitForText(page, "All 3 notes done");
  check("and only that section plays", true);
  await stopRun();
}

flow("10. Fullscreen");
await freshPractice(page);
await tileAt(13, 2.5);
await followNotes(page, { midis: D, delayMs: 120 });
await press(button("Fullscreen")); await sleep(500);
const full = await page.evaluate(() => ({ down: document.documentElement.scrollHeight - innerHeight, sideways: document.documentElement.scrollWidth - innerWidth, browserFullscreen: !!document.fullscreenElement, header: document.querySelector("header").checkVisibility(), canvas: Math.round(document.querySelector("canvas").getBoundingClientRect().width), width: innerWidth }));
check("only the controls, lanes and staff, with no scrolling", full.down <= 0 && full.sideways <= 0 && !full.header && Math.abs(full.canvas - (full.width - 32)) <= 2, JSON.stringify(full));
await auditCheck(page, "fullscreen");
await shot("10-fullscreen");
await startRun();
await waitForText(page, "All 15 notes done");
await sleep(200);
const card = await page.locator(".stats").boundingBox();
const view = page.viewportSize();
check("the results show on screen", card.y >= 0 && card.y + card.height <= view.height && card.x >= 0 && card.x + card.width <= view.width, JSON.stringify(card));
await shot("10-results");
await stopRun();
await press(button("Exit fullscreen")); await sleep(400);
check("and back out to the normal layout", (await page.locator("header").isVisible()) && (await page.locator(".dock").isVisible()));

flow("11. Library");
await tab("Library");
const groupCounts = await page.locator(".nav-sub .sub-hint").allInnerTexts();
check("three groups in the sidebar, with their counts, the first shown whole", groupCounts.join() === "17 pieces,8 pieces,2 pieces" && (await page.locator(".library .piece").count()) === 17, groupCounts.join());
await auditCheck(page, "Library");
await shot("11-library");
await press(page.locator('.nav-sub .sub-item:has-text("Classic tunes")')); await sleep(150);
const row = page.locator(".piece", { hasText: "Twinkle" });
await press(row.locator(".piece-name"));
check("tapping a title highlights it, and the count says so", (await row.evaluate((card) => card.classList.contains("highlighted"))) && (await page.locator(".library .title-caption").innerText()) === "8 pieces · 1 selected", await page.locator(".library .title-caption").innerText());
await staffNotes(page, "My tune", "D4 E4 F#4");
await press(saveStaff(page)); await sleep(200);
const mine = page.locator(".piece", { hasText: "My tune" });
check("a new piece joins My songs, which saving goes back to", (await page.locator(".library h1").innerText()) === "My songs" && (await mine.count()) === 1);
await press(mine.getByRole("button", { name: "Practise", exact: true })); await sleep(400);
check("Practise opens it in Practice", (await progress(page)) === "Note 1 of 3", await progress(page));
await tab("Library");
const modal = page.locator("dialog[open]");
const say = async (label) => { await press(modal.getByRole("button", { name: label, exact: true })); await sleep(200); };
await press(page.locator(".piece", { hasText: "My tune" }).getByRole("button", { name: "Delete", exact: true })); await sleep(200);
check("deleting asks first, naming the piece", (await modal.innerText()).includes('Delete "My tune"?'));
await auditCheck(page, "the question before deleting", "dialog[open]");
await shot("11-question");
await say("Cancel");
check("Cancel keeps it", (await page.locator(".piece", { hasText: "My tune" }).count()) === 1);
await press(page.locator(".piece", { hasText: "My tune" }).getByRole("button", { name: "Delete", exact: true })); await sleep(200);
await say("Delete");
check("and it can be deleted", (await page.locator(".piece", { hasText: "My tune" }).count()) === 0);

// Writing one on Add piece's staff, editing it, and saving it as a PDF.
const notesOnStaff = () => page.locator(".editor-column:not(.blank):not(.spill)").count();
const selectedNote = () => page.locator(".selected-note").innerText();
const blankStaff = () => page.locator(".editor-column.blank .editor-sheet").first();
const staffSave = saveStaff(page);
const storedPiece = (title) => page.evaluate((title) => JSON.parse(localStorage.getItem("pieces")).find((piece) => piece.title === title), title);
await press(page.locator('.library button[aria-label="Add piece"]')); await sleep(250);
check("+ opens Add piece", (await page.locator(".add-piece h1").innerText()) === "Add piece");
await page.fill('input[aria-label="Title"]', "Written here");
await press(blankStaff(), { position: { x: 20, y: 90 } }); await sleep(250);
check("a press on the staff places a note, picked out for the tools under it", (await notesOnStaff()) === 1 && (await selectedNote()).startsWith("Sol (G)"), await selectedNote());
await press(page.locator('.note-tools [aria-label="Beats"] button:text-is("2")')); await sleep(150);
await press(page.locator('.note-tools button:text-is("♯ Sharp")')); await sleep(150);
check("the tools change its beats and its sharp or flat", (await selectedNote()).startsWith("Sol♯") && (await page.locator('.note-tools [aria-label="Beats"] button[aria-pressed="true"]').innerText()) === "2", await selectedNote());
await auditCheck(page, "Add piece, writing on the staff");
await shot("11-staff");
await press(staffSave); await sleep(250);
const written = await storedPiece("Written here");
check("it saves with its length and a fingering", written?.notes[0].beats === 2 && written.notes[0].finger !== undefined, JSON.stringify(written));
check("and the staff is blank again", (await page.evaluate(() => JSON.parse(localStorage.getItem("pieceDraft")).notes.length)) === 0);
await press(page.locator(".piece", { hasText: "Written here" }).getByRole("button", { name: "Edit", exact: true })); await sleep(300);
check("Edit opens it on Add piece", (await page.locator(".add-piece h1").innerText()) === "Edit piece" && (await notesOnStaff()) === 1);
await page.fill('input[aria-label="Title"]', "Rewritten");
await press(staffSave); await sleep(250);
check("saving updates it in place", (await storedPiece("Rewritten"))?.id === written.id && (await storedPiece("Written here")) === undefined);
const rewritten = page.locator(".piece", { hasText: "Rewritten" });
await auditCheck(page, "Library, with a custom song", ".library");
await rewritten.scrollIntoViewIfNeeded();
await shot("11-custom-row");
const [pdf] = await Promise.all([page.waitForEvent("download"), press(rewritten.getByRole("button", { name: "PDF", exact: true }))]);
const pdfPath = `${OUT}qa-${name}.pdf`;
await pdf.saveAs(pdfPath);
check("PDF saves a PDF, named after the song", pdf.suggestedFilename() === "Rewritten.pdf" && readFileSync(pdfPath).subarray(0, 5).toString() === "%PDF-", pdf.suggestedFilename());
await press(page.locator('.library button[aria-label="Add piece"]')); await sleep(250);
await press(blankStaff(), { position: { x: 20, y: 90 } }); await sleep(250);
await press(page.locator('.title-tools button:text-is("Clear")')); await sleep(200);
check("Clear asks first", (await modal.innerText()).includes("Remove all the notes"));
await say("Clear");
check("and then empties the staff", (await notesOnStaff()) === 0);
await press(page.locator('.add-piece button[aria-label="Back to My songs"]')); await sleep(250);
await press(rewritten.getByRole("button", { name: "Delete", exact: true })); await sleep(200);
await say("Delete");
await press((await cardOf(page, "Hot Cross Buns")).getByRole("button", { name: "Practise", exact: true })); await sleep(400);
await options();
await setBpm(page, 120);
await setCountIn(page, 0);
await followNotes(page, { midis: [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62], delayMs: 100 });
await startRun();
await waitForText(page, "All 17 notes done", 60000);
check("a song plays through, with its repeated notes", (await laneScore(page)).includes("17 hit"), await laneScore(page));
await stopRun();

flow("12. Recording");
await freshPractice(page);
await setRecord(page, true);
await followNotes(page, { midis: D, delayMs: 120 });
await startRun();
await waitForText(page, "All 15 notes done", 60000);
await stopRun();
await tab("Calendar");
await page.waitForSelector(".recording-note", { timeout: 10000 });
await press(page.locator(".recording-note")); await sleep(800);
const audio = page.locator("audio").first();
check("the recording appears, with its length", await audio.evaluate((element) => Number.isFinite(element.duration) && element.duration > 3), String(await audio.evaluate((element) => element.duration)));
const format = await page.evaluate(async () => (await (await fetch(document.querySelector("audio").src)).blob()).type);
const link = await page.locator("a[download]").first().getAttribute("download");
check("Download's file type matches what was recorded", format.includes("mp4") ? link.endsWith(".m4a") : link.endsWith(".webm"), `${format} > ${link}`);
await auditCheck(page, "Calendar, with a recording");
await page.locator(".waveform-player").scrollIntoViewIfNeeded();
await shot("12-recording");
await press(page.locator(".recording-actions button", { hasText: "Delete" })); await sleep(200);
await say("Delete");
check("Delete, once confirmed, removes only the recording, leaving the day's summaries", (await page.locator("audio").count()) === 0 && (await page.locator(".recording-note").count()) === 0 && (await page.locator(".day-piece li").count()) >= 2);

flow("13. Calendar");
const logText = await page.locator("main > section").innerText();
check("reads sensibly", ["Practised for", "Score: 93%", "D (Ré) major", "Plan"].every((word) => logText.includes(word)) && !/NaN|undefined|null/.test(logText), logText.replaceAll("\n", " | ").slice(0, 200));
await shot("13-calendar");

flow("14. Settings");
await press(page.locator("header .set-row nav button")); await sleep(250);
await auditCheck(page, "Settings");
await shot("14-settings");
await nav(page, "Listen"); await press(page.locator(".tuner-toggle")); await sleep(150);
await page.locator('input[aria-label="Close enough"]').fill("25"); await sleep(100);
check("Close enough, set on the tuner, applies and saves", (await savedSettings(page)).toleranceCents === 25 && (await page.locator(".dial-key").innerText()).includes("within 25 cents"));
await page.locator('input[aria-label="Close enough"]').fill("40");
await press(page.locator(".tuner-toggle"));

flow("15. Portuguese");
await press(button("PT")); await sleep(300);
check("the app switches over", (await page.title()) === "Treinador de Notas para Violino" && (await button("Praticar").count()) === 1);
for (const screen of ["Ouvir", "Praticar", "Biblioteca", "Calendário"]) {
  await tab(screen);
  await auditCheck(page, `pt ${screen}`);
}
await tab("Praticar");
await shot("15-portuguese");
check("Practice is translated", (await button("Iniciar").count()) === 1 && (await page.locator(".dock").innerText()).includes("Esperar por mim"), await page.locator(".dock").innerText());
await press(button("EN")); await sleep(300);

flow("16. Coming back later");
await page.reload(); await page.waitForSelector("nav button");
const saved = await savedSettings(page);
check("settings survive a reload", saved.bpm > 0 && saved.highlighted.includes("twinkle-twinkle") && saved.language === "en", JSON.stringify({ bpm: saved.bpm, highlighted: saved.highlighted }));
check("the log survives too", (await savedLog(page)).length >= 5);

if (touch) {
  flow("17. Turning the device mid-run");
  await practiceAt(120);
  await followNotes(page, { midis: D, delayMs: 300 });
  await startRun();
  await waitForText(page, "Note 3 of 15");
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.height, height: size.width }); await sleep(500);
  const turned = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth - innerWidth, canvas: Math.round(document.querySelector("canvas").getBoundingClientRect().width), width: innerWidth }));
  check("the layout refits", turned.sideways <= 0 && Math.abs(turned.canvas - Math.min(960, turned.width - 32)) <= 2, JSON.stringify(turned));
  await shot("17-turned");
  await waitForText(page, "All 15 notes done", 60000);
  check("and the run carries on to the end", true);
  await stopRun();
  await page.setViewportSize(size);
}

flow("Overall");
check("no page errors the whole way through", problems.length === 0, problems.slice(0, 5).join(" | "));
await context.close();
