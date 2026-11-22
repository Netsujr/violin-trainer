import { wav, note, rest } from "./wav.mjs";
import { setRecord, open, seed, nav, start, stop, sleep, check, savedSettings, savedLog, heard, spyOnRecordings, recordings, OUT, openTuning, pickMode, panelButton, sizeOf } from "./lib.mjs";

const hzOf = (t) => Number(t.match(/([\d.]+) Hz/)?.[1]);

// A440 sine. Free play listens on its own, with no Start.
wav(OUT + "a440.wav", [{ hz: 440, seconds: 5, wave: "sine" }]);
{
  const s = await open(OUT + "a440.wav");
  check("free play has no Start", await s.page.locator(".listen-start").isHidden());
  await sleep(1000);
  const readings = [];
  for (let i = 0; i < 40; i++) {
    const text = await s.page.locator("main > section").innerText();
    const hz = hzOf(text);
    if (hz) readings.push(hz);
    await sleep(25);
  }
  const min = Math.min(...readings), max = Math.max(...readings);
  check("A440 reads 440 Hz ±1", min >= 439 && max <= 441, `min ${min} max ${max} n=${readings.length}`);
  const shown = await heard(s.page);
  check("A440 shows on the staff as finger 0, Lá, A", shown === "0 Lá A", shown);
  // Drawn as wide as matches its panel's shape, the sheet fills the panel's height as well as its width, unless that
  // would make its line longer than its notes need, when it fills the height, centred.
  const fit = await s.page.locator(".listen .staff").evaluate((box) => {
    const sheet = box.querySelector("svg").viewBox.baseVal;
    return { box: +(box.clientWidth / box.clientHeight).toFixed(2), sheet: +(sheet.width / sheet.height).toFixed(2), width: sheet.width };
  });
  check("the sheet is the shape of its panel, or as long as its note needs", Math.abs(fit.box - fit.sheet) / fit.box < 0.03 || (fit.width === 300 && fit.sheet < fit.box), JSON.stringify(fit));
  await s.page.screenshot({ path: OUT + "listen-a440.png" });
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Open strings, sawtooth so overtones are present
const OPEN = [[55, "0 Sol G"], [62, "0 Ré D"], [69, "0 Lá A"], [76, "0 Mi E"]];
wav(OUT + "open.wav", OPEN.flatMap(([m]) => [note(m, 1.5), rest(0.5)]));
{
  const s = await open(OUT + "open.wav");
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const big = await heard(s.page);
    if (seen.at(-1)?.big !== big) seen.push({ big, t: Date.now() - t0 });
    await sleep(15);
  }
  const names = seen.map((x) => x.big);
  console.log("  timeline:", seen.map((x) => `${x.big}@${x.t}`).join("  "));
  check("every open string shows", OPEN.every(([, label]) => names.includes(label)));
  check("only the open strings or nothing ever show", names.slice(1).every((n) => n === "" || OPEN.some(([, l]) => l === n)), names.join(", "));
  await s.page.screenshot({ path: OUT + "listen-open.png" });
  await s.close();
}

// Silence
wav(OUT + "silence.wav", [rest(4)]);
{
  const s = await open(OUT + "silence.wav");
  const seen = new Set();
  for (let i = 0; i < 60; i++) { seen.add(await heard(s.page)); await sleep(25); }
  check("silence shows no note", seen.size === 1 && seen.has(""), [...seen].join(","));
  await s.close();
}

// Quiet room noise under the gate, and loud noise over it
{
  const fs = await import("node:fs");
  for (const [name, amp] of [["noise-quiet", 0.015], ["noise-loud", 0.2]]) {
    const header = fs.readFileSync(OUT + "silence.wav").subarray(0, 44);
    const samples = 48000 * 4;
    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round((Math.random() * 2 - 1) * amp * 32767), i * 2);
    header.writeUInt32LE(36 + data.length, 4); header.writeUInt32LE(data.length, 40);
    fs.writeFileSync(OUT + name + ".wav", Buffer.concat([header, data]));
    const s = await open(OUT + name + ".wav");
    await sleep(300);
    const seen = new Set();
    for (let i = 0; i < 100; i++) { seen.add(await heard(s.page)); await sleep(25); }
    check(`${name}: no random notes`, seen.size === 1 && seen.has(""), [...seen].join(","));
    await s.close();
  }
}

