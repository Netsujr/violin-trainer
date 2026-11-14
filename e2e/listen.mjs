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
  await seed(s.page, { settings: { countInOn: false, guesserOn: true, toggles: { fingers: false, noteNames: false, letterNames: false } } });
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
{
  const s = await open(OUT + "a440.wav");
  await seed(s.page, { settings: { guesserOn: true, toggles: { fingers: false, noteNames: false, letterNames: false } } });
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
