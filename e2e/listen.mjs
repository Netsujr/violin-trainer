import { wav, note, rest } from "./wav.mjs";
import { setRecord, open, seed, nav, start, stop, sleep, check, savedSettings, heard, OUT } from "./lib.mjs";

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

// Note guesser: random notes, made predictable here. Loading and Start each deal a round, D4 then A4, so A440 plays it right.
const dealDThenA = () => {
  let calls = 0;
  Math.random = () => (calls++ % 2 ? 0.5 : 0);
};
{
  const s = await open(OUT + "a440.wav");
  await s.page.addInitScript(dealDThenA);
  await seed(s.page, { settings: { countInOn: false, listenMode: "guesser", toggles: { fingers: false, noteNames: false, letterNames: false } } });
  const score = () => s.page.locator(".guess-score").innerText();
  const staffTop = async () => (await s.page.locator(".listen > .staff").boundingBox()).y;
  const before = await staffTop();
  await start(s.page);
  check("a game is 10 notes", (await score()) === "0 of 10", await score());
  await s.page.waitForFunction(() => document.querySelector(".guess-score").textContent.startsWith("Right! Next in 5"), null, { timeout: 8000 });
  const t0 = Date.now();
  check("with the toggles off, its note shows unnamed, and the staff stays put as notes start", (await s.page.locator(".listen .staff text[font-family^=system-ui]").count()) === 0 && Math.abs((await staffTop()) - before) < 1, `${before} → ${await staffTop()}`);
  await s.page.waitForFunction(() => document.querySelector(".guess-score").textContent === "1 of 10", null, { timeout: 9000 });
  const waited = Date.now() - t0;
  check("the next note comes 5 seconds after one played right", waited >= 4500 && waited < 7000, `${waited} ms`);
  await s.page.screenshot({ path: OUT + "listen-guesser.png" });
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// The level: one button stepping through Easy, Medium and Hard, and kept. The toggles label the notes to play, or not.
// The guesser switched on before Listen had three modes opens on the guesser.
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { guesserOn: true, toggles: { fingers: false, noteNames: false, letterNames: false } } });
  check("an old note guesser switch opens on the note guesser", (await s.page.locator('.listen-modes button[aria-pressed="true"]').innerText()) === "Note guesser");
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
  const modes = await s.page.locator(".listen-modes button").allInnerTexts();
  check("Listen has three modes", modes.join(",") === "Free play,Note guesser,Technique", modes.join(","));
  const row = s.page.locator(".technique");
  check("the technique row is hidden in free play", await row.isHidden());
  await s.page.click('.listen-modes button:text-is("Technique")');
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
  await s.page.reload();
  await s.page.waitForSelector(".technique");
  check("and Listen opens on Technique again", (await row.isVisible()) && (await pressed("String")) === "D");
  await s.page.click('.listen-modes button:text-is("Free play")');
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
  check("so does the metronome switch", await s.page.locator('.technique .icon-switch[title="Metronome"]').isVisible());
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
  await s.page.waitForSelector('button:text-is("Start")', { timeout: 3000 });
  check("the round ends the run, and the results stay", (await s.page.locator(".technique .info-chip").count()) === 3);
  await s.page.screenshot({ path: OUT + "listen-technique.png" });
  await s.page.click('.listen-modes button:text-is("Free play")');
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