// Free play logs the time spent playing once it's left, and a moment's sound not at all.
{
  const s = await open(OUT + "a440.wav");
  await sleep(6000);
  await nav(s.page, "Practice"); await sleep(200);
  const log = await savedLog(s.page);
  check("free play logs the time spent playing when it's left", log.length === 1 && log[0].pieceTitle === "Free play" && log[0].minutes >= 5 / 60, JSON.stringify(log[0]));
  await nav(s.page, "Listen"); await sleep(1000);
  await nav(s.page, "Practice"); await sleep(200);
  check("and a moment's sound isn't logged", (await savedLog(s.page)).length === 1);
  await s.close();
}

// The note guesser and Technique log their time under their own names.
{
  const s = await open(OUT + "a440.wav");
  for (const [mode, title] of [["Note guesser", "Note guesser"], ["Technique", "Technique"]]) {
    await pickMode(s.page, mode);
    await start(s.page);
    await sleep(500);
    await stop(s.page);
    await sleep(100);
  }
  const log = await savedLog(s.page);
  check("the note guesser and Technique are logged by name", log.map((entry) => entry.pieceTitle).join(",") === "Note guesser,Technique", JSON.stringify(log.map((entry) => entry.pieceId)));
  await s.close();
}

// Listen's Progress: the note guesser's and Technique's scores over time, from a chart button hidden in free play.
{
  const s = await open(OUT + "a440.wav");
  const day = (date) => new Date(2026, 10, date, 10).toISOString();
  const game = (date, score) => ({ id: `g${date}`, startedAt: day(date), pieceId: "note-guesser", pieceTitle: "Note guesser", minutes: 2, passes: 0, notesHit: 0, notesSkipped: 0, averageCents: null, averagePassSeconds: null, slowest: [], score, exercise: true });
  await seed(s.page, { settings: { listenMode: "free" }, log: [game(3, 40), game(4, 70)] });
  const chart = s.page.locator(".listen-progress");
  check("free play has no Progress button", await chart.isHidden());
  await pickMode(s.page, "Note guesser");
  await chart.click();
  const text = await s.page.locator(".progress").innerText();
  check("it shows the guesser's score chart, and Technique waiting for a round", text.includes("Listen: progress") && (await s.page.locator(".progress-piece .progress-chart").count()) === 1 && /Not practised yet\s+Technique/.test(text), text.slice(0, 200));
  check("its back button is named for Listen", (await s.page.locator(".progress-back").getAttribute("aria-label")) === "Back to Listen");
  await s.page.click(".progress-back");
  check("its back button returns to Listen", await s.page.locator(".listen").isVisible());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Fullscreen in Listen: no sidebar or settings panel, a bigger staff, and back again.
{
  const s = await open(OUT + "a440.wav");
  const staffWidth = async () => (await s.page.locator(".listen .staff").boundingBox()).width;
  const before = await staffWidth();
  await s.page.click('.listen button[aria-label="Fullscreen"]');
  check("Listen's fullscreen hides the sidebar and the settings panel, and enlarges the staff", (await s.page.locator("header").isHidden()) && (await s.page.locator(".dock").isHidden()) && (await staffWidth()) > before, `${before} → ${await staffWidth()}`);
  const fits = await s.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
  check("and all of Listen fits on the screen, with nothing to scroll", fits, `${await s.page.evaluate(() => document.documentElement.scrollHeight)} > ${await s.page.evaluate(() => innerHeight)}`);
  await s.page.click('.listen button[aria-label="Exit fullscreen"]');
  check("leaving fullscreen brings the header back", await s.page.locator("header").isVisible());
  await s.close();
}

// Recording from Listen, in a mode with a run to record.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { listenMode: "guesser", countInOn: false } });
  await setRecord(s.page, true);
  await start(s.page);
  await s.page.waitForSelector('button:text-is("Stop")');
  await sleep(1500);
  await nav(s.page, "Calendar");
  await s.page.waitForSelector(".recording-note");
  check("Listen can record too, kept in today's Calendar", (await s.page.locator(".day-details .recording-note").count()) === 1);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Note guesser: random notes, made predictable here. Loading and Start each deal a round, D4 then A4, so A440 plays it
// right. The tone stops after 2.5 seconds, and the next round comes 3 seconds after.
const dealDThenA = () => {
  let calls = 0;
  Math.random = () => (calls++ % 2 ? 0.5 : 0);
};
wav(OUT + "a440-short.wav", [{ hz: 440, seconds: 2.5, wave: "sine" }, rest(5)]);
{
  const s = await open(OUT + "a440-short.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", toggles: { fingers: false, noteNames: false, letterNames: false } } });
  const score = () => s.page.locator(".guess-score").innerText();
  const banner = s.page.locator(".guess-banner");
  const staffTop = async () => (await s.page.locator(".listen .staff").boundingBox()).y;
  const before = await staffTop();
  const started = Date.now();
  await start(s.page);
  check("a game is 10 notes", (await score()) === "0 of 10 right", await score());
  await banner.waitFor({ state: "visible", timeout: 8000 });
  const t0 = Date.now();
  check("a note counts only after a second held in tune", t0 - started >= 1000, `${t0 - started} ms`);
  check("the note played right turns blue", (await s.page.locator(".listen .staff .vf-stavenote.right").count()) === 1);
  check("with the toggles off, its note shows unnamed, and the staff stays put as notes start", (await s.page.locator(".listen .staff text[font-family^=Barlow]").count()) === 0 && Math.abs((await staffTop()) - before) < 1, `${before} → ${await staffTop()}`);
  check("a banner over the staff says it's right, holding at 3 while the note still sounds", (await banner.innerText()).startsWith("Right! Next in 3") && (await score()) === "1 of 10 right", `${await banner.innerText()} | ${await score()}`);
  await s.page.screenshot({ path: OUT + "listen-guesser.png" });
  await banner.waitFor({ state: "hidden", timeout: 10000 });
  const waited = Date.now() - t0;
  check("the next note comes 3 seconds after the playing stops", waited >= 3000 && waited < 6500, `${waited} ms`);
  check("and the run goes on listening", await s.page.locator('button:text-is("Stop")').isVisible());
  await stop(s.page);
  await sleep(100);
  const logged = (await savedLog(s.page)).at(-1);
  check("a guesser run logs its score", logged.pieceId === "note-guesser" && logged.exercise && logged.score > 0 && logged.score <= 100, JSON.stringify(logged));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// The guesser's fingerboard, shown from the settings panel: big, taking a row of its own under the staff. Its corner
