import { wav, note, rest } from "./wav.mjs";
import { setRecord, open, seed, nav, start, stop, sleep, check, savedSettings, savedLog, heard, OUT } from "./lib.mjs";

const hzOf = (t) => Number(t.match(/([\d.]+) Hz/)?.[1]);

// A440 sine
wav(OUT + "a440.wav", [{ hz: 440, seconds: 5, wave: "sine" }]);
{
  const s = await open(OUT + "a440.wav");
  await start(s.page);
  await sleep(1000);
  const readings = [];
  for (let i = 0; i < 40; i++) {
    const text = await s.page.locator("section").innerText();
    const hz = hzOf(text);
    if (hz) readings.push(hz);
    await sleep(25);
  }
  const min = Math.min(...readings), max = Math.max(...readings);
  check("A440 reads 440 Hz ±1", min >= 439 && max <= 441, `min ${min} max ${max} n=${readings.length}`);
  const shown = await heard(s.page);
  check("A440 shows on the staff as finger 0, Lá, A", shown === "0 Lá A", shown);
  const staff = await s.page.locator(".listen .staff svg").boundingBox();
  check("the staff is a fifth larger than its 300-unit sheet", staff.width >= 360, `${staff.width}px`);
  await s.page.screenshot({ path: OUT + "listen-a440.png" });
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Open strings, sawtooth so overtones are present
const OPEN = [[55, "0 Sol G"], [62, "0 Ré D"], [69, "0 Lá A"], [76, "0 Mi E"]];
wav(OUT + "open.wav", OPEN.flatMap(([m]) => [note(m, 1.5), rest(0.5)]));
{
  const s = await open(OUT + "open.wav");
  await start(s.page);
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
  await start(s.page);
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
    await start(s.page);
    await sleep(300);
    const seen = new Set();
    for (let i = 0; i < 100; i++) { seen.add(await heard(s.page)); await sleep(25); }
    check(`${name}: no random notes`, seen.size === 1 && seen.has(""), [...seen].join(","));
    await s.close();
  }
}

// Stop, logged session
{
  const s = await open(OUT + "a440.wav");
  await start(s.page);
  await sleep(500);
  await stop(s.page);
  await sleep(100);
  const log = await s.page.evaluate(() => JSON.parse(localStorage.getItem("log")));
  check("Listen writes a log entry on Stop", log.length === 1 && log[0].pieceTitle === "Free play", JSON.stringify(log[0]));
  await s.close();
}

