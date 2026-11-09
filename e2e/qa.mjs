// One person's whole trip through the app, screen by screen, with their data building up along the way.
// node e2e/qa.mjs desktop | ipad | phone
// The iPad and phone runs use WebKit, Safari's engine, with touch at those devices' sizes. That's the closest thing
// to them on a computer, but it isn't one: no real mic or speakers, and no iOS fullscreen or audio routing.
import { readFileSync, rmSync } from "node:fs";
import { chromium, devices, webkit } from "playwright-core";
import { auditCheck, canvasHasColor, check, D_MAJOR as D, followNotes, freshPractice, OUT, progress, savedLog, savedSettings, sleep, waitForText } from "./lib.mjs";

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
const showing = () => page.locator("section > p").first().textContent();
const startRun = async () => { await press(button("Start")); await button("Stop").waitFor(); };
const stopRun = async () => { await press(button("Stop")); await button("Start").waitFor(); await sleep(150); };
const options = async () => { if (!(await page.locator(".options").evaluate((panel) => panel.open))) { await press(page.locator(".options > summary")); await sleep(350); } };
const setOption = async (label, on) => { await options(); const box = page.locator(`.options label:has-text("${label}") input`); if ((await box.isChecked()) !== on) await press(box); await sleep(100); };
// Practice at a speed, through Options, which starts closed on a phone.
const practiceAt = async (bpm) => {
  await freshPractice(page);
  await options();
  await page.locator(".bpm input").fill(String(bpm));
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
check("opens on Listen, ready to start", (await page.locator('nav button[aria-current="page"]').innerText()) === "Listen" && (await page.locator(".big-note").innerText()) === "Press Start and play");
check(`reports a ${touch ? "finger" : "mouse"}`, (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) === touch);
await auditCheck(page, "Listen");
await shot("1-listen");

flow("2. Listen");
await toneMic();
await startRun();
await sleep(400);
check("says it's listening", (await page.locator(".big-note").innerText()) === "Listening…", await page.locator(".big-note").innerText());
await page.evaluate(() => window.playTone(69));
await sleep(700);
check("names an A", (await page.locator(".big-note").innerText()) === "Lá4 / A4", await page.locator(".big-note").innerText());
const section = await page.locator("section").innerText();
check("gives its string and pitch", section.includes("A string, finger 0") && /440\.\d Hz/.test(section), section.replaceAll("\n", " | ").slice(0, 120));
check("shows it on the staff", (await page.locator(".staff .vf-stavenote").count()) === 1);
await shot("2-listen-note");
await page.evaluate(() => window.playTone(62));
await sleep(700);
check("follows to a D", (await page.locator(".big-note").innerText()) === "Ré4 / D4");
await press(page.locator('label:has-text("Letter names") input')); await sleep(100);
check("a switch changes what shows", (await page.locator(".big-note").innerText()) === "Ré4", await page.locator(".big-note").innerText());
await press(page.locator('label:has-text("Letter names") input')); await sleep(100);
await page.evaluate(() => window.playTone(0));
await sleep(600);
check("goes quiet in silence", (await page.locator(".big-note").innerText()) === "Listening…");
check("keeps a trail of recent notes", (await page.locator("section > p").last().innerText()).includes("Lá4 (A)"));
await stopRun();
check("logged as free play", (await savedLog(page)).at(-1).pieceId === "free-play");

flow("3. The mic is refused");
await page.reload(); await page.waitForSelector("nav button");
await page.evaluate(() => { MediaDevices.prototype.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); }; });
await press(button("Start")); await sleep(400);
check("says so, and can try again", (await page.locator(".warning").first().innerText()).startsWith("Microphone unavailable") && (await button("Start").isEnabled()));
await tab("Practice");
await press(button("Start")); await sleep(400);
check("Practice says so too", (await page.locator(".warning").first().innerText()).startsWith("Microphone unavailable"));

flow("4. Practice: a whole scale, waiting for each note");
await freshPractice(page);
check(`Options start ${isPhone ? "closed" : "open"}`, (await page.locator(".options").evaluate((panel) => panel.open)) === !isPhone);
await auditCheck(page, "Practice");
await shot("4-practice");
await options();
await page.locator(".bpm input").fill("120");
await followNotes(page, { midis: D, delayMs: 120 });
await press(button("Start")); await sleep(300);
check("counts in first", (await showing()).startsWith("Starts in"), await showing());
await shot("4-count-in");
await waitForText(page, "All 15 notes done");
await sleep(200);
const stats = await page.locator(".stats").innerText();
check("finishes every note, with results", stats.includes("Pass 1 done") && stats.includes("15 hit"), stats.replaceAll("\n", " / "));
await shot("4-done");
await press(button("Play again")); await sleep(300);
check("Play again counts in again", (await showing()).startsWith("Starts in"), await showing());
await stopRun();
check("Stop goes back to the start, logged", (await progress(page)) === "Note 1 of 15" && (await savedLog(page)).at(-1).passes === 1, await progress(page));