// button makes it small, giving the staff the room, and with both small they stack. The last panel on can't be hidden.
// Pressing its head takes its tapes off. A brass circle shows where the note to play goes, and, for a note played flat, a ghost and a
// word saying which way to move. With Close enough slid down on the tuner only in tune counts: the dial loses its
// brass at once, and a note 40 cents flat isn't right.
wav(OUT + "a430.wav", [{ hz: 430, seconds: 5, wave: "sine" }]);
{
  const s = await open(OUT + "a430.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", listenPanels: { staff: "big", board: "off", tuner: true }, toggles: { fingers: false, noteNames: false, letterNames: false } } });
  const board = s.page.locator(".fingerboard");
  const tapes = s.page.locator(".fingerboard-head");
  check("the fingerboard is off at first, and so is its tapes switch", (await board.isHidden()) && (await tapes.isHidden()));
  await panelButton(s.page, "Fingerboard").click();
  const box = (selector) => s.page.locator(selector).boundingBox();
  let [staffBox, boardBox] = [await box(".stage-staff"), await box(".stage-board")];
  check("switched on, it's big, a row of its own under the staff, as wide", boardBox.y >= staffBox.y + staffBox.height - 1 && Math.abs(boardBox.width - staffBox.width) < 2, JSON.stringify({ staffBox, boardBox }));
  check("and its button says it's shown, and its corner button that it's big", (await panelButton(s.page, "Fingerboard").getAttribute("aria-pressed")) === "true" && (await sizeOf(s.page, ".stage-board").getAttribute("aria-label")) === "Fingerboard: big" && (await sizeOf(s.page, ".stage-board").getAttribute("aria-pressed")) === "true");
  const staffBig = staffBox.height;
  await sizeOf(s.page, ".stage-board").click();
  [staffBox, boardBox] = [await box(".stage-staff"), await box(".stage-board")];
  check("its corner button makes it small, and the staff plainly grows", (await sizeOf(s.page, ".stage-board").getAttribute("aria-pressed")) === "false" && staffBox.height > staffBig * 1.15, `${Math.round(staffBig)} → ${Math.round(staffBox.height)}`);
  await sizeOf(s.page, ".stage-board").click();
  const tapesShown = () => s.page.evaluate(() => document.querySelector(".fingerboard-tapes").style.display !== "none");
  check("with its tapes on", (await tapesShown()) && (await tapes.getAttribute("aria-pressed")) === "true");
  await tapes.click();
  check("which pressing its head takes off", !(await tapesShown()) && (await tapes.getAttribute("aria-pressed")) === "false");
  const yellowShown = () => s.page.locator(".needle .dial-yellow").evaluate((arc) => arc.style.visibility !== "hidden");
  const loose = await yellowShown();
  await openTuning(s.page);
  await s.page.locator('input[aria-label="Close enough"]').fill("10");
  check("Close enough slid down to in tune is off: the dial's yellow goes at once, and its slider says Off", loose && !(await yellowShown()) && (await s.page.locator('.slide:has(input[aria-label="Close enough"]) output').innerText()) === "Off");
  await s.page.click(".tuner-toggle");
  check("and the gear turns the tuner back, with no yellow", !(await yellowShown()) && (await s.page.locator(".tuner-note").isVisible()));
  await start(s.page);
  await sleep(1800);
  const seen = await s.page.evaluate(() => {
    const [target, heard] = [".fingerboard-target", ".fingerboard-ghost"].map((selector) => document.querySelector(selector));
    return {
      zone: document.querySelector(".needle").dataset.zone,
      yellow: document.querySelector(".needle .dial-yellow").style.visibility,
      hint: document.querySelector(".fingerboard-hint").textContent,
      stroke: target.getAttribute("stroke"),
      dot: heard.style.display !== "none",
    };
  });
  check("yellow off: 40 cents flat reads out, with no yellow on the dial", seen.zone === "out" && seen.yellow === "hidden", JSON.stringify(seen));
  check("the circle stays brass, the ghost shows, and the word says slide down", seen.stroke === "#e6ae48" && seen.dot && seen.hint === "↓ Slide down", JSON.stringify(seen));
  check("and the note isn't counted", (await s.page.locator(".guess-score").innerText()) === "0 of 10 right");
  await s.page.screenshot({ path: OUT + "listen-fingerboard.png" });
  await sizeOf(s.page, ".stage-board").click();
  await sizeOf(s.page, ".stage-staff").click();
  [staffBox, boardBox] = [await box(".stage-staff"), await box(".stage-board")];
  check("both small, with no big one, they stack", boardBox.y >= staffBox.y + staffBox.height - 1 && Math.abs(boardBox.x - staffBox.x) < 2, JSON.stringify({ staffBox, boardBox }));
  await panelButton(s.page, "Staff").click();
  check("the staff hidden leaves the fingerboard alone, with no size button, as it fills the room either way", (await s.page.locator(".stage-staff").isHidden()) && (await board.isVisible()) && (await panelButton(s.page, "Staff").getAttribute("aria-pressed")) === "false" && (await sizeOf(s.page, ".stage-board").isHidden()));
  await panelButton(s.page, "Fingerboard").click();
  check("and the last panel on can't be hidden", (await board.isVisible()) && (await panelButton(s.page, "Fingerboard").getAttribute("aria-pressed")) === "true");
  await panelButton(s.page, "Staff").click();
  check("a panel shown again comes back big", (await sizeOf(s.page, ".stage-staff").getAttribute("aria-pressed")) === "true");
  await panelButton(s.page, "Tuner").click();
  check("the tuner switches off", (await s.page.locator(".stage-tuner").isHidden()) && (await savedSettings(s.page)).listenPanels.tuner === false);
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// A wrong note on another string: D4 against the A string's open A shows as a ghost on the D string, below it, and the
// word says to go up to the A string.
wav(OUT + "d4.wav", [note(62, 5)]);
{
  const s = await open(OUT + "d4.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", listenPanels: { staff: "big", board: "small", tuner: true }, toggles: { fingers: false, noteNames: false, letterNames: false } } });
  await start(s.page);
  await sleep(1500);
  const seen = await s.page.evaluate(() => ({
    hint: document.querySelector(".fingerboard-hint").textContent,
    ghostY: Number(document.querySelector(".fingerboard-ghost").getAttribute("cy")),
    targetY: Number(document.querySelector(".fingerboard-target").getAttribute("cy")),
  }));
  check("a note on another string: its ghost on that string, below the target, and the word says where to go", seen.hint === "↑ A string" && seen.ghostY > seen.targetY, JSON.stringify(seen));
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Nothing moves as modes and toggles change: the title row's buttons stay where they are, and the settings panel stays
// docked at the bottom.
{
  const s = await open(OUT + "a440.wav");
  const where = async () => (await Promise.all([".title-tools", ".dock"].map((selector) => s.page.locator(selector).boundingBox()))).map((box, index) => Math.round(index ? box.y + box.height : box.y)).join(",");
  const first = await where();
  const moved = [];
  for (const mode of ["Note guesser", "Technique", "Free play", "Technique"]) {
    await pickMode(s.page, mode);
    if ((await where()) !== first) moved.push(`${mode}: ${await where()}`);
  }
  for (const toggle of ["Fingers", "Do Ré Mi", "A B C"]) {
    await s.page.click(`.dock button:text-is("${toggle}")`);
    if ((await where()) !== first) moved.push(`${toggle}: ${await where()}`);
  }
  check("the title row's buttons and the settings panel stay put through every mode and label toggle", moved.length === 0, `${first} → ${moved.join(" | ")}`);
  await s.close();
}