// The note guesser and Technique log their time under their own names.
{
  const s = await open(OUT + "a440.wav");
  for (const [mode, title] of [["Note guesser", "Note guesser"], ["Technique", "Technique"]]) {
    await s.page.click(`.listen-modes button[aria-label="${mode}"]`);
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
  const chart = s.page.locator('.listen button[aria-label="Listen: progress"]');
  check("free play has no progress button", await chart.isHidden());
  await s.page.click('.listen-modes button[aria-label="Note guesser"]');
  await chart.click();
  const text = await s.page.locator(".progress").innerText();
  check("it shows the guesser's score chart, and Technique waiting for a round", text.includes("Listen: progress") && (await s.page.locator(".progress-piece .progress-chart").count()) === 1 && text.includes("Not practised yet: Technique"), text.slice(0, 200));
  await s.page.click('.progress button:text-is("‹ Listen")');
  check("its back button returns to Listen", await s.page.locator(".listen").isVisible());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique's count-in covers the screen, fading as it counts down, then goes.
{
  const s = await open(OUT + "a440.wav", undefined, { keepCountIn: true });
  await seed(s.page, { settings: { listenMode: "technique", countInOn: true, countInBeats: 2, metronomeOn: false } });
  await start(s.page);
  const overlay = s.page.locator(".listen .countdown");
  await overlay.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  const box = await overlay.boundingBox();
  check("the count-in covers the screen", box !== null && box.width >= 1000 && box.height >= 900, JSON.stringify(box));
  await overlay.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  check("and goes when the first note starts", await overlay.isHidden());
  await stop(s.page);
  await s.close();
}

// Fullscreen in Listen: no header, a bigger staff, and back again.
{
  const s = await open(OUT + "a440.wav");
  const staffWidth = async () => (await s.page.locator(".listen .staff").boundingBox()).width;
  const before = await staffWidth();
  await s.page.click('.listen button[aria-label="Fullscreen"]');
  check("Listen's fullscreen hides the header and enlarges the staff", (await s.page.locator("header").isHidden()) && (await staffWidth()) > before, `${before} → ${await staffWidth()}`);
  const fits = await s.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
  check("and all of Listen fits on the screen, with nothing to scroll", fits, `${await s.page.evaluate(() => document.documentElement.scrollHeight)} > ${await s.page.evaluate(() => innerHeight)}`);
  await s.page.click('.listen button[aria-label="Exit fullscreen"]');
  check("leaving fullscreen brings the header back", await s.page.locator("header").isVisible());
  await s.close();
}

// Recording from Listen
{
  const s = await open(OUT + "a440.wav");
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
  check("a game is 10 notes", (await score()) === "0 of 10", await score());
  await banner.waitFor({ state: "visible", timeout: 8000 });
  const t0 = Date.now();
  check("a note counts only after a second held in tune", t0 - started >= 1000, `${t0 - started} ms`);
  check("the note played right turns green", (await s.page.locator(".listen .staff .vf-stavenote.right").count()) === 1);
  check("with the toggles off, its note shows unnamed, and the staff stays put as notes start", (await s.page.locator(".listen .staff text[font-family^=system-ui]").count()) === 0 && Math.abs((await staffTop()) - before) < 1, `${before} → ${await staffTop()}`);
  check("a banner over the staff says it's right, holding at 3 while the note still sounds", (await banner.innerText()).startsWith("Right! Next in 3") && (await score()) === "1 of 10", `${await banner.innerText()} | ${await score()}`);
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

// The guesser's fingerboard: one button steps from the staff alone to the fingerboard beside it, as tall, then the
// fingerboard alone, the stage keeping its height. Its head is the tapes switch, a red circle
// where the note to play goes, and, for a note played flat, a ghost and a word saying which way to move. With yellow
// switched off in Settings only green counts: the needle loses its yellow at once, and a note 40 cents flat isn't right.
wav(OUT + "a430.wav", [{ hz: 430, seconds: 5, wave: "sine" }]);
{
  const s = await open(OUT + "a430.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", toggles: { fingers: false, noteNames: false, letterNames: false } } });
  const board = s.page.locator(".fingerboard");
  check("the fingerboard is off at first, and so is its tapes switch", (await board.isHidden()) && (await s.page.locator('.fingerboard button[aria-label="Finger tapes"]').isHidden()));
  await s.page.click('.guesser button[aria-label="Staff"]');
  const staffBox = await s.page.locator(".listen .staff svg").boundingBox();
  const boardBox = await board.boundingBox();
  check("switched on, it sits beside the staff, as tall", boardBox.x >= staffBox.x + staffBox.width - 1 && Math.abs(boardBox.height - staffBox.height) < 2, JSON.stringify({ staffBox, boardBox }));
  const tapesShown = () => s.page.evaluate(() => document.querySelector(".fingerboard-tapes").style.display !== "none");
  const headLit = async () => (await s.page.locator(".fingerboard-head.lit").count()) === 1;
  check("with its tapes on, and its head lit", (await tapesShown()) && (await headLit()));
  await s.page.click('.fingerboard button[aria-label="Finger tapes"]');
  check("which a press on its head takes off, the head going dark", !(await tapesShown()) && !(await headLit()));
  const needleTolerance = () => s.page.evaluate(() => document.documentElement.style.getPropertyValue("--tolerance"));
  const loose = await needleTolerance();
  await s.page.click("header summary");
  await s.page.click("button.zone.yellow");
  check("yellow off takes the needle's yellow away at once, and hides its slider", loose === "40%" && (await needleTolerance()) === "10%" && (await s.page.locator('input[aria-label="Close enough"]').isHidden()), `${loose} → ${await needleTolerance()}`);
  await s.page.click("header summary");
  await start(s.page);
  await sleep(1800);
  const seen = await s.page.evaluate(() => {
    const [target, heard] = [".fingerboard-target", ".fingerboard-ghost"].map((selector) => document.querySelector(selector));
    return {
      zone: document.querySelector(".needle").dataset.zone,
      tolerance: document.documentElement.style.getPropertyValue("--tolerance"),
      hint: document.querySelector(".fingerboard-hint").textContent,
      stroke: target.getAttribute("stroke"),
      dot: heard.style.display !== "none",
    };
  });
  check("yellow off: 40 cents flat reads out, with no yellow on the needle", seen.zone === "out" && seen.tolerance === "10%", JSON.stringify(seen));
  check("the circle stays red, the ghost shows, and the word says slide down", seen.stroke === "#d62828" && seen.dot && seen.hint === "↓ Slide down", JSON.stringify(seen));
  check("and the note isn't counted", (await s.page.locator(".guess-score").innerText()) === "0 of 10");
  await s.page.screenshot({ path: OUT + "listen-fingerboard.png" });
  const stageHeight = async () => (await s.page.locator(".listen-stage").boundingBox()).height;
  const bothHeight = await stageHeight();
  await s.page.click('.guesser button[aria-label="Staff and fingerboard"]');
  check("next, the fingerboard alone, the stage as tall", (await s.page.locator(".stage-sheet").isHidden()) && (await board.isVisible()) && Math.abs((await stageHeight()) - bothHeight) < 2);
  await s.page.click('.guesser button[aria-label="Fingerboard"]');
  check("then back to the staff alone", (await s.page.locator(".stage-sheet").isVisible()) && (await board.isHidden()));
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// A wrong note on another string: D4 against the A string's open A shows as a ghost on the D string, and the word
// says to go across to the A string.
wav(OUT + "d4.wav", [note(62, 5)]);
{
  const s = await open(OUT + "d4.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", guesserView: "both", toggles: { fingers: false, noteNames: false, letterNames: false } } });
  await start(s.page);
  await sleep(1500);
  const seen = await s.page.evaluate(() => ({
    hint: document.querySelector(".fingerboard-hint").textContent,
    ghostX: Number(document.querySelector(".fingerboard-ghost").getAttribute("cx")),
    targetX: Number(document.querySelector(".fingerboard-target").getAttribute("cx")),
  }));
  check("a note on another string: its ghost on that string, left of the target, and the word says where to go", seen.hint === "A string →" && seen.ghostX < seen.targetX, JSON.stringify(seen));
  await stop(s.page);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Nothing moves as modes and toggles change: the needle and the Start button stay where they are.
{
  const s = await open(OUT + "a440.wav");
  const where = async () => (await Promise.all([".needle", ".listen-start"].map((selector) => s.page.locator(selector).boundingBox()))).map((box) => Math.round(box.y)).join(",");
  const first = await where();
  const moved = [];
  for (const mode of ["Note guesser", "Technique", "Free play", "Technique"]) {
    await s.page.click(`.listen-modes button[aria-label="${mode}"]`);
    if ((await where()) !== first) moved.push(`${mode}: ${await where()}`);
  }
  for (const toggle of ["Fingers", "Note names (Do Ré Mi)", "Letter names (A G D)"]) {
    await s.page.click(`.listen .toggles button[aria-label="${toggle}"]`);
    if ((await where()) !== first) moved.push(`${toggle}: ${await where()}`);
  }
  check("the needle and Start stay put through every mode and label toggle", moved.length === 0, `${first} → ${moved.join(" | ")}`);
  await s.close();
}

// The level: one button stepping through Easy, Medium and Hard, and kept. The toggles label the notes to play, or not.
// The guesser switched on before Listen had three modes opens on the guesser.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { guesserOn: true, toggles: { fingers: false, noteNames: false, letterNames: false } } });
  check("an old note guesser switch opens on the note guesser", (await s.page.locator('.listen-modes button[aria-pressed="true"]').getAttribute("aria-label")) === "Note guesser");
  const level = s.page.locator(".guess-level");
  check("the level starts on Easy", (await level.innerText()) === "Easy");
  await level.click();
  await level.click();
  check("pressing it steps through Medium to Hard, kept", (await level.innerText()) === "Hard" && (await savedSettings(s.page)).guesserLevel === "hard");
  await level.click();
  check("and round to Easy again", (await level.innerText()) === "Easy");
  const labels = () => s.page.locator(".listen .staff text[font-family^=system-ui]").allTextContents();
  check("with the toggles off, the note to play has no labels", (await labels()).length === 0);
  for (const toggle of ["Fingers", "Note names", "Letter names"]) await s.page.click(`.listen button[aria-label^="${toggle}"]`);
  const shown = await labels();
  check("the toggles put its finger, name and letter on it", shown.length === 2 && /^[0-4]$/.test(shown[0]) && / [A-G]/.test(shown[1]), shown.join(" | "));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique: a third mode, with its own row of chips, hidden in the other two. The staff shows the string's notes.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { toggles: { fingers: true, noteNames: false, letterNames: false } } });
  const modes = await s.page.locator(".listen-modes button").evaluateAll((buttons) => buttons.map((button) => button.ariaLabel));
  check("Listen has three modes, as icons", modes.join(",") === "Free play,Note guesser,Technique", modes.join(","));
  check("the mode picked is named under the needle", (await s.page.locator(".listen-mode-title").innerText()) === "Free play");
  const row = s.page.locator(".technique");
  check("the technique row is hidden in free play", await row.isHidden());
  await s.page.click('.listen-modes button[aria-label="Technique"]');
  check("Technique shows its row, and hides the guesser's", (await row.isVisible()) && (await s.page.locator(".guesser").isHidden()));
  const pressed = (label) => row.locator(`[aria-label="${label}"] [aria-pressed="true"]`).innerText();
  check("it starts on a long bow on the A string, 4 beats a note", (await pressed("Notes per bow")) === "1" && (await pressed("String")) === "A" && (await pressed("Beats per note")) === "4");
  const fingers = async () => (await s.page.locator(".listen .staff text[font-family^=system-ui]").allTextContents()).filter((text) => /^\d$/.test(text)).join(" ");
  check("the staff shows the open string and fingers 1, 2 and 3", (await fingers()) === "0 1 2 3", await fingers());
  await row.locator('[aria-label="String"] button:text-is("D")').click();
  await row.locator('[aria-label="Beats per note"] button:text-is("8")').click();
  await row.locator('[aria-label="Notes per bow"] button:text-is("3")').click();
  const kept = await savedSettings(s.page);
  check("each choice is kept", kept.bowString === "D" && kept.bowBeats === 8 && kept.bowNotes === 3 && kept.listenMode === "technique", JSON.stringify(kept));
  check("8 beats a note draws as whole notes", (await s.page.locator(".listen .staff .vf-stavenote").count()) >= 4);
  // A pause before each note: only for a long bow, a rest after each note, and no beats to pick.
  const pause = s.page.locator('.stage-pause button[title^="Pause before each note"]');
  check("the pause switch is hidden with three notes to a bow", await pause.isHidden());
  await row.locator('[aria-label="Notes per bow"] button:text-is("1")').click();
  await pause.click();
  const drawn = await s.page.locator(".listen .staff .vf-stavenote").count();
  check("with it on, a rest comes between each of its six notes, and the beats are hidden", drawn === 11 && (await row.locator('[aria-label="Beats per note"]').isHidden()), `${drawn} drawn`);
  const wide = (await s.page.locator(".listen .staff").boundingBox()).width;
  await s.page.click('.listen-modes button[aria-label="Note guesser"]');
  check("Technique's staff is wider than the guesser's, for its eight notes' names", wide > (await s.page.locator(".listen .staff").boundingBox()).width);
  await s.page.click('.listen-modes button[aria-label="Technique"]');
  await s.page.reload();
  await s.page.waitForSelector(".technique");
  check("and Listen opens on Technique again", (await row.isVisible()) && (await pressed("String")) === "D");
  await s.page.click('.listen-modes button[aria-label="Free play"]');
  check("free play hides the row again", await row.isHidden());
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique, a long bow: a count-in, then each note for its beats, with the pitch line through them, and how steady
// it was at the end. A steady A440 is steady whatever the note.
const techniqueRound = { listenMode: "technique", bpm: 120, countInBeats: 2, bowBeats: 2, toggles: { fingers: true, noteNames: false, letterNames: false } };
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: techniqueRound });
  const bows = (await s.page.locator(".listen .staff text[font-family=Bravura]").allTextContents()).map((mark) => ({ "\uE610": "down", "\uE612": "up" })[mark]);
  check("bows alternate down and up, each marked over its note", bows.join(" ") === "down up down up", bows.join(" "));
  check("the volume curve shows in Technique", await s.page.locator(".volume-curve").isVisible());
  check("its pause switch sits in the staff's top right corner, and the label toggles in its top left", await s.page.evaluate(() => {
    const [staff, pause, labels] = [".listen .staff", ".stage-pause", ".stage-labels"].map((selector) => document.querySelector(selector).getBoundingClientRect());
    return Math.abs(pause.right - staff.right) < 12 && Math.abs(labels.left - staff.left) < 12 && pause.top - staff.top < 12 && labels.top - staff.top < 12;
  }));
  await start(s.page);
  const statusIs = (text) => s.page.waitForFunction((text) => document.querySelector(".technique-status").textContent.startsWith(text), text, { timeout: 4000 });
  await statusIs("Starts in");
  await statusIs("Note 1 of 4 · Down bow");
  await statusIs("Note 2 of 4 · Up bow");
  check("a count-in, then each note in turn, down bow and up", true);
  check("the pitch line runs through the notes", (await s.page.locator(".listen .pitch-trace polyline").count()) > 0);
  await s.page.waitForSelector(".technique .info-chip", { timeout: 6000 });
  const chips = await s.page.locator(".technique .info-chip").allInnerTexts();
  check("a steady tone scores steady, and held throughout", /^Pitch ±[01] cents?$/.test(chips[0]) && /^Volume steady (9\d|100)%$/.test(chips[1]) && chips[2] === "Held 8/8 beats", chips.join(" | "));
  check("a tone that never moves to the next note has no note changes to time", chips[3] === "Note changes not heard", chips.join(" | "));
  await s.page.waitForSelector('button:text-is("Start")', { timeout: 3000 });
  check("the round ends the run, and the results stay", (await s.page.locator(".technique .info-chip").count()) === 4);
  await s.page.screenshot({ path: OUT + "listen-technique.png" });
  await s.page.click('.listen-modes button[aria-label="Free play"]');
  check("free play hides the volume curve, and the pitch line goes", (await s.page.locator(".volume-curve").isHidden()) && (await s.page.locator(".listen .pitch-trace polyline").count()) === 0);
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
{
  const s = await open(OUT + "silence.wav");
  await seed(s.page, { settings: techniqueRound });
  await start(s.page);
  await s.page.waitForSelector(".technique .info-chip", { timeout: 9000 });
  const chips = await s.page.locator(".technique .info-chip").allInnerTexts();
  check("a silent round says nothing was heard", chips.join() === "Nothing heard", chips.join(" | "));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Technique, slurs: two notes to a bow, each bow marked at its first note with a slur over its notes. A steady A440 is
// in tune only on its own note, and smooth. A tone that breaks off every second breaks every slur.
wav(OUT + "broken.wav", Array.from({ length: 8 }, () => [{ hz: 440, seconds: 1, wave: "sine" }, rest(0.12)]).flat());
for (const [file, expected] of [["a440.wav", ["In tune 1/4", "Smooth slurs 2/2", "Held 8/8 beats"]], ["broken.wav", [null, "Smooth slurs 0/2"]]]) {
  const s = await open(OUT + file);
  await seed(s.page, { settings: { ...techniqueRound, bowNotes: 2 } });
  if (file === "a440.wav") {
    const bows = (await s.page.locator(".listen .staff text[font-family=Bravura]").allTextContents()).map((mark) => ({ "\uE610": "down", "\uE612": "up" })[mark]);
    check("two notes to a bow: each bow marked once, at its first note", bows.join(" ") === "down up", bows.join(" "));
    check("with a slur over each bow's notes", (await s.page.locator(".listen .staff .vf-slur").count()) === 2);
  }
  await start(s.page);
  await s.page.waitForSelector(".technique .info-chip", { timeout: 9000 });
  const chips = await s.page.locator(".technique .info-chip").allInnerTexts();
  check(`slurs from ${file}: ${expected.filter(Boolean).join(", ")}`, expected.every((chip, index) => chip === null || chips[index] === chip), chips.join(" | "));
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}