flow("5. Finding the note: the ghost note and the reference");
await freshPractice(page);
await setOption("count-in", false);
await followNotes(page, { midis: Array(16).fill(64) });
await startRun(); await sleep(500);
const ghost = () => page.evaluate(() => { const group = document.querySelector(".played-note"); return group ? { arrow: group.querySelector("text").textContent, color: group.querySelector("ellipse").getAttribute("fill") } : null; });
check("too high shows a blue ghost pointing down", (await ghost())?.arrow === "↓" && (await ghost())?.color === "#1f6fd1", JSON.stringify(await ghost()));
check("and the note waits", (await progress(page)) === "Note 1 of 15");
check("the buttons leave the needle readable", (await page.locator(".needle").evaluate((element) => element.getBoundingClientRect().width)) >= 60);
await page.locator(".staff").scrollIntoViewIfNeeded();
await shot("5-ghost");
await stopRun();
check("Stop clears it", (await ghost()) === null);
await spyOnSounds();
await press(button("Play reference")); await sleep(1500);
const tone = await sounds();
check("the reference keeps sounding, audio running", tone.length === 1 && Math.round(tone[0].hz) === 294 && tone[0].state === "running" && (await button("Stop reference").count()) === 1, JSON.stringify(tone));
await press(button("Stop reference")); await sleep(150);
check("and turns off", (await button("Play reference").count()) === 1);

flow("6. Tempo and the metronome");
await practiceAt(90);
await setOption("Tempo", true);
await setOption("Metronome", true);
await followNotes(page, { midis: D, delayMs: 120 });
await spyOnSounds();
await startRun();
await waitForText(page, "All 15 notes done", 60000);
await sleep(200);
const clicks = (await sounds()).filter((sound) => sound.hz >= 2500);
check("the run finishes on the beat", (await page.locator(".stats").innerText()).includes("15 hit"));
check("the metronome clicks, audio running", clicks.length >= 10 && clicks.every((click) => click.state === "running") && clicks.some((click) => click.hz === 3200), `${clicks.length} clicks, ${clicks.at(-1)?.state}`);
await stopRun();
await setOption("Tempo", false);
await setOption("Metronome", false);

flow("7. Don't wait");
await practiceAt(120);
await press(button("Don't wait")); await sleep(300);
check("the icon turns green", (await button("Don't wait").evaluate((element) => getComputedStyle(element).color)) === "rgb(76, 208, 125)");
check("Tempo no longer applies", await page.locator('.options label:has-text("Tempo") input').isDisabled());
await followNotes(page, { midis: D, delays: { 3: 60000 } });
await startRun();
await waitForText(page, "Note 3 of 15");
await sleep(120);
check("hit notes fill pale green", await canvasHasColor(page, 201, 237, 212));
await waitForText(page, "Note 4 of 15");
await sleep(120);
check("missed notes fill pale red as they pass", await canvasHasColor(page, 246, 207, 200));
await page.locator(".highway").scrollIntoViewIfNeeded();
await shot("7-dont-wait");
await waitForText(page, "All 15 notes done");
await sleep(200);
const score = await page.locator(".stats").innerText();
check("ends with a score: 14 of 15 is 93%", score.includes("Score: 93%") && score.includes("14 hit, 1 missed"), score.replaceAll("\n", " / "));
await stopRun();
check("the score goes in the log", (await savedLog(page)).at(-1).score === 93);
await press(button("Don't wait")); await sleep(100);

flow("8. Loop and the top note twice");
await freshPractice(page);
await press(button("Repeat the top note")); await sleep(300);
check("×2 adds the note", (await progress(page)) === "Note 1 of 16", await progress(page));
await press(button("Repeat the top note")); await sleep(300);
await press(button("Loop")); await sleep(100);
await followNotes(page, { midis: D, delayMs: 120 });
await startRun();
await waitForText(page, "Loop 2", 60000);
check("Loop goes round again", (await progress(page)).startsWith("Note 1 of 15"), await progress(page));
await stopRun();
await press(button("Loop")); await sleep(100);

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
  check("Shift+click selects a section, highlighted", (await page.locator(".staff .section-band").count()) === 3 && (await page.locator(".mode-note").innerText()).startsWith("Section: notes 3 to 5"), await page.locator(".mode-note").innerText());
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
check("and back out to the normal layout", (await page.locator("header").isVisible()) && (await page.locator(".mode-note").count()) === 1);