// The level: three buttons, Easy, Medium and Hard, with what each draws from under them, and kept. The toggles label
// the notes to play, or not. The guesser switched on before Listen had three modes opens on the guesser.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { guesserOn: true, toggles: { fingers: false, noteNames: false, letterNames: false } } });
  check("an old note guesser switch opens on the note guesser", (await s.page.locator('.nav-sub .sub-item[aria-pressed="true"] .sub-name').innerText()) === "Note guesser");
  const level = (name) => s.page.locator(`.dock [aria-label="Level"] button:text-is("${name}")`);
  const hint = () => s.page.locator('.dock-option:has([aria-label="Level"]) .dock-caption').innerText();
  check("the level starts on Easy, saying what it draws from", (await level("Easy").getAttribute("aria-pressed")) === "true" && (await hint()) === "D and A strings, fingers 0 to 3");
  await level("Hard").click();
  check("Hard is picked and kept, with its own line", (await level("Hard").getAttribute("aria-pressed")) === "true" && (await savedSettings(s.page)).guesserLevel === "hard" && (await hint()) === "Every note in first position");
  const labels = () => s.page.locator(".listen .staff text[font-family^=Barlow]").allTextContents();
  check("with the toggles off, the note to play has no labels", (await labels()).length === 0);
  for (const toggle of ["Fingers", "Do Ré Mi", "A B C"]) await s.page.click(`.dock button:text-is("${toggle}")`);
  const shown = await labels();
  check("the toggles put its finger, name and letter on it", shown.length === 2 && /^H?[0-4]$/.test(shown[0]) && / [A-G]/.test(shown[1]), shown.join(" | "));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique: a third mode, with its own settings in the settings panel, hidden in the other two. The staff shows the
