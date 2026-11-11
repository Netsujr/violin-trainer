import { wav, note, rest } from "./wav.mjs";
import { setRecord, open, nav, start, stop, sleep, check, OUT } from "./lib.mjs";

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
  const big = await s.page.locator(".big-note").innerText();
  check("A440 shows Lá4 / A4", big === "Lá4 / A4", big);
  const pos = await s.page.locator("section > p").first().innerText();
  check("A4 string guess is open A", pos.includes("A string, finger 0"), pos);
  await s.page.screenshot({ path: OUT + "listen-a440.png" });
  check("no page errors", s.problems.length === 0, s.problems.join(" | "));
  await s.close();
}

// Open strings, sawtooth so overtones are present
const OPEN = [[55, "Sol3 / G3"], [62, "Ré4 / D4"], [69, "Lá4 / A4"], [76, "Mi5 / E5"]];
wav(OUT + "open.wav", OPEN.flatMap(([m]) => [note(m, 1.5), rest(0.5)]));
{
  const s = await open(OUT + "open.wav");
  await start(s.page);
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const big = await s.page.locator(".big-note").innerText();
    if (seen.at(-1)?.big !== big) seen.push({ big, t: Date.now() - t0 });
    await sleep(15);
  }
  const names = seen.map((x) => x.big);
  console.log("  timeline:", seen.map((x) => `${x.big}@${x.t}`).join("  "));
  check("every open string shows", OPEN.every(([, label]) => names.includes(label)));
  check("only the open strings or Listening ever show", names.slice(1).every((n) => n === "Listening…" || OPEN.some(([, l]) => l === n)), names.join(", "));
  await s.page.screenshot({ path: OUT + "listen-open.png" });
  await s.close();
}

// Silence
wav(OUT + "silence.wav", [rest(4)]);
{
  const s = await open(OUT + "silence.wav");
  await start(s.page);
  const seen = new Set();
  for (let i = 0; i < 60; i++) { seen.add(await s.page.locator(".big-note").innerText()); await sleep(25); }
  seen.delete("Press Start and play"); check("silence shows Listening…", seen.size === 1 && seen.has("Listening…"), [...seen].join(","));
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
    for (let i = 0; i < 100; i++) { seen.add(await s.page.locator(".big-note").innerText()); await sleep(25); }
    check(`${name}: no random notes`, seen.size === 1 && seen.has("Listening…"), [...seen].join(","));
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