flow("11. Library");
await tab("Library");
const columns = await page.locator(".library > div").evaluateAll((list) => list.map((column) => Math.round(column.getBoundingClientRect().left)));
check(`scales and songs ${isPhone ? "stack" : "sit side by side"}`, (columns[0] === columns[1]) === isPhone, JSON.stringify(columns));
const shownCards = await page.locator(".library > div").evaluateAll((groups) => groups.map((group) => group.querySelectorAll(":scope > .piece").length));
const drawers = await page.locator(".library .more-pieces > summary").allInnerTexts();
check("three groups, three cards each, the rest in drawers", shownCards.join() === "3,3,2" && drawers.join() === "Show 14 more,Show 3 more", `${shownCards.join()} | ${drawers.join()}`);
await auditCheck(page, "Library");
await shot("11-library");
const row = page.locator(".piece", { hasText: "Twinkle" });
await press(row.locator(".piece-name"));
check("tapping a card highlights it, and its group counts it", (await row.evaluate((card) => card.classList.contains("highlighted"))) && (await page.locator(".library h3").nth(1).innerText()) === "Classic tunes (1 selected)", await page.locator(".library h3").nth(1).innerText());
await page.fill('input[placeholder="Title"]', "My tune");
await press(page.locator(".type-notes summary")); await sleep(150);
await page.fill("textarea", "D4 E4 F#4");
check("the preview lists the notes", (await page.locator("ol li").count()) === 3);
await press(page.locator(".type-notes").getByRole("button", { name: "Save piece", exact: true })); await sleep(200);
const mine = page.locator(".piece", { hasText: "My tune" });
check("a new piece joins My songs", (await page.locator(".library > div").nth(2).locator(".piece", { hasText: "My tune" }).count()) === 1);
await press(mine.getByRole("button", { name: "Practice", exact: true })); await sleep(400);
check("the play icon opens it in Practice", (await progress(page)) === "Note 1 of 3", await progress(page));
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

// Writing one on the staff, editing it, and saving it as a PDF.
const staffNames = () => page.$$eval(".editor-column button.editor-name", (names) => names.map((name) => name.textContent).join());
const blankStaff = () => page.locator(".editor-column.blank .editor-sheet").first();
const staffSave = page.locator("section > .row").last().getByRole("button", { name: "Save piece", exact: true });
const storedPiece = (title) => page.evaluate((title) => JSON.parse(localStorage.getItem("pieces")).find((piece) => piece.title === title), title);
await page.fill('input[placeholder="Title"]', "Written here");
await blankStaff().scrollIntoViewIfNeeded();
await press(blankStaff(), { position: { x: 20, y: 90 } }); await sleep(250);
check("a press on the staff places a note, with its name", (await staffNames()) === "Sol", await staffNames());
await page.locator('.editor-column[data-index="0"] select').selectOption("2"); await sleep(150);
await press(page.locator('.editor-column[data-index="0"] button.editor-name')); await sleep(150);
check("the note's name changes its sharp or flat", (await staffNames()) === "Sol♯", await staffNames());
await auditCheck(page, "Library, writing on the staff");
await shot("11-staff");
await staffSave.scrollIntoViewIfNeeded();
await press(staffSave); await sleep(250);
const written = await storedPiece("Written here");
check("it saves with its length and a fingering", written?.notes[0].beats === 2 && written.notes[0].finger !== undefined, JSON.stringify(written));
check("and the staff is blank again", (await staffNames()) === "");
await press(page.locator(".piece", { hasText: "Written here" }).getByRole("button", { name: "Edit piece", exact: true })); await sleep(300);
check("the pencil opens it for editing", (await page.locator("section > h2").last().textContent()) === "Edit piece" && (await staffNames()) === "Sol♯");
await page.fill('input[placeholder="Title"]', "Rewritten");
await press(staffSave); await sleep(250);
check("saving updates it in place", (await storedPiece("Rewritten"))?.id === written.id && (await storedPiece("Written here")) === undefined);
const rewritten = page.locator(".piece", { hasText: "Rewritten" });
await auditCheck(page, "Library, with a custom song", ".library");
await rewritten.scrollIntoViewIfNeeded();
await shot("11-custom-row");
const [pdf] = await Promise.all([page.waitForEvent("download"), press(rewritten.getByRole("button", { name: "Download PDF", exact: true }))]);
const pdfPath = `${OUT}qa-${name}.pdf`;
await pdf.saveAs(pdfPath);
check("Download saves a PDF, named after the song", pdf.suggestedFilename() === "Rewritten.pdf" && readFileSync(pdfPath).subarray(0, 5).toString() === "%PDF-", pdf.suggestedFilename());
await blankStaff().scrollIntoViewIfNeeded();
await press(blankStaff(), { position: { x: 20, y: 90 } }); await sleep(250);
await press(page.locator("section > .row").last().getByRole("button", { name: "Clear", exact: true })); await sleep(200);
check("Clear asks first", (await modal.innerText()).includes("Remove all the notes"));
await say("Clear");
check("and then empties the staff", (await staffNames()) === "");
await press(rewritten.getByRole("button", { name: "Delete", exact: true })); await sleep(200);
await say("Delete");
await press(page.locator(".piece", { hasText: "Hot Cross Buns" }).getByRole("button", { name: "Practice", exact: true })); await sleep(400);
await options();
await page.locator(".bpm input").fill("120");
await setOption("count-in", false);
await followNotes(page, { midis: [66, 64, 62, 66, 64, 62, 62, 62, 62, 62, 64, 64, 64, 64, 66, 64, 62], delayMs: 100 });
await startRun();
await waitForText(page, "All 17 notes done", 60000);
check("a song plays through, with its repeated notes", (await page.locator(".stats").innerText()).includes("17 hit"));
await stopRun();