// string's notes.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { toggles: { fingers: true, noteNames: false, letterNames: false } } });
  const modes = await s.page.locator(".nav-sub .sub-name").allInnerTexts();
  check("Listen has three modes, named in the sidebar", modes.join(",") === "Free play,Note guesser,Technique", modes.join(","));
  check("the mode picked is the screen's title", (await s.page.locator(".listen h1").innerText()) === "Free play");
  const row = s.page.locator(".dock");
  const perBow = row.locator('[aria-label="Notes per bow"]');
  check("Technique's settings are hidden in free play", await perBow.isHidden());
  await pickMode(s.page, "Technique");
  check("Technique shows its settings, and hides the guesser's", (await perBow.isVisible()) && (await row.locator('[aria-label="Level"]').isHidden()));
  const pressed = (label) => row.locator(`[aria-label="${label}"] [aria-pressed="true"]`).innerText();
  check("it starts on a long bow on the A string, 4 beats a note", (await pressed("Notes per bow")) === "1" && (await pressed("String")) === "A" && (await pressed("Beats a note")) === "4");
  const fingers = async () => (await s.page.locator(".listen .staff text[font-family^=Barlow]").allTextContents()).filter((text) => /^\d$/.test(text)).join(" ");
  check("the staff shows the open string and fingers 1, 2 and 3", (await fingers()) === "0 1 2 3", await fingers());
  await row.locator('[aria-label="String"] button:text-is("D")').click();
  await row.locator('[aria-label="Beats a note"] button:text-is("8")').click();
  await row.locator('[aria-label="Notes per bow"] button:text-is("3")').click();
  const kept = await savedSettings(s.page);
  check("each choice is kept", kept.bowString === "D" && kept.bowBeats === 8 && kept.bowNotes === 3 && kept.listenMode === "technique", JSON.stringify(kept));
  check("8 beats a note draws as whole notes", (await s.page.locator(".listen .staff .vf-stavenote").count()) >= 4);
  const wide = (await s.page.locator(".listen .staff").boundingBox()).width;
  await pickMode(s.page, "Note guesser");
  check("Technique's staff is as wide as the guesser's, filling its panel", wide === (await s.page.locator(".listen .staff").boundingBox()).width);
  await pickMode(s.page, "Technique");
  await s.page.reload();
  await s.page.waitForSelector('.listen[data-mode="technique"]');
  check("and Listen opens on Technique again", (await perBow.isVisible()) && (await pressed("String")) === "D");
  await pickMode(s.page, "Free play");
  check("free play hides its settings again", await perBow.isHidden());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique, a long bow: nothing moves until the first note's heard in tune, then each note comes once the last has
// been held in tune for its beats, with the pitch line through them, and how steady it was at the end. The A string's
// notes, A, B, C sharp and D, each played a little longer than its two beats at 120 BPM.
wav(OUT + "a-string.wav", [69, 71, 73, 74].map((midi) => ({ hz: 440 * 2 ** ((midi - 69) / 12), seconds: 1.5, wave: "sine" })));
const techniqueRound = { listenMode: "technique", bpm: 120, bowBeats: 2, toggles: { fingers: true, noteNames: false, letterNames: false } };
{
  const s = await open(OUT + "a-string.wav");
  await seed(s.page, { settings: techniqueRound });
  const bows = (await s.page.locator(".listen .staff text[font-family=Bravura]").allTextContents()).map((mark) => ({ "\uE610": "down", "\uE612": "up" })[mark]);
  check("bows alternate down and up, each marked over its note", bows.join(" ") === "down up down up", bows.join(" "));
  check("the volume curve shows in Technique", await s.page.locator(".volume-curve").isVisible());
  check("the label toggles are in the settings panel, and there's no pause", (await s.page.locator('.dock button:text-is("Fingers")').isVisible()) && (await s.page.locator('.dock button:text-is("Before each note")').count()) === 0);
  await start(s.page);
  const statusIs = (text) => s.page.waitForFunction((text) => document.querySelector(".technique-status").textContent.startsWith(text), text, { timeout: 8000 });
  await statusIs("Note 1 of 4 · Down bow");
  await statusIs("Note 2 of 4 · Up bow");
  check("each note in turn, once the last is held, down bow and up", true);
  check("the pitch line runs through the notes", (await s.page.locator(".listen .pitch-trace polyline").count()) > 0);
  await s.page.waitForSelector(".stage-staff .info-chip", { timeout: 12000 });
  const chips = await s.page.locator(".stage-staff .info-chip").allInnerTexts();
  check("a steady tone scores steady, with the time it took against its 4 s of beats", /^Pitch ±[01] cents?$/.test(chips[0]) && /^Volume steady (9\d|100)%$/.test(chips[1]) && /^Took \d+ s for 4 s of beats$/.test(chips[2]), chips.join(" | "));
  await s.page.waitForSelector('button:text-is("Start")', { timeout: 3000 });
  check("the round ends the run, and the results stay", (await s.page.locator(".stage-staff .info-chip").count()) === 3);
  await s.page.screenshot({ path: OUT + "listen-technique.png" });
  await pickMode(s.page, "Free play");
  check("free play hides the volume curve, and the pitch line goes", (await s.page.locator(".volume-curve").isHidden()) && (await s.page.locator(".listen .pitch-trace polyline").count()) === 0);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  const s = await open(OUT + "silence.wav");
  await seed(s.page, { settings: techniqueRound });
  await start(s.page); await sleep(3000);
  check("a silent round waits on its first note", (await s.page.locator(".stage-staff .info-chip").count()) === 0 && (await s.page.locator(".technique-status").innerText()).startsWith("Note 1 of 4"));
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique, slurs: two notes to a bow, each bow marked at its first note with a slur over its notes. The A string's
// notes played straight on are smooth; with a gap after each, every slur breaks.
wav(OUT + "a-string-broken.wav", [69, 71, 73, 74].flatMap((midi) => [{ hz: 440 * 2 ** ((midi - 69) / 12), seconds: 1.5, wave: "sine" }, rest(0.12)]));
for (const [file, expected] of [["a-string.wav", "Smooth slurs 2/2"], ["a-string-broken.wav", "Smooth slurs 0/2"]]) {
  const s = await open(OUT + file);
  await seed(s.page, { settings: { ...techniqueRound, bowNotes: 2 } });
  if (file === "a-string.wav") {
    const bows = (await s.page.locator(".listen .staff text[font-family=Bravura]").allTextContents()).map((mark) => ({ "\uE610": "down", "\uE612": "up" })[mark]);
    check("two notes to a bow: each bow marked once, at its first note", bows.join(" ") === "down up", bows.join(" "));
    check("with a slur over each bow's notes", (await s.page.locator(".listen .staff .vf-slur").count()) === 2);
  }
  await start(s.page);
  await s.page.waitForSelector(".stage-staff .info-chip", { timeout: 15000 });
  const chips = await s.page.locator(".stage-staff .info-chip").allInnerTexts();
  check(`slurs from ${file}: ${expected}`, chips[0] === expected, chips.join(" | "));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Free play's note to copy: a tap on the staff picks the natural note there, silently, and lets the speaker in the
// staff's corner sound it on the violin until pressed again, the staff keeping its size. A second tap takes the note
// away, and the speaker can't be pressed again until there's another, but stays on, so the next note picked sounds.
// Only free play has the speaker.
{
  const s = await open(OUT + "silence.wav");
  await seed(s.page, { settings: { listenMode: "free" } });
  await spyOnRecordings(s.page);
  // The middle line of the staff, found from its drawn lines: B4.
  const middle = await s.page.evaluate(() => {
    const lines = [...document.querySelectorAll(".listen .staff svg path")].map((path) => path.getBoundingClientRect()).filter((r) => r.width > 100 && r.height < 3).sort((a, b) => a.top - b.top);
    const box = document.querySelector(".listen .staff svg").getBoundingClientRect();
    return { x: box.left + box.width * 0.6, y: lines[2].top + lines[2].height / 2 };
  });
  const drawn = () => s.page.locator(".listen .staff .vf-stavenote").count();
  const speaker = s.page.locator(".target-speaker");
  check("with no note picked, the speaker shows but can't be pressed", (await speaker.isVisible()) && (await speaker.isDisabled()));
  const staffBefore = await s.page.locator(".listen .staff svg").boundingBox();
  await s.page.mouse.click(middle.x, middle.y); await sleep(500);
  const staffAfter = await s.page.locator(".listen .staff svg").boundingBox();
  check("a tap on the middle line picks B4, drawn, silently, the speaker now pressable", (await drawn()) === 1 && (await recordings(s.page)).length === 0 && (await speaker.isEnabled()));
  check("and the staff keeps its size", JSON.stringify(staffBefore) === JSON.stringify(staffAfter), `${JSON.stringify(staffBefore)} → ${JSON.stringify(staffAfter)}`);
  await speaker.click(); await sleep(300);
  const played = (await recordings(s.page)).at(-1);
  check("the speaker sounds it on the violin", played?.midi === 71 && !played.stopped && (await speaker.getAttribute("aria-pressed")) === "true", JSON.stringify(played));
  await speaker.click(); await sleep(200);
  check("and pressed again, stops it, keeping the note", (await drawn()) === 1 && (await recordings(s.page)).at(-1).stopped && (await speaker.getAttribute("aria-pressed")) === "false");
  await speaker.click(); await sleep(300);
  await s.page.mouse.click(middle.x, middle.y); await sleep(200);
  // Away from the staff, so the note a tap would pick doesn't show faintly in its place.
  await s.page.mouse.move(5, 5); await sleep(100);
  check("a second tap takes the note away and its sound, and the speaker can't be pressed, but stays on", (await drawn()) === 0 && (await recordings(s.page)).at(-1).stopped && (await speaker.isDisabled()) && (await speaker.getAttribute("aria-pressed")) === "true");
  await s.page.mouse.click(middle.x, middle.y); await sleep(300);
  const next = (await recordings(s.page)).at(-1);
  check("so the next note picked sounds without pressing it again", next?.midi === 71 && !next.stopped, JSON.stringify(next));
  await s.page.mouse.click(middle.x, middle.y); await s.page.mouse.move(5, 5); await sleep(200);
  await pickMode(s.page, "Note guesser");
  check("only free play has the speaker", await speaker.isHidden());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Free play's tuner goes full screen alone from its own button, and comes back with the panels. Only free play has it.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { listenMode: "free" } });
  await s.page.click(".tuner-full-button"); await sleep(300);
  const tuner = await s.page.locator(".stage-tuner").boundingBox();
  check("the tuner's button makes it full screen, alone", (await s.page.evaluate(() => document.documentElement.classList.contains("fullscreen"))) && (await s.page.locator(".stage-staff").isHidden()) && tuner.width > 700, JSON.stringify(tuner));
  await s.page.keyboard.press("Escape"); await sleep(300);
  check("and leaving full screen brings the panels back", (await s.page.locator(".stage-staff").isVisible()) && !(await s.page.evaluate(() => document.documentElement.classList.contains("fullscreen"))));
  await pickMode(s.page, "Technique");
  check("only free play has it", await s.page.locator(".tuner-full-button").isHidden());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// The fingerboard in every mode: in free play it shows the note picked, and in Technique the note to play. A view saved
// for the guesser alone, before Listen had panels, carries over as the staff big and the fingerboard small.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { listenMode: "free", guesserView: "both" } });
  const board = s.page.locator(".fingerboard");
  const target = () => s.page.evaluate(() => { const circle = document.querySelector(".fingerboard-target"); return circle.style.display === "none" ? null : circle.getAttribute("cx") + "," + circle.getAttribute("cy"); });
  check("the guesser's saved view carries over to all of Listen, the fingerboard small under the staff in free play", (await board.isVisible()) && JSON.stringify((await savedSettings(s.page)).listenPanels) === JSON.stringify({ staff: "big", board: "small", tuner: true }));
  const middle = await s.page.evaluate(() => {
    const lines = [...document.querySelectorAll(".listen .staff svg path")].map((path) => path.getBoundingClientRect()).filter((r) => r.width > 100 && r.height < 3).sort((a, b) => a.top - b.top);
    const box = document.querySelector(".listen .staff svg").getBoundingClientRect();
    return { x: box.left + box.width * 0.6, y: lines[2].top + lines[2].height / 2, centre: box.left + box.width / 2 };
  });
  await s.page.mouse.click(middle.x, middle.y); await sleep(300);
  const head = await s.page.locator(".listen .staff .vf-notehead").first().boundingBox();
  check("a note picked sits in the middle of the staff", Math.abs(head.x + head.width / 2 - middle.centre) < 20, JSON.stringify({ head, centre: middle.centre }));
  check("and the fingerboard shows where it's played", (await target()) !== null);
  await pickMode(s.page, "Technique"); await sleep(200);
  check("Technique keeps the fingerboard, showing its first note", (await board.isVisible()) && (await target()) !== null);
  check("the title row has Progress, then Full screen, then Start", await s.page.evaluate(() => {
    const buttons = [...document.querySelector(".listen-start").parentElement.children];
    const [progress, full, start] = [".listen-progress", 'button[aria-label="Fullscreen"]', ".listen-start"].map((selector) => buttons.indexOf(document.querySelector(selector)));
    return progress < full && full < start;
  }));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Free play's pointer over the staff shows, faintly, the note a tap would pick, and nothing once it leaves.
{
  const s = await open(OUT + "silence.wav");
  await seed(s.page, { settings: { listenMode: "free" } });
  const box = await s.page.locator(".listen .staff svg").boundingBox();
  await s.page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55); await sleep(200);
  check("a pointer over the staff shows the note it would pick, faintly", (await s.page.locator(".listen .staff.preview .vf-stavenote").count()) === 1);
  await s.page.mouse.move(5, 5); await sleep(150);
  check("and nothing once it's gone", (await s.page.locator(".listen .staff .vf-stavenote").count()) === 0);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// The note guesser by ear: the notes are hidden, but for the labels as hints, the note sounds on the violin once the
// run starts, and again for a tap on the staff. By eye shows them again.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { listenMode: "guesser", guesserBy: "ear", countInOn: false, toggles: { fingers: true, noteNames: false, letterNames: false } } });
  await spyOnRecordings(s.page);
  const shown = () => s.page.locator(".listen .staff .vf-stavenote").evaluateAll((notes) => notes.filter((note) => getComputedStyle(note).visibility !== "hidden").length);
  check("by ear, the note isn't shown, but its finger is, as a hint", (await shown()) === 0 && (await s.page.locator(".listen .staff svg > text").count()) === 1);
  await start(s.page); await sleep(800);
  check("Start sounds it on the violin", (await recordings(s.page)).length === 1);
  await s.page.locator(".listen .staff").click(); await sleep(300);
  check("and a tap on the staff sounds it again", (await recordings(s.page)).length === 2);
  await s.page.click('.dock [aria-label="Guess by"] button:text-is("Eye")'); await sleep(200);
  check("by eye shows the note, and is saved", (await shown()) === 1 && (await savedSettings(s.page)).guesserBy === "eye");
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// By ear, a note not yet found sounds again each time the player's been quiet a while.
wav(OUT + "silent-listen.wav", [rest(10)]);
{
  const s = await open(OUT + "silent-listen.wav");
  await seed(s.page, { settings: { listenMode: "guesser", guesserBy: "ear", countInOn: false } });
  await spyOnRecordings(s.page);
  await start(s.page); await sleep(1000);
  const first = (await recordings(s.page)).length;
  await sleep(4500);
  check("by ear, a quiet player hears the note again, until it's found", first === 1 && (await recordings(s.page)).length === 2, `${first} → ${(await recordings(s.page)).length}`);
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