flow("12. Recording");
await freshPractice(page);
await setOption("Record", true);
await followNotes(page, { midis: D, delayMs: 120 });
await startRun();
await waitForText(page, "All 15 notes done", 60000);
await stopRun();
await tab("Log");
await page.waitForSelector("audio", { timeout: 10000 });
await sleep(800);
const audio = page.locator("audio").first();
check("the recording appears, with its length", await audio.evaluate((element) => Number.isFinite(element.duration) && element.duration > 3), String(await audio.evaluate((element) => element.duration)));
check("with its note markers", (await page.locator("button.marker").count()) === 15, String(await page.locator("button.marker").count()));
await page.locator("button.marker").nth(7).scrollIntoViewIfNeeded();
await press(page.locator("button.marker").nth(7)); await sleep(400);
const seeked = await audio.evaluate((element) => { const at = element.currentTime; element.pause(); return at; });
check("a marker jumps there", seeked > 1, String(seeked));
const format = await page.evaluate(async () => (await (await fetch(document.querySelector("audio").src)).blob()).type);
const link = await page.locator("a[download]").first().getAttribute("download");
check("Download's file type matches what was recorded", format.includes("mp4") ? link.endsWith(".m4a") : link.endsWith(".webm"), `${format} > ${link}`);
await auditCheck(page, "Log, with a recording");
await page.locator("audio").first().scrollIntoViewIfNeeded();
await shot("12-recording");
await press(button("Delete recording")); await sleep(200);
await say("Cancel");
check("Cancel keeps the recording", (await page.locator("audio").count()) === 1);
await press(button("Delete recording")); await sleep(200);
await say("Delete"); await sleep(100);
check("Delete recording removes only the audio", (await page.locator("audio").count()) === 0 && (await page.locator("section > ul > li").count()) >= 5);

flow("13. Log");
const logText = await page.locator("section").innerText();
check("reads sensibly", ["This week", "Planned", "Trends", "Sessions", "Score: 93%", "D (Ré) major"].every((word) => logText.includes(word)) && !/NaN|undefined|null/.test(logText), logText.replaceAll("\n", " | ").slice(0, 200));
check("the highlighted piece shows as planned", /[✓○] Twinkle Twinkle Little Star/.test(logText));
await shot("13-log");

flow("14. Settings");
await press(page.locator("header summary")); await sleep(250);
const panel = await page.locator(".settings-panel").boundingBox();
check("fits on screen", panel.x >= 0 && panel.x + panel.width <= page.viewportSize().width + 1, JSON.stringify(panel));
await auditCheck(page, "Settings", ".settings-panel");
await shot("14-settings");
await page.locator('label.setting:has-text("Tolerance") input').fill("25"); await sleep(100);
check("Tolerance applies and saves", (await savedSettings(page)).toleranceCents === 25 && (await page.evaluate(() => document.documentElement.style.getPropertyValue("--tolerance"))) === "25%");
await page.locator('label.setting:has-text("Tolerance") input').fill("40");
await tapPoint({ x: page.viewportSize().width / 2, y: page.viewportSize().height - 8 }); await sleep(200);
check("tapping elsewhere closes it", await page.locator(".settings-panel").isHidden());

flow("15. Portuguese");
await press(button("PT")); await sleep(300);
check("the app switches over", (await page.title()) === "Treinador de Notas para Violino" && (await button("Praticar").count()) === 1);
for (const screen of ["Ouvir", "Praticar", "Biblioteca", "Registro"]) {
  await tab(screen);
  await auditCheck(page, `pt ${screen}`);
}
await tab("Praticar");
await shot("15-portuguese");
check("Practice is translated", (await button("Iniciar").count()) === 1 && (await page.locator(".mode-note").innerText()).startsWith("Espera cada nota"), await page.locator(".mode-note").innerText());
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
  const needle = await page.locator(".needle").evaluate((element) => Math.round(element.getBoundingClientRect().width));
  check("the needle stays readable with a reading showing", needle >= 60, `${needle}px`);
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
